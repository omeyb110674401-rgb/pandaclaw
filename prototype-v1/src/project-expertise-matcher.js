/**
 * 项目-身份匹配系统
 * 根据项目类型自动推荐应赋予的专业身份
 */

const { NPC_EXPERTISE, CPPCC_EXPERTISE, CATEGORY_SUMMARY } = require('./expertise-categories');

// ============================================
// 项目类型定义
// ============================================
const PROJECT_TYPES = {
  // ========== 系统/工具开发类 ==========
  'system-improvement': {
    name: '系统改进项目',
    keywords: ['改进', '完善', '优化', '增强', '增加功能', '会议系统', '系统需要'],
    description: '现有系统的改进和完善',
    recommended: {
      npc: ['system-architect', 'quality-supervisor'],
      cppcc: ['ai-engineer', 'workflow-architect', 'data-engineer']
    }
  },
  
  // ========== Web开发类 ==========
  'web-frontend': {
    name: 'Web前端项目',
    keywords: ['前端', '网页', 'H5', '官网', '后台管理', 'Dashboard'],
    description: 'Web前端开发项目',
    recommended: {
      npc: ['system-architect', 'quality-supervisor'],
      cppcc: ['frontend-expert', 'ui-designer', 'ux-expert']
    }
  },
  'web-fullstack': {
    name: 'Web全栈项目',
    keywords: ['全栈', 'Web应用', '系统开发', '平台开发'],
    description: '前后端完整开发项目',
    recommended: {
      npc: ['system-architect', 'feasibility-analyst', 'security-auditor'],
      cppcc: ['frontend-expert', 'backend-expert', 'data-engineer']
    }
  },
  'mobile-app': {
    name: '移动应用项目',
    keywords: ['APP', '移动端', 'iOS', 'Android', '小程序', '微信小程序'],
    description: '移动应用开发项目',
    recommended: {
      npc: ['system-architect', 'performance-analyst'],
      cppcc: ['mobile-expert', 'wechat-mini-program', 'ui-designer']
    }
  },
  
  // ========== AI类 ==========
  'ai-application': {
    name: 'AI应用项目',
    keywords: ['AI', '机器学习', '深度学习', 'NLP', 'CV', 'LLM', 'ChatGPT'],
    description: 'AI应用开发项目',
    recommended: {
      npc: ['risk-assessor', 'ai-policy'],
      cppcc: ['ai-engineer', 'prompt-engineer', 'model-qa']
    }
  },
  'ai-agent': {
    name: 'AI Agent项目',
    keywords: ['Agent', '智能体', '自动化', 'RAG', 'MCP'],
    description: 'AI智能体开发项目',
    recommended: {
      npc: ['orchestrator', 'workflow-architect'],
      cppcc: ['ai-engineer', 'mcp-builder', 'prompt-engineer']
    }
  },
  
  // ========== 营销类 ==========
  'marketing-campaign': {
    name: '营销活动项目',
    keywords: ['营销', '推广', '活动', '增长', '获客'],
    description: '营销活动策划项目',
    recommended: {
      npc: ['feasibility-analyst'],
      cppcc: ['growth-hacker', 'content-expert', 'seo-expert']
    }
  },
  'social-media': {
    name: '社媒运营项目',
    keywords: ['小红书', '抖音', '微信', 'B站', '微博', '知乎', '社媒'],
    description: '社交媒体运营项目',
    recommended: {
      npc: ['quality-supervisor'],
      cppcc: ['xiaohongshu-expert', 'douyin-expert', 'wechat-expert']
    }
  },
  'ecommerce': {
    name: '电商项目',
    keywords: ['电商', '淘宝', '天猫', '拼多多', '京东', '直播带货'],
    description: '电商运营项目',
    recommended: {
      npc: ['risk-assessor'],
      cppcc: ['ecommerce-expert', 'livestream-expert', 'paid-media-auditor']
    }
  },
  
  // ========== 游戏类 ==========
  'game-dev': {
    name: '游戏开发项目',
    keywords: ['游戏', 'Game', 'Unity', 'Unreal', 'Godot', 'Roblox'],
    description: '游戏开发项目',
    recommended: {
      npc: ['system-architect', 'performance-analyst'],
      cppcc: ['game-designer', 'level-designer', 'technical-artist']
    }
  },
  'game-design': {
    name: '游戏设计项目',
    keywords: ['游戏设计', '关卡', '叙事', '游戏系统'],
    description: '游戏设计项目',
    recommended: {
      npc: ['feasibility-analyst'],
      cppcc: ['game-designer', 'narrative-designer', 'ux-expert']
    }
  },
  
  // ========== 数据类 ==========
  'data-analysis': {
    name: '数据分析项目',
    keywords: ['数据分析', '报表', 'BI', '可视化', '数据挖掘'],
    description: '数据分析项目',
    recommended: {
      npc: ['quality-supervisor'],
      cppcc: ['data-consolidation', 'analytics-reporter']
    }
  },
  'data-pipeline': {
    name: '数据管道项目',
    keywords: ['数据管道', 'ETL', '数据仓库', '湖仓'],
    description: '数据管道建设项目',
    recommended: {
      npc: ['system-architect', 'performance-analyst'],
      cppcc: ['data-engineer', 'database-optimizer']
    }
  },
  
  // ========== 基础设施类 ==========
  'devops': {
    name: 'DevOps项目',
    keywords: ['DevOps', 'CI/CD', '容器化', 'K8s', 'Docker', '自动化部署'],
    description: 'DevOps基础设施项目',
    recommended: {
      npc: ['security-auditor', 'incident-commander'],
      cppcc: ['devops-expert', 'sre-expert', 'infrastructure-maintainer']
    }
  },
  'cloud-infra': {
    name: '云基础设施项目',
    keywords: ['云', '云原生', 'AWS', '阿里云', '腾讯云', '基础设施'],
    description: '云基础设施建设项目',
    recommended: {
      npc: ['system-architect', 'risk-assessor'],
      cppcc: ['devops-expert', 'database-optimizer']
    }
  },
  
  // ========== 安全类 ==========
  'security-audit': {
    name: '安全审计项目',
    keywords: ['安全', '渗透', '漏洞', '合规', '审计'],
    description: '安全审计项目',
    recommended: {
      npc: ['security-auditor', 'compliance-auditor'],
      cppcc: ['threat-detection', 'identity-trust']
    }
  },
  
  // ========== 区块链类 ==========
  'blockchain': {
    name: '区块链项目',
    keywords: ['区块链', 'Web3', '智能合约', 'DeFi', 'NFT'],
    description: '区块链开发项目',
    recommended: {
      npc: ['security-auditor', 'risk-assessor'],
      cppcc: ['blockchain-expert', 'solidity-expert']
    }
  },
  
  // ========== IoT/嵌入式类 ==========
  'iot-project': {
    name: 'IoT项目',
    keywords: ['IoT', '物联网', '智能家居', '传感器'],
    description: '物联网项目',
    recommended: {
      npc: ['system-architect', 'security-auditor'],
      cppcc: ['iot-expert', 'embedded-expert']
    }
  },
  'embedded-project': {
    name: '嵌入式项目',
    keywords: ['嵌入式', '单片机', 'STM32', 'ESP32', '固件'],
    description: '嵌入式开发项目',
    recommended: {
      npc: ['performance-analyst', 'quality-supervisor'],
      cppcc: ['embedded-expert', 'embedded-linux', 'embedded-qa']
    }
  },
  
  // ========== 空间计算类 ==========
  'xr-project': {
    name: 'XR项目',
    keywords: ['XR', 'VR', 'AR', 'MR', 'visionOS', '元宇宙'],
    description: '扩展现实项目',
    recommended: {
      npc: ['system-architect', 'feasibility-analyst'],
      cppcc: ['xr-interface', 'xr-immersive', 'visionos-expert']
    }
  },
  
  // ========== 产品设计类 ==========
  'product-design': {
    name: '产品设计项目',
    keywords: ['产品', '需求', '用户研究', '原型', 'PRD'],
    description: '产品设计项目',
    recommended: {
      npc: ['feasibility-analyst', 'quality-supervisor'],
      cppcc: ['product-expert', 'ux-expert', 'feedback-synthesizer']
    }
  },
  
  // ========== 企业服务类 ==========
  'enterprise-system': {
    name: '企业系统项目',
    keywords: ['ERP', 'CRM', 'OA', '企业系统', '管理系统'],
    description: '企业级系统项目',
    recommended: {
      npc: ['system-architect', 'compliance-auditor'],
      cppcc: ['backend-expert', 'salesforce-architect', 'legal-compliance']
    }
  },
  
  // ========== 咨询研究类 ==========
  'research-project': {
    name: '研究咨询项目',
    keywords: ['研究', '咨询', '调研', '报告', '白皮书'],
    description: '研究咨询项目',
    recommended: {
      npc: ['feasibility-analyst'],
      cppcc: ['trend-researcher', 'anthropologist', 'historian']
    }
  },
  
  // ========== 教育培训类 ==========
  'education-project': {
    name: '教育项目',
    keywords: ['教育', '培训', '课程', '学习'],
    description: '教育培训项目',
    recommended: {
      npc: ['quality-supervisor'],
      cppcc: ['study-planner', 'corporate-training', 'study-abroad-advisor']
    }
  },
  
  // ========== 政务类 ==========
  'government-project': {
    name: '政务项目',
    keywords: ['政务', '政府', '数字化', '智慧城市'],
    description: '政务数字化项目',
    recommended: {
      npc: ['compliance-auditor', 'risk-assessor'],
      cppcc: ['government-presales', 'legal-expert']
    }
  }
};

