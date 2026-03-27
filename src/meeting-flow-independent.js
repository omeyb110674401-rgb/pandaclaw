/**
 * 会议类型独立流程定义
 * @author cppcc-4 (产品专家)
 * @version 3.0 - 独立流程设计（不以七步闭环为预设）
 * @updated 2026-03-27
 * 
 * 核心原则：
 * - 每种会议类型有独立的流程定义
 * - 不是从某个"标准流程"减法，而是独立设计
 * - 参照国家对应文件的产生流程
 * 
 * 国家文件产生流程（独立，非预设）：
 * - 白皮书：立项→成立起草组→调查研究→起草初稿→征求意见→修改完善→审定发布（7 步）
 * - 一号文件：中期评估→前期研究→建议起草→征求意见→审议通过→纲要编制→人大批准（7 步）
 * - 红头文件：立项→起草→征求意见→论证→审查→审议→签署公布（7 步）
 * - 规划纲要：中期评估→前期研究→建议起草→征求意见→全会审议→编制→人大批准（7 步）
 * - 行政法规：立项→起草→公开征求意见→论证→审查→审议→签署公布→施行（8 步）
 * - 会议纪要：记录→整理→确认→存档（4 步）
 * 
 * 注意：这些流程各不相同，没有"标准模板"
 */

/**
 * 协商型会议流程（白皮书风格）
 * 
 * 国家白皮书产生流程（完整 7 步）：
 * 1. 立项 - 国务院新闻办提出选题，报中央批准
 * 2. 成立起草组 - 相关部门专家组成
 * 3. 调查研究 - 收集资料、实地调研
 * 4. 起草初稿 - 分工撰写各章节
 * 5. 征求意见 - 征求相关部门、专家意见
 * 6. 修改完善 - 吸收合理意见，反复修改
 * 7. 审定发布 - 国务院新闻办会议审定，正式发布
 */
const CONSULTATION_FLOW = {
  type: 'CONSULTATION',
  name: '协商型会议',
  icon: '📘',
  description: '重大议题深度协商，形成系统性方案',
  
  // 独立流程（不是七步闭环的变体）
  stages: [
    {
      id: 'initiation',
      name: '立项',
      description: '确定议题，明确协商目标',
      participants: ['main', 'user'],
      activities: [
        '提出协商议题',
        '明确目标范围',
        '确定成功标准',
        '报批立项'
      ],
      outputs: ['立项报告'],
      duration: '1-2 小时'
    },
    {
      id: 'team_formation',
      name: '成立起草组',
      description: '组建协商团队，分配专业身份',
      participants: ['main'],
      activities: [
        '确定政协委员人选',
        '确定人大代表人选',
        '分配专业身份',
        '明确职责分工'
      ],
      outputs: ['起草组名单', '角色矩阵'],
      duration: '30 分钟'
    },
    {
      id: 'research',
      name: '调查研究',
      description: '收集背景资料，开展深度调研',
      participants: ['cppcc'],
      activities: [
        '收集背景资料',
        '分析历史数据',
        '调研最佳实践',
        '形成调研报告'
      ],
      outputs: ['调研报告', '上下文包'],
      duration: '1-3 天',
      parallel: true  // 可并行开展
    },
    {
      id: 'drafting',
      name: '起草初稿',
      description: '政协委员独立分析，形成初步方案',
      participants: ['cppcc'],
      activities: [
        '独立分析议题',
        '提出专业建议',
        '识别潜在风险',
        '形成初步方案'
      ],
      outputs: ['个人意见书'],
      duration: '2-4 小时',
      parallel: true,
      isolation: true  // 独立思考，不看他人
    },
    {
      id: 'consultation',
      name: '征求意见',
      description: '分享意见，开展多轮协商',
      participants: ['cppcc'],
      activities: [
        '分享个人意见',
        '讨论分歧点',
        '形成共识倾向',
        '修改完善方案'
      ],
      outputs: ['意见汇总', '立场记录'],
      duration: '2-3 小时',
      rounds: [
        { name: '第一轮', focus: '意见共享' },
        { name: '第二轮', focus: '深入讨论' },
        { name: '第三轮', focus: '形成共识' }
      ]
    },
    {
      id: 'review',
      name: '审议表决',
      description: '人大审议，投票表决',
      participants: ['npc'],
      activities: [
        '审查政协提案',
        '提出质询问题',
        '听取政协回应',
        '投票表决'
      ],
      outputs: ['质询记录', '投票结果'],
      duration: '1-2 小时',
      voteRule: 'simple_majority'
    },
    {
      id: 'publication',
      name: '审定发布',
      description: '形成最终决策，正式发布',
      participants: ['main'],
      activities: [
        '整理决策内容',
        '生成正式文档',
        '归档存档',
        '通知相关人员'
      ],
      outputs: ['决策文件', '完整档案'],
      duration: '30 分钟'
    }
  ],
  
  // 流程总览
  summary: {
    totalStages: 7,
    estimatedDuration: '3-7 天',
    participantRoles: {
      cppcc: '协商议政、建言献策',
      npc: '审议表决、监督决策'
    }
  }
};

