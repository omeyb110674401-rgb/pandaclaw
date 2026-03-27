/**
 * 分层文档生成器
 * @author cppcc-4 (产品专家)
 * @version 3.0 - 功能导向分层设计
 * @updated 2026-03-27
 * 
 * 设计理念：
 * - 按用途分层，而非按格式分类
 * - 便于检索和归档
 * - 按需生成，避免冗余
 * 
 * 分层结构：
 * L1 - 决策摘要（1 页）：快速浏览、周报汇总
 * L2 - 协商过程（3-5 页）：理解决策、复盘改进
 * L3 - 执行决议（1 页）：下发执行、责任落实
 * L4 - 完整档案（N 页）：审计、合规、存档
 */

const { loadState, getVoteResult } = require('./meeting-state-store');

/**
 * 生成文档编号
 * 格式：熊猫协字〔YYYY〕NNN 号
 */
function generateDocNumber(meetingId) {
  const year = new Date().getFullYear();
  const hash = meetingId.split('-').pop() || Date.now().toString().slice(-6);
  const seq = parseInt(hash, 16) % 1000;
  return `熊猫协字〔${year}〕${String(seq).padStart(3, '0')}号`;
}

/**
 * 提取关键词（用于检索）
 */
function extractKeywords(state) {
  const keywords = new Set();
  
  // 从议题提取
  if (state.topic) {
    state.topic.split(/[\s,，.]+/).forEach(w => {
      if (w.length >= 2) keywords.add(w);
    });
  }
  
  // 从身份提取
  Object.values(state.expertiseBindings || {}).forEach(b => {
    keywords.add(b.expertiseName);
  });
  
  // 从意见提取关键词（简化版）
  Object.values(state.opinions || {}).forEach(op => {
    const text = op.opinion || op.analysis || '';
    // 简单提取技术名词
    const matches = text.match(/[A-Z][a-z]+|[A-Z]{2,}|\p{Script=Han}{2,}/gu);
    if (matches) matches.forEach(m => keywords.add(m));
  });
  
  return Array.from(keywords).slice(0, 20);
}

/**
 * L1 - 决策摘要（1 页）
 * 用途：快速浏览、新人上手、周报汇总
 */
function generateSummary(state) {
  const voteResult = getVoteResult(state.meetingId);
  const passed = voteResult.赞成 > voteResult.反对;
  const keywords = extractKeywords(state);
  
  // 识别核心分歧点
  const分歧点 = identifyDisagreements(state);
  
  // 识别关键决策依据
  const决策依据 = identifyDecisionBasis(state);
  
  return {
    level: 'L1',
    type: '决策摘要',
    docNumber: generateDocNumber(state.meetingId),
    metadata: {
      meetingId: state.meetingId,
      topic: state.topic,
      status: state.status,
      createdAt: state.createdAt,
      completedAt: state.completedAt,
      keywords,
      participants: {
        cppcc: state.participants.cppcc.length,
        npc: state.participants.npc.length
      }
    },
    content: {
      decision: passed ? '通过' : '未通过',
      voteResult: {
        赞成：voteResult.赞成，
        反对：voteResult.反对，
        弃权：voteResult.弃权
      },
      coreDisagreements: 分歧点，
      keyDecisionBasis: 决策依据，
      executionOwner: state.participants.npc[0] || '待定',
      deadline: calculateDeadline(state)
    },
    // 纯文本版本，便于全文检索
    searchableText: buildSearchableText(state, 'L1')
  };
}

/**
 * L2 - 协商过程（3-5 页）
 * 用途：理解决策形成过程、复盘改进
 */
