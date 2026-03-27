/**
 * 文档索引与检索系统
 * @author cppcc-2 (后端专家)
 * @version 1.0
 * @updated 2026-03-27
 * 
 * 功能：
 * - 建立文档索引
 * - 全文检索
 * - 分类归档
 * - 标签管理
 */

const fs = require('fs');
const path = require('path');

const INDEX_DIR = path.join(__dirname, '..', 'meetings', 'index');
const DOCUMENTS_DIR = path.join(__dirname, '..', 'meetings', 'documents');

function ensureIndexDir() {
  if (!fs.existsSync(INDEX_DIR)) fs.mkdirSync(INDEX_DIR, { recursive: true });
  if (!fs.existsSync(DOCUMENTS_DIR)) fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
}

/**
 * 添加文档到索引
 */
function indexDocument(doc) {
  ensureIndexDir();
  
  const indexEntry = {
    meetingId: doc.metadata.meetingId,
    docNumber: doc.docNumber,
    type: doc.type,
    level: doc.level,
    topic: doc.metadata.topic,
    keywords: doc.metadata.keywords || [],
    createdAt: doc.metadata.createdAt,
    status: doc.metadata.status,
    // 文件路径
    filePath: `${doc.metadata.meetingId}-${doc.level.toLowerCase()}.json`,
    // 可检索文本
    searchableText: doc.searchableText || ''
  };
  
  // 保存到索引文件
  const indexPath = path.join(INDEX_DIR, `${doc.metadata.meetingId}-index.json`);
  fs.writeFileSync(indexPath, JSON.stringify(indexEntry, null, 2), 'utf-8');
  
  // 更新总索引
  updateMasterIndex(indexEntry);
  
  return indexPath;
}

/**
 * 更新总索引
 */
function updateMasterIndex(entry) {
  const masterIndexPath = path.join(INDEX_DIR, 'master-index.json');
  let masterIndex = { documents: [], lastUpdated: new Date().toISOString() };
  
  if (fs.existsSync(masterIndexPath)) {
    try {
      masterIndex = JSON.parse(fs.readFileSync(masterIndexPath, 'utf-8'));
    } catch (e) {
      // 文件损坏，重建
    }
  }
  
  // 更新或添加条目
  const existingIdx = masterIndex.documents.findIndex(d => d.meetingId === entry.meetingId);
  if (existingIdx >= 0) {
    masterIndex.documents[existingIdx] = entry;
  } else {
    masterIndex.documents.push(entry);
  }
  
  masterIndex.lastUpdated = new Date().toISOString();
  fs.writeFileSync(masterIndexPath, JSON.stringify(masterIndex, null, 2), 'utf-8');
}

/**
 * 检索文档
 */
function searchDocuments(query, options = {}) {
  const masterIndexPath = path.join(INDEX_DIR, 'master-index.json');
  if (!fs.existsSync(masterIndexPath)) return [];
  
  const masterIndex = JSON.parse(fs.readFileSync(masterIndexPath, 'utf-8'));
  const queryLower = query.toLowerCase();
  
  const results = masterIndex.documents.filter(doc => {
    // 全文检索
    const textMatch = doc.searchableText?.toLowerCase().includes(queryLower);
    
    // 关键词匹配
    const keywordMatch = doc.keywords?.some(k => k.toLowerCase().includes(queryLower));
    
    // 议题匹配
    const topicMatch = doc.topic?.toLowerCase().includes(queryLower);
    
    // 状态过滤
    const statusMatch = !options.status || doc.status === options.status;
    
    // 层级过滤
    const levelMatch = !options.level || doc.level === options.level;
    
    return (textMatch || keywordMatch || topicMatch) && statusMatch && levelMatch;
  });
  
  // 按相关性排序
  results.sort((a, b) => {
    let scoreA = 0, scoreB = 0;
    
    if (a.topic?.toLowerCase().includes(queryLower)) scoreA += 10;
    if (a.keywords?.some(k => k.toLowerCase().includes(queryLower))) scoreA += 5;
    if (a.searchableText?.toLowerCase().includes(queryLower)) scoreA += 1;
    
    if (b.topic?.toLowerCase().includes(queryLower)) scoreB += 10;
    if (b.keywords?.some(k => k.toLowerCase().includes(queryLower))) scoreB += 5;
    if (b.searchableText?.toLowerCase().includes(queryLower)) scoreB += 1;
    
    return scoreB - scoreA;
  });
  
  return results;
}