/**
 * 战略型会议流程（一号文件风格）
 * 
 * 国家一号文件产生流程（完整 7 步）：
 * 1. 中期评估 - 评估上一周期规划实施情况
 * 2. 前期研究 - 发改委组织课题研究（2 年）
 * 3. 建议起草 - 中央文件起草组形成《建议》
 * 4. 征求意见 - 党内、党外、网上征求意见
 * 5. 审议通过 - 中央全会审议通过《建议》
 * 6. 纲要编制 - 发改委编制《纲要》
 * 7. 人大批准 - 全国人大审议通过
 */
const STRATEGIC_FLOW = {
  type: 'STRATEGIC',
  name: '战略型会议',
  icon: '📜',
  description: '年度/季度战略部署，顶层决策',
  
  // 独立流程（参照一号文件）
  stages: [
    {
      id: 'assessment',
      name: '中期评估',
      description: '评估上一周期战略执行情况',
      participants: ['main', 'npc'],
      activities: [
        '回顾战略目标',
        '评估执行进度',
        '分析偏差原因',
        '总结经验教训'
      ],
      outputs: ['中期评估报告'],
      duration: '3-7 天'
    },
    {
      id: 'research',
      name: '前期研究',
      description: '深度研究，形成战略建议',
      participants: ['cppcc', 'external_experts'],
      activities: [
        '环境扫描分析',
        '趋势研判预测',
        '资源能力评估',
        '形成战略建议'
      ],
      outputs: ['战略研究报告', '环境分析报告'],
      duration: '7-30 天',
      parallel: true
    },
    {
      id: 'drafting',
      name: '建议起草',
      description: '起草战略建议文件',
      participants: ['cppcc'],
      activities: [
        '确定战略方向',
        '制定战略目标',
        '规划实施路径',
        '形成建议稿'
      ],
      outputs: ['战略建议稿'],
      duration: '3-5 天'
    },
    {
      id: 'consultation',
      name: '征求意见',
      description: '多渠道征求意见',
      participants: ['cppcc', 'npc', 'stakeholders'],
      activities: [
        '内部征求意见',
        '专家论证',
        '利益相关方反馈',
        '汇总修改意见'
      ],
      outputs: ['意见汇总', '修改后的建议稿'],
      duration: '7-15 天'
    },
    {
      id: 'npc_review',
      name: '人大审议',
      description: '人大常委会审议',
      participants: ['npc'],
      activities: [
        '审查战略建议',
        '提出修改意见',
        '表决是否通过',
        '形成决议'
      ],
      outputs: ['审议意见', '决议'],
      duration: '1-2 天',
      voteRule: 'two_thirds'
    },
    {
      id: 'planning',
      name: '规划编制',
      description: '编制详细实施规划',
      participants: ['cppcc'],
      activities: [
        '分解战略目标',
        '制定里程碑',
        '配置资源预算',
        '明确责任分工'
      ],
      outputs: ['实施规划', '里程碑计划'],
      duration: '3-7 天'
    },
    {
      id: 'approval',
      name: '最终批准',
      description: '最终批准并发布',
      participants: ['npc', 'main'],
      activities: [
        '审议实施规划',
        '最终投票批准',
        '正式发布',
        '归档存档'
      ],
      outputs: ['战略文件', '执行决议'],
      duration: '1 天',
      voteRule: 'two_thirds'
    }
  ],
  
  summary: {
    totalStages: 7,
    estimatedDuration: '30-60 天',
    participantRoles: {
      cppcc: '战略研究、规划编制',
      npc: '战略审议、最终批准'
    }
  }
};