function generateProcessReport(state) {
  const opinions = Object.entries(state.opinions || {});
  const inquiries = Object.entries(state.inquiries || {});
  const responses = Object.entries(state.inquiryResponses || {});
  
  // 独立意见
  const独立意见 = opinions
    .filter(([id]) => id.startsWith('cppcc'))
    .map(([id, data]) => ({
      agent: id,
      expertise: state.expertiseBindings?.[id]?.expertiseName || id,
      opinion: data.opinion || data.analysis || '(无)',
      risks: data.risks || []
    }));
  
  // 立场标记
  const立场收敛 = opinions
    .filter(([id, data]) => id.startsWith('cppcc') && data.stance)
    .map(([id, data]) => ({
      agent: id,
      expertise: state.expertiseBindings?.[id]?.expertiseName || id,
      stance: data.stance,
      reason: data.reason || '',
      targetOpinion: data.targetOpinion || ''
    }));
  
  // 质询记录
  const质询记录 = inquiries.map(([npcId, data]) => ({
    agent: npcId,
    expertise: state.expertiseBindings?.[npcId]?.expertiseName || npcId,
    target: data.targetCppcc,
    questions: data.questions,
    response: responses.find(([id]) => id === data.targetCppcc)?.[1]?.answers || []
  }));
  
  return {
    level: 'L2',
    type: '协商过程',
    docNumber: generateDocNumber(state.meetingId),
    metadata: {
      meetingId: state.meetingId,
      topic: state.topic,
      createdAt: state.createdAt
    },
    content: {
      独立意见，
      立场收敛，
      质询记录，
      // 过程统计
      stats: {
        totalOpinions: 独立意见.length,
        totalStances: 立场收敛.length,
        totalInquiries: 质询记录.length,
        stanceDistribution: 统计立场分布 (立场收敛)
      }
    },
    searchableText: buildSearchableText(state, 'L2')
  };
}

/**
 * L3 - 执行决议（1 页）
 * 用途：下发执行、责任落实、验收依据
 */
function generateExecutionDecision(state) {
  const voteResult = getVoteResult(state.meetingId);
  const passed = voteResult.赞成 > voteResult.反对;
  
  // 任务分解（从决策中提取）
  const tasks = extractTasks(state);
  
  // 验收条件
  const acceptanceCriteria = extractAcceptanceCriteria(state);
  
  return {
    level: 'L3',
    type: '执行决议',
    docNumber: generateDocNumber(state.meetingId),
    metadata: {
      meetingId: state.meetingId,
      topic: state.topic,
      status: state.status,
      createdAt: state.createdAt
    },
    content: {
      decision: passed ? '批准执行' : '不予批准',
      voteResult,
      tasks,
      acceptanceCriteria,
      executionOwner: state.participants.npc[0] || '待定',
      deadline: calculateDeadline(state),
      changeMechanism: '重大变更需重新协商（赞成票>反对票）'
    },
    // 可执行的任务列表（JSON 格式）
    actionableTasks: tasks.map(t => ({
      task: t.name,
      owner: t.owner,
      deadline: t.deadline,
      status: 'pending'
    })),
    searchableText: buildSearchableText(state, 'L3')
  };
}

/**
 * L4 - 完整档案（N 页）
 * 用途：审计、合规、长期存档
 */
function generateArchive(state) {
  return {
    level: 'L4',
    type: '完整档案',
    docNumber: generateDocNumber(state.meetingId),
    metadata: {
      meetingId: state.meetingId,
      topic: state.topic,
      status: state.status,
      createdAt: state.createdAt,
      completedAt: state.completedAt,
      version: '1.0',
      archiveDate: new Date().toISOString()
    },
    content: {
      // 完整原始数据
      rawState: state,
      // 操作日志
      auditLog: generateAuditLog(state),
      // 版本历史
      versionHistory: [{
        version: '1.0',
        date: new Date().toISOString(),
        changes: '初始归档'
      }]
    },
    searchableText: buildSearchableText(state, 'L4')
  };
}

// ========== 辅助函数 ==========

/**
 * 识别核心分歧点
 */
function identifyDisagreements(state) {
  const opinions = Object.values(state.opinions || {});
  const分歧点 = [];
  
  // 简单分析：找出有不同建议的领域
  const技术选型 = [];
  const架构模式 = [];
  
  opinions.forEach(op => {
    const text = op.opinion || op.analysis || '';
    if (text.includes('架构')) 架构模式.push(text);
    if (text.includes('数据库') || text.includes('选型')) 技术选型.push(text);
  });
  
  if (技术选型.length > 1) 分歧点.push({
    area: '技术选型',
    opinions: 技术选型
  });
  
  if (架构模式.length > 1) 分歧点.push({
    area: '架构模式',
    opinions: 架构模式
  });
  
  return 分歧点;
}

