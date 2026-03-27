/**
 * 会议大流程定义
 * @version 3.0 - 双维度效率控制
 * @updated 2026-03-27
 * 
 * 核心设计：
 * 1. 大流程 = 文书产生流程（国家文件产生流程）
 * 2. 每个步骤可召开七步闭环会议
 * 3. 双维度效率控制：人数 + 验收
 * 
 * 七步闭环详见 AGENTS.md
 */

/**
 * 验收模式
 */
const VALIDATION_MODES = {
  FULL: 'full',      // 完整验收 - 每步用户验收
  KEY: 'key',        // 关键验收 - 步骤1+3验收
  SKIP: 'skip'       // 跳过验收 - Agent内部确认
};

/**
 * 复杂度配置（人数）
 */
const COMPLEXITY_CONFIG = {
  simple: { cppcc: 2, npc: 1 },
  medium: { cppcc: 3, npc: 2 },
  complex: { cppcc: 4, npc: 3 },
  enterprise: { cppcc: 5, npc: 5 }
};

/**
 * 协商型会议（白皮书风格）
 */
const CONSULTATION_FLOW = {
  type: 'CONSULTATION',
  name: '协商型会议',
  icon: '📘',
  description: '重大议题深度协商，形成系统性方案',
  
  // 默认配置
  defaults: {
    complexity: 'medium',
    validationMode: VALIDATION_MODES.KEY
  },
  
  // 大流程
  stages: [
    {
      id: 'initiation',
      name: '立项',
      description: '确定议题，明确协商目标',
      defaultComplexity: 'simple',
      defaultValidation: VALIDATION_MODES.SKIP,
      outputs: ['立项报告']
    },
    {
      id: 'team_formation',
      name: '成立起草组',
      description: '组建协商团队，分配专业身份',
      defaultComplexity: 'simple',
      defaultValidation: VALIDATION_MODES.SKIP,
      outputs: ['起草组名单', '角色矩阵']
    },
    {
      id: 'research',
      name: '调查研究',
      description: '收集背景资料，开展深度调研',
      defaultComplexity: 'medium',
      defaultValidation: VALIDATION_MODES.KEY,
      outputs: ['调研报告', '上下文包']
    },
    {
      id: 'drafting',
      name: '起草初稿',
      description: '政协委员独立分析，形成初步方案',
      defaultComplexity: 'medium',
      defaultValidation: VALIDATION_MODES.SKIP,
      outputs: ['个人意见书'],
      isKeyStage: true  // 关键阶段
    },
    {
      id: 'consultation',
      name: '征求意见',
      description: '分享意见，开展多轮协商',
      defaultComplexity: 'complex',
      defaultValidation: VALIDATION_MODES.KEY,
      outputs: ['意见汇总', '立场记录']
    },
    {
      id: 'review',
      name: '审议表决',
      description: '人大审议，投票表决',
      defaultComplexity: 'complex',
      defaultValidation: VALIDATION_MODES.FULL,
      outputs: ['质询记录', '投票结果'],
      isKeyStage: true  // 关键阶段
    },
    {
      id: 'publication',
      name: '审定发布',
      description: '形成最终决策，正式发布',
      defaultComplexity: 'medium',
      defaultValidation: VALIDATION_MODES.KEY,
      outputs: ['决策文件', '完整档案']
    }
  ]
};

/**
 * 战略型会议（一号文件风格）
 */
const STRATEGIC_FLOW = {
  type: 'STRATEGIC',
  name: '战略型会议',
  icon: '📜',
  description: '年度/季度战略部署，顶层决策',
  
  defaults: {
    complexity: 'enterprise',
    validationMode: VALIDATION_MODES.FULL
  },
  
  stages: [
    {
      id: 'assessment',
      name: '中期评估',
      description: '评估上一周期战略执行情况',
      defaultComplexity: 'medium',
      defaultValidation: VALIDATION_MODES.KEY,
      outputs: ['中期评估报告']
    },
    {
      id: 'research',
      name: '前期研究',
      description: '深度研究，形成战略建议',
      defaultComplexity: 'complex',
      defaultValidation: VALIDATION_MODES.KEY,
      outputs: ['战略研究报告', '环境分析报告']
    },
    {
      id: 'drafting',
      name: '建议起草',
      description: '起草战略建议文件',
      defaultComplexity: 'complex',
      defaultValidation: VALIDATION_MODES.KEY,
      outputs: ['战略建议稿']
    },
    {
      id: 'consultation',
      name: '征求意见',
      description: '多渠道征求意见',
      defaultComplexity: 'enterprise',
      defaultValidation: VALIDATION_MODES.FULL,
      outputs: ['意见汇总', '修改后的建议稿']
    },
    {
      id: 'npc_review',
      name: '人大审议',
      description: '人大常委会审议',
      defaultComplexity: 'enterprise',
      defaultValidation: VALIDATION_MODES.FULL,
      outputs: ['审议意见', '决议'],
      isKeyStage: true
    },
    {
      id: 'planning',
      name: '规划编制',
      description: '编制详细实施规划',
      defaultComplexity: 'complex',
      defaultValidation: VALIDATION_MODES.KEY,
      outputs: ['实施规划', '里程碑计划']
    },
    {
      id: 'approval',
      name: '最终批准',
      description: '最终批准并发布',
      defaultComplexity: 'enterprise',
      defaultValidation: VALIDATION_MODES.FULL,
      outputs: ['战略文件', '执行决议'],
      isKeyStage: true
    }
  ]
};

