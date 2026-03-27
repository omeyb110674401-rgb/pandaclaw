/**
 * 会议状态持久化模块
 * @author npc-1 (系统架构师)
 * @updated 2026-03-26
 * 
 * 七步闭环步骤：
 *   步骤1-4：准备阶段（广播→用户验收）
 *   步骤5：政协协商（两轮：5-1独立输出 → 5-2意见共享+立场）
 *   步骤6：人大表决（三轮：6-1质询 → 6-2回应 → 6-3投票）
 *   步骤7：决策输出
 * 
 * inter_session 处理规则：
 *   收到 inter_session 消息时：
 *   ✅ 记录到会议状态
 *   ❌ 不要主动回复
 */

const fs = require('fs');
const path = require('path');

const STATE_DIR = path.join(__dirname, '..', 'meetings');
const MAX_RETRY = 2;

// 步骤定义（含子步骤）
const STEPS = {
  0: 'init',
  1: 'goal_alignment',
  2: 'information_sharing',
  3: 'role_assignment',
  4: 'coordination',
  // 步骤5：政协协商（两轮）
  '5_1': 'deliberation_round1',    // 独立输出
  '5_2': 'deliberation_round2',    // 意见共享+立场
  // 步骤6：人大表决（三轮）
  '6_1': 'inquiry',                // 质询
  '6_2': 'inquiry_response',       // 回应
  '6_3': 'voting',                 // 投票
  7: 'decision',
  8: 'completed'
};

const STEP_NAMES = {
  init: 0,
  goal_alignment: 1,
  information_sharing: 2,
  role_assignment: 3,
  coordination: 4,
  // 步骤5子步骤
  deliberation_round1: '5_1',
  deliberation_round2: '5_2',
  // 步骤6子步骤
  inquiry: '6_1',
  inquiry_response: '6_2',
  voting: '6_3',
  decision: 7,
  completed: 8
};

function ensureDir() {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
}
function getFilePath(id) { return path.join(STATE_DIR, `${id}.json`); }

function createMeetingState(options) {
  ensureDir();
  const { meetingId = `meeting-${Date.now()}`, topic, description = '',
    participants = { cppcc: [], npc: [] }, expertiseBindings = {} } = options;
  if (!topic) throw new Error('议题不能为空');
  const state = {
    meetingId, topic, description, status: 'pending', currentStep: 0,
    participants, expertiseBindings,
    // 步骤结果（含子步骤）
    stepResults: {
      goal_alignment: null,
      information_sharing: null,
      role_assignment: null,
      coordination: null,
      // 步骤5：政协协商（两轮）
      deliberation_round1: null,
      deliberation_round2: null,
      // 步骤6：人大表决（三轮）
      inquiry: null,
      inquiry_response: null,
      voting: null,
      decision: null
    },
    opinions: {},
    votes: {},
    inquiries: {},        // 质询记录
    inquiryResponses: {}, // 质询回应
    finalDecision: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    retryCount: 0
  };
  saveState(state);
  return state;
}

function saveState(state) {
  ensureDir();
  if (!state || !state.meetingId) throw new Error('无效的会议状态');
  try {
    state.updatedAt = new Date().toISOString();
    fs.writeFileSync(getFilePath(state.meetingId), JSON.stringify(state, null, 2), 'utf-8');
    return true;
  } catch (e) { throw new Error(`状态保存失败: ${e.message}`); }
}

function loadState(meetingId) {
  ensureDir();
  const fp = getFilePath(meetingId);
  if (!fs.existsSync(fp)) return null;
  try { return JSON.parse(fs.readFileSync(fp, 'utf-8')); }
  catch (e) { throw new Error(`状态加载失败: ${e.message}`); }
}

function updateStep(meetingId, step, result) {
  const state = loadState(meetingId);
  if (!state) throw new Error(`会议不存在: ${meetingId}`);
  if (!STEP_NAMES[step] && step !== 'init') throw new Error(`无效步骤: ${step}`);
  state.stepResults[step] = { ...result, completedAt: new Date().toISOString() };
  state.currentStep = STEP_NAMES[step] || 0;
  state.status = 'in-progress';
  saveState(state);
  return state;
}

