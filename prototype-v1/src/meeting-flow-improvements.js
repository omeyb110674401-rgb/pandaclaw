/**
 * 七步闭环流程改进方案
 * @description 解决真实验证中发现的问题
 * @date 2026-03-25
 * @approved-by cppcc-1, npc-2
 */

const IMPROVEMENTS = {
  // P2-1: 独立思考验证
  independentThinking: {
    problem: '委员被动响应，答案可预测',
    solution: {
      messageFormat: '议题不含背景，委员先独立输出',
      verification: '统计意见分歧率（一致率>80%说明未独立）',
      implementation: `
// 步骤5消息改为纯议题，无任何背景
const msg = \`【开放性议题】
\${topic}
请独立思考，给出你的方案。无任何预设答案。\`;
`
    }
  },

  // P2-2: 交互环激活
  interactionRing: {
    problem: '委员看不到彼此意见，无讨论链',
    solution: {
      rounds: 2,
      flow: `
步骤5-1: 政协独立输出（不看他人）
    ↓
main汇总意见，广播给所有政协
    ↓
步骤5-2: 政协参考他人，选择"附议/补充/反对"
`,
      modules: ['cppcc-interaction.js'],
      functions: ['getVisibleOpinions', 'recordOpinion']
    }
  },

  // P2-3: 质询权行使
  inquiryChannel: {
    problem: '人大只投票不质询',
    solution: {
      requirement: '步骤6强制质询：人大投票前必须提出≥1个质疑问题',
      flow: `
步骤6-1: 人大的质询（必须提问）
    ↓
政协回应质询
    ↓
步骤6-2: 人大投票（带理由）
`,
      modules: ['npc-inquiry.js'],
      functions: ['createInquiry', 'answerInquiry']
    }
  }
};

// 改造后的七步闭环流程
const IMPROVED_FLOW = {
  1: { name: '目标对齐', unchanged: true },
  2: { name: '信息共享', unchanged: true },
  3: { name: '角色分工', unchanged: true },
  4: { name: '协调机制', unchanged: true },
  5: {
    name: '反馈闭环',
    changed: true,
    rounds: [
      { round: 1, action: '政协独立输出' },
      { round: 2, action: '意见共享+标记' }
    ]
  },
  6: {
    name: '监督制衡',
    changed: true,
    rounds: [
      { round: 1, action: '人大质询' },
      { round: 2, action: '政协回应' },
      { round: 3, action: '人大投票' }
    ]
  },
  7: { name: '纠错机制', unchanged: true }
};

module.exports = { IMPROVEMENTS, IMPROVED_FLOW };