/**
 * 决议型会议流程（红头文件风格）
 * 
 * 红头文件产生流程（简化版）：
 * 1. 立项 - 确定发文必要性
 * 2. 起草 - 形成决议初稿
 * 3. 征求意见 - 征求相关部门意见
 * 4. 审议 - 领导班子审议
 * 5. 签署公布 - 正式发布
 */
const RESOLUTION_FLOW = {
  type: 'RESOLUTION',
  name: '决议型会议',
  icon: '📕',
  description: '快速决策，正式下发执行',
  
  // 独立流程（简化高效）
  stages: [
    {
      id: 'initiation',
      name: '立项',
      description: '快速确定议题',
      participants: ['main', 'user'],
      activities: [
        '提出决议事项',
        '明确决策目标',
        '确定紧急程度'
      ],
      outputs: ['立项单'],
      duration: '10 分钟'
    },
    {
      id: 'drafting',
      name: '起草',
      description: '快速形成决议草案',
      participants: ['cppcc'],
      activities: [
        '分析决策事项',
        '提出建议方案',
        '形成决议草案'
      ],
      outputs: ['决议草案'],
      duration: '20 分钟'
    },
    {
      id: 'review',
      name: '审议',
      description: '人大审议表决',
      participants: ['npc'],
      activities: [
        '审议决议草案',
        '提出修改意见',
        '投票表决'
      ],
      outputs: ['审议结果', '投票记录'],
      duration: '15 分钟',
      voteRule: 'simple_majority'
    },
    {
      id: 'publication',
      name: '签署公布',
      description: '签署发布',
      participants: ['main'],
      activities: [
        '整理最终决议',
        '生成正式文件',
        '通知执行'
      ],
      outputs: ['正式决议文件'],
      duration: '5 分钟'
    }
  ],
  
  summary: {
    totalStages: 4,
    estimatedDuration: '1 小时内',
    participantRoles: {
      cppcc: '快速分析、提出建议',
      npc: '审议表决'
    }
  }
};

/**
 * 规划型会议流程（规划纲要风格）
 * 
 * 规划纲要产生流程：
 * 1. 中期评估 - 评估上一周期规划
 * 2. 前期研究 - 研究未来趋势
 * 3. 建议起草 - 形成规划建议
 * 4. 征求意见 - 多方征求意见
 * 5. 编制规划 - 编制详细规划
 * 6. 审议批准 - 审议批准发布
 */