/**
 * 按标签检索
 */
function searchByTags(tags) {
  const masterIndexPath = path.join(INDEX_DIR, 'master-index.json');
  if (!fs.existsSync(masterIndexPath)) return [];
  
  const masterIndex = JSON.parse(fs.readFileSync(masterIndexPath, 'utf-8'));
  
  return masterIndex.documents.filter(doc => {
    const docTags = doc.keywords || [];
    return tags.every(tag => docTags.includes(tag));
  });
}

/**
 * 获取某会议的所有文档
 */
function getMeetingDocuments(meetingId) {
  const indexPath = path.join(INDEX_DIR, `${meetingId}-index.json`);
  if (!fs.existsSync(indexPath)) return null;
  
  const indexEntry = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  
  // 加载各层级文档
  const documents = {};
  const levels = ['L1', 'L2', 'L3', 'L4'];
  
  levels.forEach(level => {
    const docPath = path.join(DOCUMENTS_DIR, `${meetingId}-${level.toLowerCase()}.json`);
    if (fs.existsSync(docPath)) {
      documents[level] = JSON.parse(fs.readFileSync(docPath, 'utf-8'));
    }
  });
  
  return {
    index: indexEntry,
    documents
  };
}

/**
 * 列出所有会议
 */
function listMeetings(options = {}) {
  const masterIndexPath = path.join(INDEX_DIR, 'master-index.json');
  if (!fs.existsSync(masterIndexPath)) return [];
  
  const masterIndex = JSON.parse(fs.readFileSync(masterIndexPath, 'utf-8'));
  
  let meetings = masterIndex.documents;
  
  // 状态过滤
  if (options.status) {
    meetings = meetings.filter(m => m.status === options.status);
  }
  
  // 时间范围过滤
  if (options.fromDate) {
    const fromDate = new Date(options.fromDate);
    meetings = meetings.filter(m => new Date(m.createdAt) >= fromDate);
  }
  
  if (options.toDate) {
    const toDate = new Date(options.toDate);
    meetings = meetings.filter(m => new Date(m.createdAt) <= toDate);
  }
  
  // 排序
  if (options.sortBy === 'createdAt') {
    meetings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  
  return meetings;
}

/**
 * 归档会议文档
 */
function archiveMeeting(meetingId, archiveDir = null) {
  const destDir = archiveDir || path.join(DOCUMENTS_DIR, 'archived', new Date().getFullYear().toString());
  
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  
  // 移动文档到归档目录
  const levels = ['L1', 'L2', 'L3', 'L4'];
  const archived = [];
  
  levels.forEach(level => {
    const srcPath = path.join(DOCUMENTS_DIR, `${meetingId}-${level.toLowerCase()}.json`);
    const destPath = path.join(destDir, `${meetingId}-${level.toLowerCase()}.json`);
    
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      archived.push(level);
    }
  });
  
  return {
    meetingId,
    archiveDir: destDir,
    archivedLevels: archived,
    archivedAt: new Date().toISOString()
  };
}

/**
 * 生成标签云
 */
function generateTagCloud() {
  const masterIndexPath = path.join(INDEX_DIR, 'master-index.json');
  if (!fs.existsSync(masterIndexPath)) return {};
  
  const masterIndex = JSON.parse(fs.readFileSync(masterIndexPath, 'utf-8'));
  
  const tagCount = {};
  masterIndex.documents.forEach(doc => {
    (doc.keywords || []).forEach(tag => {
      tagCount[tag] = (tagCount[tag] || 0) + 1;
    });
  });
  
  // 按频率排序
  return Object.entries(tagCount)
    .sort((a, b) => b[1] - a[1])
    .reduce((obj, [tag, count]) => {
      obj[tag] = count;
      return obj;
    }, {});
}

module.exports = {
  indexDocument,
  searchDocuments,
  searchByTags,
  getMeetingDocuments,
  listMeetings,
  archiveMeeting,
  generateTagCloud
};