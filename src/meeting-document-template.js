/**
 * 会议文件模板生成器
 * @author cppcc-4 (产品专家)
 * @version 2.0 - 官方文件风格
 * @updated 2026-03-27
 * 
 * 参照格式：
 * - 国务院白皮书
 * - 中共中央红头文件
 * - 中央一号文件
 */

const { loadState, getVoteResult } = require('./meeting-state-store');

/**
 * 生成会议文件编号
 * 格式：熊猫协字〔YYYY〕NNN 号
 */
function generateDocumentNumber(meetingId) {
  const year = new Date().getFullYear();
  const hash = meetingId.split('-').pop() || Date.now().toString().slice(-6);
  const seq = parseInt(hash, 16) % 1000;
  return `熊猫协字〔${year}〕${String(seq).padStart(3, '0')}号`;
}

/**
 * 生成会议文件封面
 */
function generateCover(state) {
  const docNo = generateDocumentNumber(state.meetingId);
  const date = new Date(state.createdAt).toLocaleDateString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  
  return `
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                          民 主 协 商 会 议 文 件                          │
│                                                                         │
│                              熊 猫 协 字                                  │
│                                                                         │
│                         ${docNo}                          │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   会议议题：${state.topic.padEnd(50)}│
│                                                                         │
│   会议类型：${getMeetingType(state.type || 'project-planning').padEnd(50)}│
│                                                                         │
│   复杂程度：${getComplexityLabel(state.complexity).padEnd(50)}│
│                                                                         │
│   召开日期：${date.padEnd(50)}│
│                                                                         │
│   会议状态：${getStatusLabel(state.status).padEnd(50)}│
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   政协委员：${state.participants.cppcc.join('、').padEnd(50)}│
│                                                                         │
│   人大代表：${state.participants.npc.join('、').padEnd(50)}│
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
`;
}

/**
 * 生成会议正文（白皮书风格）
 */