/**
 * 识别关键决策依据
 */
function identifyDecisionBasis(state) {
  const依据 = [];
  
  // 从投票理由中提取
  Object.values(state.votes || {}).forEach(vote => {
    if (vote.reason && vote.vote === '赞成') {
      // 提取关键理由
      const reason = vote.reason;
      if (reason.includes('安全')) 依据.push(`安全考虑：${reason}`);
      if (reason.includes('成本')) 依据.push(`成本控制：${reason}`);
      if (reason.includes('团队')) 依据.push(`团队因素：${reason}`);
    }
  });
  
  return 依据.slice(0, 5);
}

/**
 * 计算完成时限
 */
function calculateDeadline(state) {
  const complexity = state.complexity || 'medium';
  const days = {
    'simple': 7,
    'medium': 14,
    'complex': 30,
    'enterprise': 90
  }[complexity] || 14;
  
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + days);
  return deadline.toISOString().split('T')[0];
}

/**
 * 提取任务分解
 */
function extractTasks(state) {
  // 从意见中提取任务（简化版）
  const tasks = [];
  
  Object.entries(state.opinions || {}).forEach(([id, data]) => {
    if (id.startsWith('cppcc')) {
      const text = data.opinion || data.analysis || '';
      // 简单提取建议中的任务
      if (text.includes('建议')) {
        tasks.push({
          name: text.slice(0, 50),
          owner: id,
          deadline: calculateDeadline(state),
          acceptance: '待定义'
        });
      }
    }
  });
  
  return tasks.slice(0, 5);
}

/**
 * 提取验收条件
 */
function extractAcceptanceCriteria(state) {
  return [
    '功能测试通过率 100%',
    '性能指标达标',
    '用户满意度≥80%'
  ];
}

/**
 * 统计立场分布
 */
function 统计立场分布 (stances) {
  const dist = { 附议：0, 补充：0, 反对：0, 独立：0 };
  stances.forEach(s => {
    if (dist[s.stance] !== undefined) dist[s.stance]++;
  });
  return dist;
}

/**
 * 构建可检索文本
 */
function buildSearchableText(state, level) {
  const parts = [
    state.meetingId,
    state.topic,
    state.description,
    Object.values(state.expertiseBindings || {}).map(b => b.expertiseName).join(' '),
    Object.values(state.opinions || {}).map(o => o.opinion || o.analysis || '').join(' '),
    Object.values(state.votes || {}).map(v => v.reason || '').join(' ')
  ];
  
  return parts.join(' ').toLowerCase();
}

/**
 * 生成审计日志
 */
function generateAuditLog(state) {
  const log = [];
  
  log.push({
    time: state.createdAt,
    action: '会议创建',
    details: `议题：${state.topic}`
  });
  
  if (state.completedAt) {
    log.push({
      time: state.completedAt,
      action: '会议完成',
      details: `决策：${state.finalDecision}`
    });
  }
  
  return log;
}

/**
 * 生成索引条目（用于检索）
 */
function generateIndexEntry(state) {
  return {
    meetingId: state.meetingId,
    docNumber: generateDocNumber(state.meetingId),
    topic: state.topic,
    status: state.status,
    createdAt: state.createdAt,
    keywords: extractKeywords(state),
    participants: {
      cppcc: state.participants.cppcc,
      npc: state.participants.npc
    },
    decision: state.finalDecision,
    // 文档层级索引
    documents: {
      L1: `meetings/documents/${state.meetingId}-L1-summary.json`,
      L2: `meetings/documents/${state.meetingId}-L2-process.json`,
      L3: `meetings/documents/${state.meetingId}-L3-decision.json`,
      L4: `meetings/documents/${state.meetingId}-L4-archive.json`
    }
  };
}

module.exports = {
  generateSummary,
  generateProcessReport,
  generateExecutionDecision,
  generateArchive,
  generateIndexEntry,
  generateDocNumber,
  extractKeywords
};