// ============================================
// 项目复杂度定义
// ============================================
const PROJECT_COMPLEXITY = {
  simple: {
    name: '简单项目',
    duration: '< 1周',
    teamSize: '1-2人',
    npcCount: 1,
    cppccCount: 2
  },
  medium: {
    name: '中等项目',
    duration: '1-4周',
    teamSize: '2-5人',
    npcCount: 2,
    cppccCount: 3
  },
  complex: {
    name: '复杂项目',
    duration: '1-3月',
    teamSize: '5-10人',
    npcCount: 3,
    cppccCount: 4
  },
  enterprise: {
    name: '企业级项目',
    duration: '> 3月',
    teamSize: '> 10人',
    npcCount: 5,
    cppccCount: 5
  }
};

// ============================================
// 项目识别与身份推荐
// ============================================

/**
 * 识别项目类型
 */
function identifyProjectType(projectDescription) {
  const desc = projectDescription.toLowerCase();
  const matches = [];
  
  for (const [typeId, typeInfo] of Object.entries(PROJECT_TYPES)) {
    let score = 0;
    
    // 关键词匹配
    for (const keyword of typeInfo.keywords) {
      if (desc.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }
    
    if (score > 0) {
      matches.push({ typeId, score, typeInfo });
    }
  }
  
  // 按分数排序
  matches.sort((a, b) => b.score - a.score);
  
  return matches.slice(0, 3); // 返回前3个匹配
}

/**
 * 根据项目推荐身份
 */
function recommendExpertise(projectDescription, complexity = 'medium') {
  // 识别项目类型
  const matchedTypes = identifyProjectType(projectDescription);
  
  if (matchedTypes.length === 0) {
    return {
      error: '无法识别项目类型',
      suggestion: '请提供更详细的项目描述'
    };
  }
  
  const primaryType = matchedTypes[0];
  const complexityConfig = PROJECT_COMPLEXITY[complexity];
  
  // 收集推荐身份
  const recommended = {
    projectType: primaryType.typeInfo.name,
    complexity: complexityConfig.name,
    npc: [],
    cppcc: []
  };
  
  // 从主要类型获取推荐
  const primaryRecommended = primaryType.typeInfo.recommended;
  
  // 添加人大身份
  const npcList = primaryRecommended.npc.slice(0, complexityConfig.npcCount);
  for (const id of npcList) {
    if (NPC_EXPERTISE[id]) {
      recommended.npc.push({
        id,
        ...NPC_EXPERTISE[id]
      });
    }
  }
  
  // 添加政协身份
  const cppccList = primaryRecommended.cppcc.slice(0, complexityConfig.cppccCount);
  for (const id of cppccList) {
    if (CPPCC_EXPERTISE[id]) {
      recommended.cppcc.push({
        id,
        ...CPPCC_EXPERTISE[id]
      });
    }
  }
  
  // 如果有多个匹配类型，补充相关身份
  if (matchedTypes.length > 1) {
    for (let i = 1; i < matchedTypes.length; i++) {
      const additionalRecommended = matchedTypes[i].typeInfo.recommended;
      
      // 补充政协身份（去重）
      for (const id of additionalRecommended.cppcc) {
        if (CPPCC_EXPERTISE[id] && !recommended.cppcc.find(e => e.id === id)) {
          if (recommended.cppcc.length < 5) { // 最多5个政协身份
            recommended.cppcc.push({
              id,
              ...CPPCC_EXPERTISE[id]
            });
          }
        }
      }
    }
  }
  
  return recommended;
}

/**
 * 生成身份绑定建议
 */
function generateBindingRecommendation(projectDescription, complexity = 'medium') {
  const recommended = recommendExpertise(projectDescription, complexity);
  
  if (recommended.error) {
    return recommended;
  }
  
  const bindings = {};
  
  // 人大绑定
  recommended.npc.forEach((exp, index) => {
    bindings[`npc-${index + 1}`] = {
      expertiseId: exp.id,
      expertiseName: exp.name
    };
  });
  
  // 政协绑定
  recommended.cppcc.forEach((exp, index) => {
    bindings[`cppcc-${index + 1}`] = {
      expertiseId: exp.id,
      expertiseName: exp.name
    };
  });
  
  return {
    projectType: recommended.projectType,
    complexity: recommended.complexity,
    bindings,
    explanation: generateExplanation(recommended)
  };
}

/**
 * 生成解释说明
 */
function generateExplanation(recommended) {
  const lines = [];
  
  lines.push(`## 项目类型: ${recommended.projectType}`);
  lines.push(`## 复杂度: ${recommended.complexity}`);
  lines.push('');
  lines.push('### 人大身份（全局观）');
  recommended.npc.forEach(exp => {
    lines.push(`- ${exp.name}: ${exp.description || '从全局视角评判'}`);
  });
  
  lines.push('');
  lines.push('### 政协身份（特定领域专家）');
  recommended.cppcc.forEach(exp => {
    lines.push(`- ${exp.name}: ${exp.description || '从专业视角分析'}`);
  });
  
  return lines.join('\n');
}

/**
 * 获取所有项目类型
 */
function getAllProjectTypes() {
  return Object.entries(PROJECT_TYPES).map(([id, info]) => ({
    id,
    name: info.name,
    keywords: info.keywords
  }));
}

/**
 * 获取复杂度选项
 */
function getComplexityOptions() {
  return Object.entries(PROJECT_COMPLEXITY).map(([id, info]) => ({
    id,
    name: info.name,
    duration: info.duration,
    teamSize: info.teamSize
  }));
}

// ============================================
// 导出
// ============================================
module.exports = {
  PROJECT_TYPES,
  PROJECT_COMPLEXITY,
  identifyProjectType,
  recommendExpertise,
  generateBindingRecommendation,
  getAllProjectTypes,
  getComplexityOptions
};