/**
 * 决议型会议（红头文件风格）
 */
const RESOLUTION_FLOW = {
  type: 'RESOLUTION',
  name: '决议型会议',
  icon: '📕',
  description: '快速决策，正式下发执行',
  
  defaults: {
    complexity: 'medium',
    validationMode: VALIDATION_MODES.SKIP
  },
  
  stages: [
    {
      id: 'initiation',
      name: '立项',
      description: '快速确定议题',
      defaultComplexity: 'simple',
      defaultValidation: VALIDATION_MODES.SKIP,
      outputs: ['立项单']
    },
    {
      id: 'drafting',
      name: '起草',
      description: '快速形成决议草案',
      defaultComplexity: 'medium',
      defaultValidation: VALIDATION_MODES.SKIP,
      outputs: ['决议草案']
    },
    {
      id: 'review',
      name: '审议',
      description: '人大审议表决',
      defaultComplexity: 'medium',
      defaultValidation: VALIDATION_MODES.SKIP,
      outputs: ['审议结果', '投票记录'],
      isKeyStage: true
    },
    {
      id: 'publication',
      name: '签署公布',
      description: '签署发布',
      defaultComplexity: 'simple',
      defaultValidation: VALIDATION_MODES.SKIP,
      outputs: ['正式决议文件']
    }
  ]
};

/**
 * 规划型会议（规划纲要风格）
 */
const PLANNING_FLOW = {
  type: 'PLANNING',
  name: '规划型会议',
  icon: '📊',
  description: '中长期规划，承上启下',
  
  defaults: {
    complexity: 'complex',
    validationMode: VALIDATION_MODES.KEY
  },
  
  stages: [
    {
      id: 'assessment',
      name: '中期评估',
      description: '评估上一周期规划执行情况',
      defaultComplexity: 'medium',
      defaultValidation: VALIDATION_MODES.KEY,
      outputs: ['中期评估报告']
    },
    {
      id: 'research',
      name: '趋势研究',
      description: '研究未来趋势和方向',
      defaultComplexity: 'complex',
      defaultValidation: VALIDATION_MODES.KEY,
      outputs: ['趋势研究报告']
    },
    {
      id: 'drafting',
      name: '建议起草',
      description: '起草规划建议',
      defaultComplexity: 'complex',
      defaultValidation: VALIDATION_MODES.KEY,
      outputs: ['规划建议稿']
    },
    {
      id: 'consultation',
      name: '征求意见',
      description: '多方征求意见',
      defaultComplexity: 'complex',
      defaultValidation: VALIDATION_MODES.KEY,
      outputs: ['意见汇总', '完善后的规划稿']
    },
    {
      id: 'planning',
      name: '规划编制',
      description: '编制详细规划',
      defaultComplexity: 'complex',
      defaultValidation: VALIDATION_MODES.KEY,
      outputs: ['详细规划', '里程碑计划']
    },
    {
      id: 'approval',
      name: '审议批准',
      description: '审议批准发布',
      defaultComplexity: 'enterprise',
      defaultValidation: VALIDATION_MODES.FULL,
      outputs: ['规划文件', '批准决议'],
      isKeyStage: true
    }
  ]
};

/**
 * 立法型会议（行政法规风格）
 */
