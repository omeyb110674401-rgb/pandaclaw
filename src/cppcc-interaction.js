/**
 * 政协交互环模块
 * @description 实现政协委员意见共享、标记、讨论链
 * @author cppcc-1 (AI工程师)
 */

const { loadState, saveState } = require('./meeting-state-store');

// 意见标记类型
const OPINION_MARKERS = {
  ENDORSE: '附议',      // 同意并支持
  SUPPLEMENT: '补充',   // 补充论证
  OPPOSE: '反对',       // 不同意
  NEUTRAL: '独立'       // 独立意见
};

/**
 * 记录政协委员意见
 * @param {string} meetingId - 会议ID
 * @param {string} agentId - 政协委员ID
 * @param {Object} opinion - 意见内容
 * @param {string} opinion.analysis - 专业分析
 * @param {string} opinion.suggestion - 技术建议
 * @param {string} opinion.risk - 风险提示
 * @param {string} marker - 意见标记（附议/补充/反对/独立）
 * @param {string} referenceTo - 引用的其他委员ID（可选）
 */
function recordOpinion(meetingId, agentId, opinion, marker = '独立', referenceTo = null) {
  const state = loadState(meetingId);
  if (!state) throw new Error(`会议不存在: ${meetingId}`);
  
  if (!state.opinions) state.opinions = {};
  
  state.opinions[agentId] = {
    ...opinion,
    marker,
    referenceTo,
    recordedAt: new Date().toISOString()
  };
  
  saveState(state);
  return state.opinions[agentId];
}

/**
 * 获取所有政协委员意见（供其他委员查看）
 * @param {string} meetingId - 会议ID
 * @param {string} excludeAgent - 排除的委员ID（可选，用于不看到自己的）
 */
function getVisibleOpinions(meetingId, excludeAgent = null) {
  const state = loadState(meetingId);
  if (!state || !state.opinions) return {};
  
  const opinions = { ...state.opinions };
  if (excludeAgent && opinions[excludeAgent]) {
    delete opinions[excludeAgent];
  }
  
  return opinions;
}

/**
 * 构建讨论链
 * @param {string} meetingId - 会议ID
 * @returns {Array} 讨论链数组
 */
function buildDiscussionChain(meetingId) {
  const state = loadState(meetingId);
  if (!state || !state.opinions) return [];
  
  const opinions = state.opinions;
  const chain = [];
  const processed = new Set();
  
  // 构建引用链
  for (const [agentId, opinion] of Object.entries(opinions)) {
    if (processed.has(agentId)) continue;
    
    const node = {
      agentId,
      marker: opinion.marker,
      summary: opinion.suggestion?.substring(0, 50) + '...',
      references: []
    };
    
    // 查找引用关系
    if (opinion.referenceTo && opinions[opinion.referenceTo]) {
      node.references.push(opinion.referenceTo);
    }
    
    chain.push(node);
    processed.add(agentId);
  }
  
  return chain;
}

/**
 * 生成意见共享消息（用于sessions_send广播）
 * @param {Object} opinions - 所有意见
 * @returns {string} 格式化的消息
 */
function generateOpinionShareMessage(opinions) {
  const lines = ['【政协委员意见汇总】', ''];
  
  // 按标记分组
  const groups = {
    '附议': [],
    '补充': [],
    '反对': [],
    '独立': []
  };
  
  for (const [agentId, opinion] of Object.entries(opinions)) {
    const marker = opinion.marker || '独立';
    if (groups[marker]) {
      groups[marker].push({ agentId, opinion });
    }
  }
  
  for (const [marker, items] of Object.entries(groups)) {
    if (items.length === 0) continue;
    lines.push(`**${marker}意见 (${items.length}人)：**`);
    items.forEach(item => {
      lines.push(`- ${item.agentId}：${item.opinion.suggestion?.substring(0, 30)}...`);
    });
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * 统计意见分布
 * @param {string} meetingId - 会议ID
 */
function getOpinionStats(meetingId) {
  const state = loadState(meetingId);
  if (!state || !state.opinions) return null;
  
  const stats = {
    total: Object.keys(state.opinions).length,
    markers: { '附议': 0, '补充': 0, '反对': 0, '独立': 0 }
  };
  
  for (const opinion of Object.values(state.opinions)) {
    const marker = opinion.marker || '独立';
    if (stats.markers[marker] !== undefined) {
      stats.markers[marker]++;
    }
  }
  
  return stats;
}

/**
 * 检测意见分歧
 * @param {string} meetingId - 会议ID
 * @returns {Object} 分歧检测结果
 */
function detectDisagreement(meetingId) {
  const stats = getOpinionStats(meetingId);
  if (!stats) return { hasDisagreement: false };
  
  const { '反对': oppose, '独立': neutral } = stats.markers;
  const disagreeCount = oppose + neutral;
  
  return {
    hasDisagreement: disagreeCount > 0,
    disagreeCount,
    total: stats.total,
    ratio: disagreeCount / stats.total
  };
}

module.exports = {
  OPINION_MARKERS,
  recordOpinion,
  getVisibleOpinions,
  buildDiscussionChain,
  generateOpinionShareMessage,
  getOpinionStats,
  detectDisagreement
};