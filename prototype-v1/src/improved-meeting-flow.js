/**
 * 改进后的七步闭环会议流程
 * @description 实现两轮协商 + 强制质询 + 同步屏障
 * @date 2026-03-26
 * 
 * 完整流程：
 *   步骤1-4：准备阶段（广播→用户验收）
 *   步骤5：政协协商（两轮）
 *     5-1. 独立输出 → 不看他人，独立分析
 *     ⚠️ 同步屏障：等待所有政协响应或超时
 *     5-2. 意见共享+立场 → 附议/补充/反对/独立
 *   步骤6：人大表决（三轮）
 *     6-1. 质询 → 必须提出至少1个质疑问题
 *     6-2. 政协回应 → 回应质询
 *     6-3. 投票 → 赞成/反对/弃权 + 理由
 *   步骤7：决策输出
 * 
 * 消息流向：
 *   main ──sessions_send──> Agent
 *   main <──inter_session── Agent（仅记录，不主动回复）
 */

const { createIsolatedMessage, formatForSend } = require('./meeting-message-template');
const { 
  loadState, saveState, createMeetingState, updateStep, 
  recordInquiry, recordInquiryResponse,
  checkStepComplete, waitForStepComplete, getOpinionsSummary
} = require('./meeting-state-store');
const { recordOpinion, getVisibleOpinions, generateOpinionShareMessage, OPINION_MARKERS } = require('./cppcc-interaction');

/**
 * 步骤5-1：政协独立输出
 * @param {string} meetingId 
 * @param {string} agentId 
 * @param {string} topic - 纯净议题（不含背景）
 * @returns {Object} 消息对象
 */
function step5_1_independentOutput(meetingId, agentId, topic) {
    // 构建隔离消息（无背景信息）
    const msg = `【步骤5-1：独立输出】

【开放性议题】
${topic}

请独立思考，给出你的方案。无任何预设答案。
简短回复你的分析和建议。

要求：
- 不看他人意见
- 从你的专业视角分析
- 给出具体建议`;

    return {
        message: msg,
        instruction: '独立输出，不看他人意见',
        step: '5_1',
        phase: 'deliberation_round1'
    };
}

/**
 * 步骤5-2：政协意见共享+标记
 * @param {string} meetingId 
 * @param {string} agentId 
 * @returns {Object} 消息对象
 */
function step5_2_shareAndMark(meetingId, agentId) {
    // 获取其他委员意见
    const otherOpinions = getVisibleOpinions(meetingId, agentId);
    
    // 生成共享消息
    const shareMsg = generateOpinionShareMessage(otherOpinions);
    
    const msg = `【步骤5-2：意见共享+立场标记】

其他政协委员的意见：

${shareMsg}

请参考他人意见，选择你的立场：
- 附议：同意并支持
- 补充：同意并补充论证
- 反对：不同意并说明理由
- 独立：保持独立意见

简短回复你的选择和理由。`;

    return {
        message: msg,
        otherOpinions,
        markers: OPINION_MARKERS,
        step: '5_2',
        phase: 'deliberation_round2'
    };
}

/**
 * 步骤6-1：人大质询（强制）
 * @param {string} meetingId 
 * @param {string} npcId 
 * @param {string} targetCppcc 
 * @param {string[]} questions - 质询问题列表
 * @returns {Object} 质询对象
 */
function step6_1_inquiry(meetingId, npcId, targetCppcc, questions) {
    // 确保至少有1个问题
    if (!questions || questions.length === 0) {
        questions = ['请补充质询问题：方案的可行性如何？'];
    }
    
    // 记录质询到状态
    recordInquiry(meetingId, npcId, targetCppcc, questions);
    
    const msg = `【步骤6-1：质询】

人大代表 ${npcId} 向 ${targetCppcc} 提出质询：

${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

要求政协委员回应。`;

    return {
        meetingId,
        npcId,
        targetCppcc,
        questions,
        message: msg,
        requirement: '人大必须提出至少1个质疑问题',
        step: '6_1',
        phase: 'inquiry'
    };
}

