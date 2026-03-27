#!/usr/bin/env node
/**
 * 分层文档系统演示脚本
 * @author cppcc-4 (产品专家)
 * 
 * 演示：
 * 1. 生成全套分层文档
 * 2. 检索文档
 * 3. 按标签筛选
 * 4. 归档管理
 */

const { saveLayeredDocuments, listMeetings } = require('./meeting-state-store');
const { searchDocuments, searchByTags, listMeetings: listIndexedMeetings, generateTagCloud } = require('./document-index');

function main() {
  console.log('🐼 PandaClaw - 分层文档系统演示\n');
  console.log('═'.repeat(60));
  
  // 1. 列出最近的会议
  console.log('\n📋 步骤 1: 列出最近的会议\n');
  const meetings = listIndexedMeetings({ sortBy: 'createdAt' }).slice(-5).reverse();
  
  if (meetings.length === 0) {
    console.log('   暂无 indexed 会议，先生成一些文档吧！\n');
  } else {
    meetings.forEach((m, i) => {
      console.log(`   ${i + 1}. ${m.meetingId}`);
      console.log(`      议题：${m.topic}`);
      console.log(`      编号：${m.docNumber}`);
      console.log(`      状态：${m.status}`);
      console.log(`      关键词：${m.keywords?.slice(0, 5).join('、') || '(无)'}`);
      console.log('');
    });
  }
  
  // 2. 演示检索
  console.log('═'.repeat(60));
  console.log('\n🔍 步骤 2: 演示检索功能\n');
  
  const testQueries = ['AI', '架构', 'RAG'];
  testQueries.forEach(query => {
    console.log(`   检索："${query}"`);
    const results = searchDocuments(query);
    console.log(`      找到 ${results.length} 条结果`);
    if (results.length > 0) {
      console.log(`      最相关：${results[0].topic}`);
    }
    console.log('');
  });
  
  // 3. 演示标签云
  console.log('═'.repeat(60));
  console.log('\n🏷️  步骤 3: 标签云\n');
  const tagCloud = generateTagCloud();
  const topTags = Object.entries(tagCloud).slice(0, 10);
  
  if (topTags.length === 0) {
    console.log('   暂无标签数据\n');
  } else {
    console.log('   热门标签：');
    topTags.forEach(([tag, count]) => {
      const bar = '█'.repeat(count);
      console.log(`      ${tag.padEnd(15)} ${bar} (${count})`);
    });
    console.log('');
  }
  
  // 4. 演示按标签筛选
  console.log('═'.repeat(60));
  console.log('\n🎯 步骤 4: 按标签筛选\n');
  const testTags = ['AI 工程师', '后端专家'];
  testTags.forEach(tag => {
    console.log(`   标签："${tag}"`);
    const results = searchByTags([tag]);
    console.log(`      找到 ${results.length} 条结果`);
    if (results.length > 0) {
      results.forEach(r => {
        console.log(`         - ${r.topic}`);
      });
    }
    console.log('');
  });
  
  // 5. 生成全套分层文档（如果有会议）
  console.log('═'.repeat(60));
  console.log('\n📕 步骤 5: 生成全套分层文档\n');
  
  if (meetings.length > 0) {
    const meetingId = meetings[0].meetingId;
    console.log(`   为会议生成文档：${meetingId}\n`);
    
    try {
      const paths = saveLayeredDocuments(meetingId);
      
      console.log('   ✅ 生成成功：\n');
      Object.entries(paths).forEach(([level, path]) => {
        const desc = {
          'L1': '决策摘要（1 页，快速浏览）',
          'L2': '协商过程（3-5 页，理解决策）',
          'L3': '执行决议（1 页，下发执行）',
          'L4': '完整档案（N 页，审计存档）'
        }[level];
        
        console.log(`      ${level}: ${desc}`);
        console.log(`          → ${path}`);
      });
      
      console.log('\n   💡 提示：文档已添加到索引，可以通过检索功能查找\n');
    } catch (err) {
      console.error(`   ❌ 生成失败：${err.message}\n`);
    }
  } else {
    console.log('   暂无会议，跳过生成步骤\n');
  }
  
  // 6. 使用指南
  console.log('═'.repeat(60));
  console.log('\n📖 使用指南\n');
  console.log('   代码调用：');
  console.log(`
   const { saveLayeredDocuments } = require('./scripts/meeting-state-store');
   const { searchDocuments, searchByTags } = require('./scripts/document-index');
   
   // 生成全套文档
   const paths = saveLayeredDocuments('meeting-20260327-123456');
   
   // 检索文档
   const results = searchDocuments('AI 架构');
   
   // 按标签筛选
   const tagged = searchByTags(['AI 工程师', '后端专家']);
   `);
  
  console.log('\n   命令行工具：');
  console.log(`
   # 生成指定会议的文档
   node scripts/generate-meeting-document.js meeting-xxx full
   
   # 检索文档
   node scripts/search-documents.js "AI 架构"
   `);
  
  console.log('\n' + '═'.repeat(60));
  console.log('\n✅ 演示完成\n');
}

main();