function recordOpinion(meetingId, agentId, opinion) {
  const state = loadState(meetingId);
  if (!state) throw new Error(`会议不存在: ${meetingId}`);
  state.opinions[agentId] = { ...opinion, recordedAt: new Date().toISOString() };
  saveState(state);
  return state;
}

/**
 * 记录立场标记（步骤5-2）
 */
function recordStance(meetingId, agentId, stance, reason = '') {
  const state = loadState(meetingId);
  if (!state) throw new Error(`会议不存在: ${meetingId}`);
  const VALID_STANCES = ['附议', '补充', '反对', '独立'];
  if (!VALID_STANCES.includes(stance)) {
    throw new Error(`无效立场: ${stance}，必须是：${VALID_STANCES.join('/')}`);
  }
  state.opinions[agentId] = {
    ...state.opinions[agentId],
    stance,
    reason,
    stanceRecordedAt: new Date().toISOString()
  };
  saveState(state);
  return state;
}

/**
 * 记录质询（步骤6-1）
 */
function recordInquiry(meetingId, npcId, targetCppcc, questions) {
  const state = loadState(meetingId);
  if (!state) throw new Error(`会议不存在: ${meetingId}`);
  if (!questions || questions.length === 0) {
    throw new Error('质询问题不能为空');
  }
  state.inquiries[npcId] = {
    questions,
    targetCppcc,
    createdAt: new Date().toISOString()
  };
  saveState(state);
  return state;
}

/**
 * 记录质询回应（步骤6-2）
 */
function recordInquiryResponse(meetingId, cppccId, answers) {
  const state = loadState(meetingId);
  if (!state) throw new Error(`会议不存在: ${meetingId}`);
  state.inquiryResponses[cppccId] = {
    answers,
    respondedAt: new Date().toISOString()
  };
  saveState(state);
  return state;
}

function recordVote(meetingId, agentId, vote, reason = '') {
  const state = loadState(meetingId);
  if (!state) throw new Error(`会议不存在: ${meetingId}`);
  if (!['赞成', '反对', '弃权'].includes(vote)) throw new Error(`无效投票: ${vote}`);
  state.votes[agentId] = { vote, reason, votedAt: new Date().toISOString() };
  saveState(state);
  return state;
}

function getVoteResult(meetingId) {
  const state = loadState(meetingId);
  if (!state) throw new Error(`会议不存在: ${meetingId}`);
  const votes = Object.values(state.votes);
  const r = { total: votes.length, 赞成: 0, 反对: 0, 弃权: 0, passed: false, details: state.votes };
  votes.forEach(v => { if (r[v.vote] !== undefined) r[v.vote]++; });
  r.passed = r.赞成 > r.反对;
  return r;
}

function pauseMeeting(meetingId, reason = null) {
  const state = loadState(meetingId);
  if (!state) throw new Error(`会议不存在: ${meetingId}`);
  if (state.status === 'completed') throw new Error('会议已完成，无法暂停');
  state.status = 'paused';
  state.pauseReason = reason;
  saveState(state);
  return state;
}

function resumeMeeting(meetingId, fromStep = null) {
  const state = loadState(meetingId);
  if (!state) throw new Error(`会议不存在: ${meetingId}`);
  if (state.status === 'completed') throw new Error('会议已完成，无法恢复');
  state.status = 'in-progress';
  if (fromStep && STEP_NAMES[fromStep]) state.currentStep = STEP_NAMES[fromStep];
  delete state.pauseReason;
  saveState(state);
  return { state, resumeFrom: STEPS[state.currentStep] };
}

function incrementRetry(meetingId) {
  const state = loadState(meetingId);
  if (!state) throw new Error(`会议不存在: ${meetingId}`);
  state.retryCount++;
  if (state.retryCount > MAX_RETRY) {
    state.status = 'rejected';
    state.finalDecision = '重试超限，转人工裁决';
    saveState(state);
    return { exceeded: true, retryCount: state.retryCount };
  }
  saveState(state);
  return { exceeded: false, retryCount: state.retryCount };
}

function completeMeeting(meetingId, decision) {
  const state = loadState(meetingId);
  if (!state) throw new Error(`会议不存在: ${meetingId}`);
  state.status = 'completed';
  state.finalDecision = decision;
  state.completedAt = new Date().toISOString();
  saveState(state);
  return state;
}