function generateFullReport(state) {
  const docNo = generateDocumentNumber(state.meetingId);
  const date = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
  
  let content = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                         民 主 协 商 会 议 报 告
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

                        ${docNo}

───────────────────────────────────────────────────────────────────────
                           目        录
───────────────────────────────────────────────────────────────────────

  一、会议概况
      （一）会议议题
      （二）会议背景
      （三）参会人员
      （四）身份配置
  
  二、协商过程
      （一）目标对齐（步骤 1）
      （二）信息共享（步骤 2）
      （三）角色分工（步骤 3）
      （四）协调机制（步骤 4）
      （五）政协协商（步骤 5）
          1. 独立输出（5-1）
          2. 意见共享（5-2）
      （六）人大表决（步骤 6）
          1. 质询环节（6-1）
          2. 政协回应（6-2）
          3. 投票表决（6-3）
  
  三、会议决议
      （一）表决结果
      （二）最终决策
      （三）后续工作安排
  
  四、附件
      （一）政协委员意见书
      （二）人大代表质询记录
      （三）投票记录明细
  
───────────────────────────────────────────────────────────────────────
`;

  // 一、会议概况
  content += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                          一、会 议 概 况
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  （一）会议议题

      ${state.topic}

  （二）会议背景

${state.description || '（无）'}

  （三）参会人员

      政协委员会（协商议政）：
`;

  state.participants.cppcc.forEach(id => {
    const expertise = state.expertiseBindings?.[id]?.expertiseName || '未配置';
    content += `          · ${id}（${expertise}）\n`;
  });

  content += `\n      人民代表大会（审议表决）：\n`;
  state.participants.npc.forEach(id => {
    const expertise = state.expertiseBindings?.[id]?.expertiseName || '未配置';
    content += `          · ${id}（${expertise}）\n`;
  });

  // 二、协商过程
  content += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                         二、协 商 过 程
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

  // 步骤 5：政协协商
  content += `
  （五）政协协商

      1. 独立输出（步骤 5-1）

          各位政协委员从专业视角独立分析，提出意见建议：

`;

  const opinions = state.opinions || {};
  for (const [agentId, data] of Object.entries(opinions)) {
    if (agentId.startsWith('cppcc')) {
      const expertise = state.expertiseBindings?.[agentId]?.expertiseName || agentId;
      content += `          【${agentId}】（${expertise}）\n`;
      content += `              ${data.opinion || data.analysis || '(无)'}\n\n`;
    }
  }

  // 步骤 5-2：立场标记
  content += `
      2. 意见共享与立场标记（步骤 5-2）

`;

  for (const [agentId, data] of Object.entries(opinions)) {
    if (agentId.startsWith('cppcc') && data.stance) {
      const expertise = state.expertiseBindings?.[agentId]?.expertiseName || agentId;
      content += `          · ${agentId}（${expertise}）：${data.stance}\n`;
      if (data.reason) content += `            理由：${data.reason}\n`;
    }
  }

  // 步骤 6：人大表决
  content += `
  （六）人大表决

      1. 质询环节（步骤 6-1）

          人大代表对政协提案提出质询：

`;

  const inquiries = state.inquiries || {};
  for (const [npcId, data] of Object.entries(inquiries)) {
    const expertise = state.expertiseBindings?.[npcId]?.expertiseName || npcId;
    content += `          【${npcId}】（${expertise}）\n`;
    data.questions.forEach((q, i) => {
      content += `              ${i + 1}. ${q}\n`;
    });
    content += `\n`;
  }

  // 步骤 6-2：政协回应
  content += `
      2. 政协回应（步骤 6-2）

`;

  const responses = state.inquiryResponses || {};
  for (const [cppccId, data] of Object.entries(responses)) {
    const expertise = state.expertiseBindings?.[cppccId]?.expertiseName || cppccId;
    content += `          【${cppccId}】（${expertise}）\n`;
    data.answers.forEach((a, i) => {
      content += `              ${i + 1}. ${a}\n`;
    });
    content += `\n`;
  }

  // 步骤 6-3：投票
  content += `
      3. 投票表决（步骤 6-3）

`;

  const votes = state.votes || {};
  for (const [agentId, data] of Object.entries(votes)) {
    if (agentId.startsWith('npc')) {
      const expertise = state.expertiseBindings?.[agentId]?.expertiseName || agentId;
      content += `          · ${agentId}（${expertise}）：${data.vote}\n`;
      if (data.reason) content += `            理由：${data.reason}\n`;
    }
  }

  // 三、会议决议
  const voteResult = getVoteResult(state.meetingId);
  const passed = voteResult.赞成 > voteResult.反对;
  
  content += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                         三、会 议 决 议
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  （一）表决结果

      赞成：${voteResult.赞成}票    反对：${voteResult.反对}票    弃权：${voteResult.弃权}票

      表决结果：${passed ? '✅ 通 过' : '❌ 未通过'}

  （二）最终决策

      ${state.finalDecision || '（待生成）'}

  （三）后续工作安排

      1. 责任主体：${state.participants.npc[0] || '待定'}
      2. 完成时限：${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('zh-CN')}
      3. 验收标准：${passed ? '按提案执行' : '重新协商'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                          四、附        件
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  附件 1：政协委员意见书（详见会议记录）
  附件 2：人大代表质询记录（详见会议记录）
  附件 3：投票记录明细（详见会议记录）

───────────────────────────────────────────────────────────────────────

                          ${date}

                    民主协商会议系统 印制

───────────────────────────────────────────────────────────────────────

  抄送：各参会委员、代表
  印发单位：民主协商会议系统
  印发日期：${date}
  共印 ${state.participants.cppcc.length + state.participants.npc.length} 份

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

  return content;
}

/**
 * 生成红头文件格式（简化版）
 */
function generateRedHeaderDocument(state) {
  const docNo = generateDocumentNumber(state.meetingId);
  const date = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  return `
╔═══════════════════════════════════════════════════════════════════════╗
║                                                                       ║
║                    民 主 协 商 会 议 文 件                              ║
║                                                                       ║
║                        熊猫协字〔2026〕                               ║
║                                                                       ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  关于"${state.topic}"的决议                                            ║
║                                                                       ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  各参会委员、代表：                                                    ║
║                                                                       ║
║      经民主协商会议审议，现就"${state.topic}"作出如下决议：               ║
║                                                                       ║
║      ${typeof state.finalDecision === 'string' ? state.finalDecision : (state.finalDecision?.text || '（待生成）')}                                    ║
║                                                                       ║
║      表决结果：赞成${getVoteResult(state.meetingId).赞成}票，反对${getVoteResult(state.meetingId).反对}票，弃权${getVoteResult(state.meetingId).弃权}票。    ║
║                                                                       ║
║      本决议自通过之日起生效。                                          ║
║                                                                       ║
║                                                                       ║
║                                        ${date}                        ║
║                                                                       ║
║                                   民主协商会议系统                    ║
║                                                                       ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  主题词：协商  决策  会议  决议                                       ║
║  抄送：各参会委员、代表                                               ║
║  印发：民主协商会议系统                    ${date}印发                ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
`;
}

/**
 * 生成会议纪要（简洁版）
 */
function generateMeetingMinutes(state) {
  const date = new Date(state.createdAt).toLocaleDateString('zh-CN');
  const voteResult = getVoteResult(state.meetingId);
  
  return `
【会议纪要】

会议议题：${state.topic}
会议时间：${date}
参会人员：政协${state.participants.cppcc.length}人，人大${state.participants.npc.length}人

────────────────────────────────

【协商意见】
${Object.entries(state.opinions || {})
  .filter(([id]) => id.startsWith('cppcc'))
  .map(([id, data]) => `· ${id}: ${data.opinion?.slice(0, 50) || '(无)'}...`)
  .join('\n')}

【质询问题】
${Object.entries(state.inquiries || {})
  .flatMap(([, data]) => data.questions)
  .map(q => `· ${q.slice(0, 50)}...`)
  .join('\n') || '(无)'}

【表决结果】
赞成：${voteResult.赞成}票  反对：${voteResult.反对}票  弃权：${voteResult.弃权}票

【决议】
${passed ? '✅ 通过' : '❌ 未通过'}

────────────────────────────────
`;
}

// 辅助函数
function getMeetingType(type) {
  const types = {
    'project-planning': '项目规划会议',
    'proposal-review': '提案审议会议',
    'progress-check': '进度检查会议',
    'problem-solving': '问题解决会议',
    'final-acceptance': '最终验收会议'
  };
  return types[type] || '常规协商会议';
}

function getComplexityLabel(complexity) {
  const labels = {
    'simple': '简单（2 政协 +1 人大）',
    'medium': '中等（3 政协 +2 人大）',
    'complex': '复杂（4 政协 +3 人大）',
    'enterprise': '企业级（5 政协 +5 人大）'
  };
  return labels[complexity] || complexity;
}

function getStatusLabel(status) {
  const labels = {
    'pending': '待开始',
    'in-progress': '进行中',
    'paused': '已暂停',
    'completed': '已完成',
    'rejected': '已终止'
  };
  return labels[status] || status;
}

module.exports = {
  generateCover,
  generateFullReport,
  generateRedHeaderDocument,
  generateMeetingMinutes,
  generateDocumentNumber
};