/**
 * 步骤6-2：政协回应质询
 * @param {string} meetingId 
 * @param {string} inquiryId 
 * @param {string} cppccId 
 * @param {string[]} answers - 回应列表
 * @returns {Object} 回应对象
 */
function step6_2_respond(meetingId, inquiryId, cppccId, answers) {
    // 记录回应到状态
    recordInquiryResponse(meetingId, cppccId, answers);
    
    const msg = `【步骤6-2：政协回应质询】

政协委员 ${cppccId} 回应质询：

${answers.map((a, i) => `${i + 1}. ${a}`).join('\n')}`;

    return {
        meetingId,
        inquiryId,
        cppccId,
        answers,
        message: msg,
        step: '6_2',
        phase: 'inquiry_response'
    };
}

/**
 * 步骤6-3：人大投票
 * @param {string} meetingId 
 * @param {string} npcId 
 * @param {string} vote - 赞成/反对/弃权
 * @param {string} reason - 投票理由
 * @returns {Object} 投票结果
 */
function step6_3_vote(meetingId, npcId, vote, reason) {
    const validVotes = ['赞成', '反对', '弃权'];
    if (!validVotes.includes(vote)) {
        throw new Error(`无效投票: ${vote}，必须是：${validVotes.join('/')}`);
    }
    
    if (!reason || reason.trim().length === 0) {
        throw new Error('投票必须附带理由');
    }
    
    // 记录投票
    const state = loadState(meetingId);
    if (!state) throw new Error(`会议不存在: ${meetingId}`);
    
    if (!state.votes) state.votes = {};
    state.votes[npcId] = {
        vote,
        reason,
        votedAt: new Date().toISOString()
    };
    saveState(state);
    
    return {
        vote,
        reason,
        requirement: '投票必须附带理由',
        step: '6_3',
        phase: 'voting'
    };
}

/**
 * 步骤7：决策输出
 * @param {string} meetingId 
 * @returns {Object} 决策结果
 */
function step7_decision(meetingId) {
    const state = loadState(meetingId);
    if (!state) throw new Error(`会议不存在: ${meetingId}`);
    
    const votes = Object.values(state.votes);
    const summary = { 赞成: 0, 反对: 0, 弃权: 0, total: votes.length };
    
    votes.forEach(v => {
        if (summary[v.vote] !== undefined) summary[v.vote]++;
    });
    
    // 少数服从多数
    let decision;
    if (summary.赞成 > summary.反对) {
        decision = '通过';
    } else if (summary.反对 > summary.赞成) {
        decision = '否决';
    } else {
        decision = '需要重新讨论';
    }
    
    // 更新状态
    state.status = 'completed';
    state.finalDecision = {
        decision,
        summary,
        decidedAt: new Date().toISOString()
    };
    saveState(state);
    
    return {
        decision,
        summary,
        step: '7',
        phase: 'decision'
    };
}

/**
 * 执行改进后的七步闭环
 * @param {string} topic 
 * @param {Object} participants 
 * @returns {Object} 会议初始化结果
 */
async function runImprovedMeeting(topic, participants) {
    const meetingId = `meeting-${Date.now()}`;
    
    // 创建会议
    createMeetingState({
        meetingId,
        topic,
        participants
    });
    
    console.log(`会议创建: ${meetingId}`);
    console.log(`议题: ${topic}`);
    
    return {
        meetingId,
        steps: {
            step5_1: '政协独立输出',
            step5_2: '意见共享+立场标记',
            step6_1: '人大质询（强制）',
            step6_2: '政协回应质询',
            step6_3: '人大投票',
            step7: '决策输出'
        }
    };
}

module.exports = {
    step5_1_independentOutput,
    step5_2_shareAndMark,
    step6_1_inquiry,
    step6_2_respond,
    step6_3_vote,
    step7_decision,
    runImprovedMeeting
};