const PLANNING_FLOW = {
  type: 'PLANNING',
  name: '规划型会议',
  icon: '📊',
  description: '中长期规划，承上启下',
  
  stages: [
    {
      id: 'assessment',
      name: '中期评估',
      description: '评估上一周期规划执行情况',
      participants: ['npc', 'cppcc'],
      activities: [
        '目标达成评估',
        '偏差原因分析',
        '经验教训总结',
        '改进方向确定'
      ],
      outputs: ['中期评估报告'],
      duration: '3-7 天'
    },
    {
      id: 'research',
      name: '趋势研究',
      description: '研究未来趋势和方向',
      participants: ['cppcc'],
      activities: [
        '行业趋势分析',
        '技术发展预测',
        '资源能力评估',
        '形成趋势报告'
      ],
      outputs: ['趋势研究报告'],
      duration: '7-14 天',
      parallel: true
    },
    {
      id: 'drafting',
      name: '建议起草',
      description: '起草规划建议',
      participants: ['cppcc'],
      activities: [
        '确定规划目标',
        '设计实施路径',
        '配置资源预算',
        '形成规划建议'
      ],
      outputs: ['规划建议稿'],
      duration: '3-5 天'
    },
    {
      id: 'consultation',
      name: '征求意见',
      description: '多方征求意见',
      participants: ['cppcc', 'npc', 'stakeholders'],
      activities: [
        '内部讨论',
        '专家论证',
        '利益相关方反馈',
        '修改完善'
      ],
      outputs: ['意见汇总', '完善后的规划稿'],
      duration: '7-14 天'
    },
    {
      id: 'planning',
      name: '规划编制',
      description: '编制详细规划',
      participants: ['cppcc'],
      activities: [
        '分解规划目标',
        '制定阶段性计划',
        '明确里程碑',
        '责任分工'
      ],
      outputs: ['详细规划', '里程碑计划'],
      duration: '3-7 天'
    },
    {
      id: 'approval',
      name: '审议批准',
      description: '审议批准发布',
      participants: ['npc'],
      activities: [
        '审议规划内容',
        '提出质询',
        '投票批准',
        '正式发布'
      ],
      outputs: ['规划文件', '批准决议'],
      duration: '1-2 天',
      voteRule: 'two_thirds'
    }
  ],
  
  summary: {
    totalStages: 6,
    estimatedDuration: '21-42 天',
    participantRoles: {
      cppcc: '研究分析、规划编制',
      npc: '审议批准、监督执行'
    }
  }
};

/**
 * 立法型会议流程（行政法规风格）
 * 
 * 行政法规产生流程：
 * 1. 立项 - 确定立法必要性
 * 2. 起草 - 起草法规草案
 * 3. 公开征求意见 - 向社会公开征求意见（30 天）
 * 4. 专家论证 - 组织专家论证会
 * 5. 审查 - 法规部门审查
 * 6. 审议 - 会议审议
 * 7. 签署公布 - 正式发布
 * 8. 施行 - 规定日期施行
 */
const LEGISLATIVE_FLOW = {
  type: 'LEGISLATIVE',
  name: '立法型会议',
  icon: '⚖️',
  description: '制定规范、制度、标准',
  
  stages: [
    {
      id: 'initiation',
      name: '立项',
      description: '确定规范/制度必要性',
      participants: ['main', 'user'],
      activities: [
        '提出规范需求',
        '明确规范范围',
        '确定法律依据',
        '报批立项'
      ],
      outputs: ['立项报告'],
      duration: '1-2 小时'
    },
    {
      id: 'drafting',
      name: '起草',
      description: '起草规范草案',
      participants: ['cppcc'],
      activities: [
        '研究相关法规',
        '调研最佳实践',
        '起草规范条款',
        '形成征求意见稿'
      ],
      outputs: ['规范草案（征求意见稿）'],
      duration: '3-7 天'
    },
    {
      id: 'public_consultation',
      name: '公开征求意见',
      description: '向社会公开征求意见',
      participants: ['main'],
      activities: [
        '发布征求意见公告',
        '收集反馈意见',
        '整理意见汇总',
        '分析采纳情况'
      ],
      outputs: ['意见汇总报告'],
      duration: '7-30 天',
      required: true
    },
    {
      id: 'expert_review',
      name: '专家论证',
      description: '组织专家论证会',
      participants: ['cppcc', 'external_experts'],
      activities: [
        '邀请专家',
        '组织论证会',
        '收集专家意见',
        '修改完善草案'
      ],
      outputs: ['专家论证报告', '修改后的草案'],
      duration: '3-7 天'
    },
    {
      id: 'compliance_review',
      name: '合规审查',
      description: '合规部门审查',
      participants: ['npc'],
      activities: [
        '合法性审查',
        '合规性审查',
        '可操作性审查',
        '形成审查意见'
      ],
      outputs: ['合规审查报告'],
      duration: '3-5 天'
    },
    {
      id: 'deliberation',
      name: '审议',
      description: '会议审议',
      participants: ['npc'],
      activities: [
        '审议规范内容',
        '提出修改意见',
        '投票表决',
        '形成决议'
      ],
      outputs: ['审议决议'],
      duration: '1-2 天',
      voteRule: 'two_thirds'
    },
    {
      id: 'publication',
      name: '签署公布',
      description: '正式发布',
      participants: ['main'],
      activities: [
        '整理最终稿',
        '签署发布',
        '公告施行日期'
      ],
      outputs: ['正式规范文件'],
      duration: '1 天'
    },
    {
      id: 'implementation',
      name: '施行',
      description: '规范正式施行',
      participants: ['all'],
      activities: [
        '宣传培训',
        '组织实施',
        '监督检查'
      ],
      outputs: ['施行报告'],
      duration: '持续'
    }
  ],
  
  summary: {
    totalStages: 8,
    estimatedDuration: '30-60 天',
    participantRoles: {
      cppcc: '规范起草、专家论证',
      npc: '合规审查、审议批准'
    }
  }
};