function listMeetings(status = null) {
  ensureDir();
  let meetings = fs.readdirSync(STATE_DIR).filter(f => f.endsWith('.json'))
    .map(f => { try { return JSON.parse(fs.readFileSync(getFilePath(f.replace('.json', '')), 'utf-8')); } catch { return null; } })
    .filter(m => m !== null);
  return status ? meetings.filter(m => m.status === status) : meetings;
}

function deleteMeeting(meetingId) {
  const fp = getFilePath(meetingId);
  if (fs.existsSync(fp)) { fs.unlinkSync(fp); return true; }
  return false;
}

/**
 * 检查步骤是否完成（同步屏障）
 * @param {string} meetingId 
 * @param {string} step - 如 'deliberation_round1'
 * @param {string[]} expectedAgents - 预期响应的Agent列表
 * @returns {Object} { complete, respondedCount, expectedCount, missingAgents }
 */
function checkStepComplete(meetingId, step, expectedAgents) {
  const state = loadState(meetingId);
  if (!state) throw new Error(`会议不存在: ${meetingId}`);
  
  // 根据步骤类型检查对应的响应
  let responded = [];
  
  if (step === 'deliberation_round1') {
    // 步骤5-1：检查opinions
    responded = Object.keys(state.opinions || {}).filter(id => expectedAgents.includes(id));
  } else if (step === 'deliberation_round2') {
    // 步骤5-2：检查opinions中的stance
    responded = Object.entries(state.opinions || {})
      .filter(([id, data]) => expectedAgents.includes(id) && data.stance)
      .map(([id]) => id);
  } else if (step === 'inquiry') {
    // 步骤6-1：检查inquiries
    responded = Object.keys(state.inquiries || {}).filter(id => expectedAgents.includes(id));
  } else if (step === 'voting') {
    // 步骤6-3：检查votes
    responded = Object.keys(state.votes || {}).filter(id => expectedAgents.includes(id));
  }
  
  const missing = expectedAgents.filter(id => !responded.includes(id));
  
  return {
    complete: responded.length >= expectedAgents.length,
    respondedCount: responded.length,
    expectedCount: expectedAgents.length,
    respondedAgents: responded,
    missingAgents: missing,
    responseRate: expectedAgents.length > 0 ? responded.length / expectedAgents.length : 0
  };
}

/**
 * 等待步骤完成（轮询检查）
 * @param {string} meetingId 
 * @param {string} step 
 * @param {string[]} expectedAgents 
 * @param {number} timeoutMs - 超时时间（毫秒）
 * @param {number} pollIntervalMs - 轮询间隔（毫秒）
 * @returns {Promise<Object>} 
 */
async function waitForStepComplete(meetingId, step, expectedAgents, timeoutMs = 60000, pollIntervalMs = 5000) {
  const startTime = Date.now();
  
  while (true) {
    const result = checkStepComplete(meetingId, step, expectedAgents);
    
    if (result.complete) {
      return { ...result, timedOut: false };
    }
    
    if (Date.now() - startTime > timeoutMs) {
      return { ...result, timedOut: true };
    }
    
    // 等待下一次轮询
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
}

/**
 * 获取意见汇总（用于步骤5-2广播）
 * @param {string} meetingId 
 * @returns {string} 格式化的意见汇总
 */
function getOpinionsSummary(meetingId) {
  const state = loadState(meetingId);
  if (!state) throw new Error(`会议不存在: ${meetingId}`);
  
  const opinions = state.opinions || {};
  const lines = [];
  
  for (const [agentId, data] of Object.entries(opinions)) {
    const expertise = state.expertiseBindings?.[agentId]?.expertiseName || agentId;
    const analysis = data.analysis || data.opinion || '(等待分析)';
    
    lines.push(`**${agentId}（${expertise}）：**`);
    lines.push(analysis);
    lines.push('');
  }
  
  return lines.join('\n');
}

module.exports = {
  createMeetingState, saveState, loadState, updateStep,
  recordOpinion, recordStance, recordInquiry, recordInquiryResponse,
  recordVote, getVoteResult,
  pauseMeeting, resumeMeeting, completeMeeting, incrementRetry,
  listMeetings, deleteMeeting,
  checkStepComplete, waitForStepComplete, getOpinionsSummary,
  STATE_DIR, MAX_RETRY, STEPS, STEP_NAMES
};