const LEGISLATIVE_FLOW = {
  type: 'LEGISLATIVE',
  name: '立法型会议',
  icon: '⚖️',
  description: '制定规范、制度、标准',
  
  defaults: {
    complexity: 'enterprise',
    validationMode: VALIDATION_MODES.FULL
  },
  
  stages: [
    {
      id: 'initiation',
      name: '立项',
      description: '确定规范/制度必要性',
      defaultComplexity: 'medium',
      defaultValidation: VALIDATION_MODES.KEY,
      outputs: ['立项报告']
    },
    {
      id: 'drafting',
      name: '起草',
      description: '起草规范草案',
      defaultComplexity: 'complex',
      defaultValidation: VALIDATION_MODES.KEY,
      outputs: ['规范草案（征求意见稿）']
    },
    {
      id: 'public_consultation',
      name: '公开征求意见',
      description: '向社会公开征求意见',
      defaultComplexity: 'enterprise',
      defaultValidation: VALIDATION_MODES.FULL,
      outputs: ['意见汇总报告'],
      isKeyStage: true
    },
    {
      id: 'expert_review',
      name: '专家论证',
      description: '组织专家论证会',
      defaultComplexity: 'enterprise',
      defaultValidation: VALIDATION_MODES.FULL,
      outputs: ['专家论证报告', '修改后的草案']
    },
    {
      id: 'compliance_review',
      name: '合规审查',
      description: '合规部门审查',
      defaultComplexity: 'enterprise',
      defaultValidation: VALIDATION_MODES.FULL,
      outputs: ['合规审查报告']
    },
    {
      id: 'deliberation',
      name: '审议',
      description: '会议审议',
      defaultComplexity: 'enterprise',
      defaultValidation: VALIDATION_MODES.FULL,
      outputs: ['审议决议'],
      isKeyStage: true
    },
    {
      id: 'publication',
      name: '签署公布',
      description: '正式发布',
      defaultComplexity: 'complex',
      defaultValidation: VALIDATION_MODES.KEY,
      outputs: ['正式规范文件']
    },
    {
      id: 'implementation',
      name: '施行',
      description: '规范正式施行',
      defaultComplexity: 'medium',
      defaultValidation: VALIDATION_MODES.KEY,
      outputs: ['施行报告']
    }
  ]
};

/**
 * 纪要型会议（会议纪要风格）
 */
const MINUTES_FLOW = {
  type: 'MINUTES',
  name: '纪要型会议',
  icon: '📝',
  description: '快速记录，内部存档',
  
  defaults: {
    complexity: 'simple',
    validationMode: VALIDATION_MODES.SKIP
  },
  
  stages: [
    {
      id: 'recording',
      name: '记录',
      description: '会议讨论记录',
      defaultComplexity: 'simple',
      defaultValidation: VALIDATION_MODES.SKIP,
      outputs: ['原始记录']
    },
    {
      id: 'compilation',
      name: '整理',
      description: '整理纪要内容',
      defaultComplexity: 'simple',
      defaultValidation: VALIDATION_MODES.SKIP,
      outputs: ['会议纪要草稿']
    },
    {
      id: 'confirmation',
      name: '确认',
      description: '确认纪要内容',
      defaultComplexity: 'simple',
      defaultValidation: VALIDATION_MODES.SKIP,
      outputs: ['确认后的纪要']
    },
    {
      id: 'archiving',
      name: '存档',
      description: '归档保存',
      defaultComplexity: 'simple',
      defaultValidation: VALIDATION_MODES.SKIP,
      outputs: ['归档纪要']
    }
  ]
};

/**
 * 获取流程配置
 */
function getFlowConfig(typeId) {
  const flows = {
    'CONSULTATION': CONSULTATION_FLOW,
    'STRATEGIC': STRATEGIC_FLOW,
    'RESOLUTION': RESOLUTION_FLOW,
    'PLANNING': PLANNING_FLOW,
    'LEGISLATIVE': LEGISLATIVE_FLOW,
    'MINUTES': MINUTES_FLOW
  };
  
  return flows[typeId?.toUpperCase()] || CONSULTATION_FLOW;
}

/**
 * 获取复杂度配置
 */
function getComplexityConfig(complexity) {
  return COMPLEXITY_CONFIG[complexity] || COMPLEXITY_CONFIG.medium;
}

/**
 * 获取验收模式
 */
function getValidationMode(mode) {
  return VALIDATION_MODES[mode?.toUpperCase()] || VALIDATION_MODES.KEY;
}

/**
 * 获取阶段详情（包含复杂度和验收配置）
 */
function getStageWithConfig(typeId, stageId, customComplexity, customValidation) {
  const flow = getFlowConfig(typeId);
  const stage = flow.stages.find(s => s.id === stageId);
  
  if (!stage) return null;
  
  return {
    ...stage,
    complexity: customComplexity || stage.defaultComplexity,
    validation: customValidation || stage.defaultValidation,
    participants: getComplexityConfig(customComplexity || stage.defaultComplexity)
  };
}

module.exports = {
  // 流程定义
  CONSULTATION_FLOW,
  STRATEGIC_FLOW,
  RESOLUTION_FLOW,
  PLANNING_FLOW,
  LEGISLATIVE_FLOW,
  MINUTES_FLOW,
  
  // 配置
  VALIDATION_MODES,
  COMPLEXITY_CONFIG,
  
  // 工具函数
  getFlowConfig,
  getComplexityConfig,
  getValidationMode,
  getStageWithConfig
};