/**
 * 纪要型会议流程（会议纪要风格）
 * 
 * 会议纪要产生流程（极简）：
 * 1. 记录 - 会议讨论记录
 * 2. 整理 - 整理纪要内容
 * 3. 确认 - 确认纪要内容
 * 4. 存档 - 归档保存
 */
const MINUTES_FLOW = {
  type: 'MINUTES',
  name: '纪要型会议',
  icon: '📝',
  description: '快速记录，内部存档',
  
  stages: [
    {
      id: 'recording',
      name: '记录',
      description: '会议讨论记录',
      participants: ['cppcc', 'all'],
      activities: [
        '记录发言内容',
        '记录讨论要点',
        '记录结论意见'
      ],
      outputs: ['原始记录'],
      duration: '会议期间'
    },
    {
      id: 'compilation',
      name: '整理',
      description: '整理纪要内容',
      participants: ['main'],
      activities: [
        '整理讨论内容',
        '归纳主要观点',
        '列出待办事项'
      ],
      outputs: ['会议纪要草稿'],
      duration: '15 分钟'
    },
    {
      id: 'confirmation',
      name: '确认',
      description: '确认纪要内容',
      participants: ['cppcc'],
      activities: [
        '确认内容准确',
        '补充遗漏内容',
        '形成最终稿'
      ],
      outputs: ['确认后的纪要'],
      duration: '10 分钟'
    },
    {
      id: 'archiving',
      name: '存档',
      description: '归档保存',
      participants: ['main'],
      activities: [
        '编号归档',
        '分发相关方',
        '存档备查'
      ],
      outputs: ['归档纪要'],
      duration: '5 分钟'
    }
  ],
  
  summary: {
    totalStages: 4,
    estimatedDuration: '30-60 分钟',
    participantRoles: {
      cppcc: '参与讨论',
      npc: '（可选）'
    }
  }
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
 * 获取流程阶段列表
 */
function getStages(typeId) {
  const flow = getFlowConfig(typeId);
  return flow.stages;
}

/**
 * 获取某阶段详情
 */
function getStageDetail(typeId, stageId) {
  const flow = getFlowConfig(typeId);
  return flow.stages.find(s => s.id === stageId);
}

/**
 * 流程对比表
 */
function getFlowComparison() {
  const types = ['CONSULTATION', 'STRATEGIC', 'RESOLUTION', 'PLANNING', 'LEGISLATIVE', 'MINUTES'];
  
  return types.map(typeId => {
    const flow = getFlowConfig(typeId);
    return {
      type: flow.type,
      name: flow.name,
      icon: flow.icon,
      stages: flow.stages.map(s => s.name).join(' → '),
      stageCount: flow.stages.length,
      estimatedDuration: flow.summary.estimatedDuration
    };
  });
}

module.exports = {
  CONSULTATION_FLOW,
  STRATEGIC_FLOW,
  RESOLUTION_FLOW,
  PLANNING_FLOW,
  LEGISLATIVE_FLOW,
  MINUTES_FLOW,
  getFlowConfig,
  getStages,
  getStageDetail,
  getFlowComparison
};