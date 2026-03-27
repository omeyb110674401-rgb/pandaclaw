/**
 * 完整专业Agent映射
 * 180个专业Agent全部分类映射
 */

// ============================================
// 人大可绑定的专业身份（全局观）
// ============================================
const NPC_EXPERTISE = {
  // === 架构评判 ===
  'system-architect': {
    id: 'engineering-backend-architect',
    name: '系统架构师',
    category: '架构评判'
  },
  'software-architect': {
    id: 'engineering-software-architect',
    name: '软件架构师',
    category: '架构评判'
  },
  'unity-architect': {
    id: 'unity-architect',
    name: 'Unity架构师',
    category: '架构评判'
  },
  'unreal-architect': {
    id: 'unreal-multiplayer-architect',
    name: 'Unreal架构师',
    category: '架构评判'
  },
  
  // === 可行性评估 ===
  'feasibility-analyst': {
    id: 'product-manager',
    name: '可行性分析师',
    category: '可行性评估'
  },
  'rapid-prototyper': {
    id: 'engineering-rapid-prototyper',
    name: '快速原型师',
    category: '可行性评估'
  },
  'trend-researcher': {
    id: 'product-trend-researcher',
    name: '趋势研究员',
    category: '可行性评估'
  },
  'experiment-tracker': {
    id: 'project-management-experiment-tracker',
    name: '实验追踪师',
    category: '可行性评估'
  },
  
  // === 风险评估 ===
  'risk-assessor': {
    id: 'engineering-security-engineer',
    name: '风险评估师',
    category: '风险评估'
  },
  'threat-detection': {
    id: 'engineering-threat-detection-engineer',
    name: '威胁检测师',
    category: '风险评估'
  },
  'fraud-detector': {
    id: 'finance-fraud-detector',
    name: '风控专家',
    category: '风险评估'
  },
  'risk-specialist': {
    id: 'specialized-risk-assessor',
    name: '企业风险评估师',
    category: '风险评估'
  },
  
  // === 质量监督 ===
  'quality-supervisor': {
    id: 'engineering-code-reviewer',
    name: '质量监督员',
    category: '质量监督'
  },
  'compliance-auditor': {
    id: 'compliance-auditor',
    name: '合规审计员',
    category: '质量监督'
  },
  'healthcare-compliance': {
    id: 'healthcare-marketing-compliance',
    name: '医疗合规师',
    category: '质量监督'
  },
  'ai-policy': {
    id: 'specialized-ai-policy-writer',
    name: 'AI治理专家',
    category: '质量监督'
  },
  
  // === 性能评估 ===
  'performance-analyst': {
    id: 'testing-performance-benchmarker',
    name: '性能分析师',
    category: '性能评估'
  },
  'database-optimizer': {
    id: 'engineering-database-optimizer',
    name: '数据库优化师',
    category: '性能评估'
  },
  'sre-expert': {
    id: 'engineering-sre',
    name: 'SRE专家',
    category: '性能评估'
  },
  
  // === 安全审计 ===
  'security-auditor': {
    id: 'blockchain-security-auditor',
    name: '安全审计员',
    category: '安全审计'
  },
  'incident-commander': {
    id: 'engineering-incident-response-commander',
    name: '故障响应指挥官',
    category: '安全审计'
  },
  'identity-trust': {
    id: 'agentic-identity-trust',
    name: '身份信任架构师',
    category: '安全审计'
  },
  
  // === 全局统筹 ===
  'orchestrator': {
    id: 'agents-orchestrator',
    name: '智能体编排者',
    category: '全局统筹'
  },
  'workflow-architect': {
    id: 'specialized-workflow-architect',
    name: '工作流架构师',
    category: '全局统筹'
  },
  'automation-governance': {
    id: 'automation-governance-architect',
    name: '自动化治理架构师',
    category: '全局统筹'
  }
};

// ============================================
// 政协可绑定的专业身份（特定领域专家）
// ============================================
const CPPCC_EXPERTISE = {
  // ========== 前端领域 ==========
  'frontend-expert': { id: 'engineering-frontend-developer', name: '前端专家', category: '前端领域' },
  'mobile-expert': { id: 'engineering-mobile-app-builder', name: '移动端专家', category: '前端领域' },
  'wechat-mini-program': { id: 'engineering-wechat-mini-program-developer', name: '微信小程序专家', category: '前端领域' },
  'ui-designer': { id: 'design-ui-designer', name: 'UI设计师', category: '前端领域' },
  'ux-expert': { id: 'design-ux-researcher', name: 'UX专家', category: '前端领域' },
  'ux-architect': { id: 'design-ux-architect', name: 'UX架构师', category: '前端领域' },
  'brand-guardian': { id: 'design-brand-guardian', name: '品牌守护者', category: '前端领域' },
  'visual-storyteller': { id: 'design-visual-storyteller', name: '视觉叙事师', category: '前端领域' },
  'whimsy-injector': { id: 'design-whimsy-injector', name: '趣味注入师', category: '前端领域' },
  'inclusive-visuals': { id: 'design-inclusive-visuals-specialist', name: '包容性视觉专家', category: '前端领域' },
  'image-prompt': { id: 'design-image-prompt-engineer', name: '图像提示词工程师', category: '前端领域' },
  
  // ========== 后端领域 ==========
  'backend-expert': { id: 'engineering-backend-architect', name: '后端专家', category: '后端领域' },
  'data-engineer': { id: 'engineering-data-engineer', name: '数据工程师', category: '后端领域' },
  'devops-expert': { id: 'engineering-devops-automator', name: 'DevOps专家', category: '后端领域' },
  'git-expert': { id: 'engineering-git-workflow-master', name: 'Git工作流专家', category: '后端领域' },
  'senior-developer': { id: 'engineering-senior-developer', name: '高级开发者', category: '后端领域' },
  'technical-writer': { id: 'engineering-technical-writer', name: '技术文档工程师', category: '后端领域' },
  'autonomous-optimizer': { id: 'engineering-autonomous-optimization-architect', name: '自主优化架构师', category: '后端领域' },
  'solidity-expert': { id: 'engineering-solidity-smart-contract-engineer', name: '智能合约专家', category: '后端领域' },
  'api-tester': { id: 'testing-api-tester', name: 'API测试专家', category: '后端领域' },
  
  // ========== AI领域 ==========
  'ai-engineer': { id: 'engineering-ai-engineer', name: 'AI工程师', category: 'AI领域' },
  'prompt-engineer': { id: 'prompt-engineer', name: '提示词工程师', category: 'AI领域' },
  'ai-data-remediation': { id: 'engineering-ai-data-remediation-engineer', name: 'AI数据修复工程师', category: 'AI领域' },
  'model-qa': { id: 'specialized-model-qa', name: '模型QA专家', category: 'AI领域' },
  'mcp-builder': { id: 'specialized-mcp-builder', name: 'MCP构建器', category: 'AI领域' },
  'lsp-engineer': { id: 'lsp-index-engineer', name: 'LSP索引工程师', category: 'AI领域' },
  
  // ========== 产品设计领域 ==========
  'product-expert': { id: 'product-manager', name: '产品专家', category: '产品设计领域' },
  'sprint-prioritizer': { id: 'product-sprint-prioritizer', name: 'Sprint排序师', category: '产品设计领域' },
  'feedback-synthesizer': { id: 'product-feedback-synthesizer', name: '反馈分析师', category: '产品设计领域' },
  'behavioral-nudge': { id: 'product-behavioral-nudge-engine', name: '行为助推引擎', category: '产品设计领域' },
  
  // ========== 营销领域 ==========
  'xiaohongshu-expert': { id: 'marketing-xiaohongshu-operator', name: '小红书专家', category: '营销领域' },
  'xiaohongshu-specialist': { id: 'marketing-xiaohongshu-specialist', name: '小红书专家(EN)', category: '营销领域' },
  'douyin-expert': { id: 'marketing-douyin-strategist', name: '抖音专家', category: '营销领域' },
  'wechat-expert': { id: 'marketing-wechat-operator', name: '微信运营专家', category: '营销领域' },
  'wechat-official': { id: 'marketing-wechat-official-account', name: '微信公众号管理', category: '营销领域' },
  'bilibili-expert': { id: 'marketing-bilibili-strategist', name: 'B站专家', category: '营销领域' },
  'kuaishou-expert': { id: 'marketing-kuaishou-strategist', name: '快手专家', category: '营销领域' },
  'zhihu-expert': { id: 'marketing-zhihu-strategist', name: '知乎专家', category: '营销领域' },
  'weibo-expert': { id: 'marketing-weibo-strategist', name: '微博专家', category: '营销领域' },
  'weixin-channels': { id: 'marketing-weixin-channels-strategist', name: '视频号专家', category: '营销领域' },
  'growth-hacker': { id: 'marketing-growth-hacker', name: '增长黑客', category: '营销领域' },
  'content-expert': { id: 'marketing-content-creator', name: '内容专家', category: '营销领域' },
  'seo-expert': { id: 'marketing-seo-specialist', name: 'SEO专家', category: '营销领域' },
  'baidu-seo': { id: 'marketing-baidu-seo-specialist', name: '百度SEO专家', category: '营销领域' },
  'social-media': { id: 'marketing-social-media-strategist', name: '社交媒体策略师', category: '营销领域' },
  'ecommerce-expert': { id: 'marketing-china-ecommerce-operator', name: '电商运营专家', category: '营销领域' },
  'ecommerce-operator': { id: 'marketing-ecommerce-operator', name: '电商运营师', category: '营销领域' },
  'cross-border': { id: 'marketing-cross-border-ecommerce', name: '跨境电商专家', category: '营销领域' },
  'livestream-expert': { id: 'marketing-livestream-commerce-coach', name: '直播电商专家', category: '营销领域' },
  'short-video-edit': { id: 'marketing-short-video-editing-coach', name: '短视频剪辑师', category: '营销领域' },
  'private-domain': { id: 'marketing-private-domain-operator', name: '私域流量专家', category: '营销领域' },
  'knowledge-commerce': { id: 'marketing-knowledge-commerce-strategist', name: '知识付费专家', category: '营销领域' },
  'podcast-expert': { id: 'marketing-podcast-strategist', name: '播客专家', category: '营销领域' },
  'carousel-growth': { id: 'marketing-carousel-growth-engine', name: '轮播图增长引擎', category: '营销领域' },
  'tiktok-expert': { id: 'marketing-tiktok-strategist', name: 'TikTok专家', category: '营销领域' },
  'twitter-expert': { id: 'marketing-twitter-engager', name: 'Twitter专家', category: '营销领域' },
  'instagram-expert': { id: 'marketing-instagram-curator', name: 'Instagram专家', category: '营销领域' },
  'reddit-expert': { id: 'marketing-reddit-community-builder', name: 'Reddit专家', category: '营销领域' },
  'linkedin-expert': { id: 'marketing-linkedin-content-creator', name: 'LinkedIn专家', category: '营销领域' },
  'book-coauthor': { id: 'marketing-book-co-author', name: '图书联合作者', category: '营销领域' },
  'app-store': { id: 'marketing-app-store-optimizer', name: '应用商店优化师', category: '营销领域' },
  
  // ========== 付费媒体领域 ==========
  'paid-media-auditor': { id: 'paid-media-auditor', name: '付费媒体审计师', category: '付费媒体领域' },
  'paid-creative': { id: 'paid-media-creative-strategist', name: '广告创意策略师', category: '付费媒体领域' },
  'paid-social': { id: 'paid-media-paid-social-strategist', name: '社交广告策略师', category: '付费媒体领域' },
  'ppc-expert': { id: 'paid-media-ppc-strategist', name: 'PPC竞价策略师', category: '付费媒体领域' },
  'programmatic-buyer': { id: 'paid-media-programmatic-buyer', name: '程序化广告专家', category: '付费媒体领域' },
  'search-query': { id: 'paid-media-search-query-analyst', name: '搜索词分析师', category: '付费媒体领域' },
  'tracking-expert': { id: 'paid-media-tracking-specialist', name: '追踪与归因专家', category: '付费媒体领域' },
  
  // ========== 销售领域 ==========
  'sales-strategist': { id: 'sales-deal-strategist', name: '销售策略师', category: '销售领域' },
  'sales-engineer': { id: 'sales-engineer', name: '售前工程师', category: '销售领域' },
  'sales-coach': { id: 'sales-coach', name: '销售教练', category: '销售领域' },
  'account-strategist': { id: 'sales-account-strategist', name: '客户拓展策略师', category: '销售领域' },
  'discovery-coach': { id: 'sales-discovery-coach', name: 'Discovery教练', category: '销售领域' },
  'outbound-strategist': { id: 'sales-outbound-strategist', name: 'Outbound策略师', category: '销售领域' },
  'pipeline-analyst': { id: 'sales-pipeline-analyst', name: 'Pipeline分析师', category: '销售领域' },
  'proposal-strategist': { id: 'sales-proposal-strategist', name: '投标策略师', category: '销售领域' },
  
  // ========== 测试领域 ==========
  'qa-expert': { id: 'testing-evidence-collector', name: 'QA专家', category: '测试领域' },
  'reality-checker': { id: 'testing-reality-checker', name: '现实检验者', category: '测试领域' },
  'accessibility-expert': { id: 'testing-accessibility-auditor', name: '无障碍专家', category: '测试领域' },
  'test-analyst': { id: 'testing-test-results-analyzer', name: '测试结果分析师', category: '测试领域' },
  'tool-evaluator': { id: 'testing-tool-evaluator', name: '工具评估师', category: '测试领域' },
  'workflow-optimizer': { id: 'testing-workflow-optimizer', name: '工作流优化师', category: '测试领域' },
  'embedded-qa': { id: 'testing-embedded-qa-engineer', name: '嵌入式测试工程师', category: '测试领域' },
  
  // ========== 项目管理领域 ==========
  'project-manager': { id: 'project-manager-senior', name: '项目经理', category: '项目管理领域' },
  'project-shepherd': { id: 'project-management-project-shepherd', name: '项目牧羊人', category: '项目管理领域' },
  'studio-producer': { id: 'project-management-studio-producer', name: '工作室制片人', category: '项目管理领域' },
  'studio-operations': { id: 'project-management-studio-operations', name: '工作室运营', category: '项目管理领域' },
  'jira-steward': { id: 'project-management-jira-workflow-steward', name: 'Jira工作流管家', category: '项目管理领域' },
  
  // ========== 金融财务领域 ==========
  'finance-expert': { id: 'finance-financial-forecaster', name: '财务专家', category: '金融财务领域' },
  'invoice-manager': { id: 'finance-invoice-manager', name: '发票管理专家', category: '金融财务领域' },
  
  // ========== 人力资源领域 ==========
  'hr-expert': { id: 'hr-recruiter', name: '招聘专家', category: '人力资源领域' },
  'performance-expert': { id: 'hr-performance-reviewer', name: '绩效专家', category: '人力资源领域' },
  
  // ========== 法务合规领域 ==========
  'legal-expert': { id: 'legal-contract-reviewer', name: '法务专家', category: '法务合规领域' },
  'policy-expert': { id: 'legal-policy-writer', name: '制度专家', category: '法务合规领域' },
  
  // ========== 供应链领域 ==========
  'supply-chain-expert': { id: 'supply-chain-inventory-forecaster', name: '供应链专家', category: '供应链领域' },
  'vendor-evaluator': { id: 'supply-chain-vendor-evaluator', name: '供应商评估专家', category: '供应链领域' },
  'logistics-expert': { id: 'supply-chain-route-optimizer', name: '物流专家', category: '供应链领域' },
  
  // ========== 游戏开发领域 ==========
  'game-designer': { id: 'game-designer', name: '游戏设计师', category: '游戏开发领域' },
  'level-designer': { id: 'level-designer', name: '关卡设计师', category: '游戏开发领域' },
  'narrative-designer': { id: 'narrative-designer', name: '叙事设计师', category: '游戏开发领域' },
  'technical-artist': { id: 'technical-artist', name: '技术美术', category: '游戏开发领域' },
  'game-audio': { id: 'game-audio-engineer', name: '游戏音频工程师', category: '游戏开发领域' },
  'unity-editor-tool': { id: 'unity-editor-tool-developer', name: 'Unity编辑器工具开发者', category: '游戏开发领域' },
  'unity-multiplayer': { id: 'unity-multiplayer-engineer', name: 'Unity多人游戏工程师', category: '游戏开发领域' },
  'unity-shader': { id: 'unity-shader-graph-artist', name: 'Unity Shader Graph美术师', category: '游戏开发领域' },
  'unreal-systems': { id: 'unreal-systems-engineer', name: 'Unreal系统工程师', category: '游戏开发领域' },
  'unreal-technical-artist': { id: 'unreal-technical-artist', name: 'Unreal技术美术', category: '游戏开发领域' },
  'unreal-world-builder': { id: 'unreal-world-builder', name: 'Unreal世界构建师', category: '游戏开发领域' },
  'blender-addon': { id: 'blender-addon-engineer', name: 'Blender插件工程师', category: '游戏开发领域' },
  'godot-gameplay': { id: 'godot-gameplay-scripter', name: 'Godot游戏脚本开发者', category: '游戏开发领域' },
  'godot-multiplayer': { id: 'godot-multiplayer-engineer', name: 'Godot多人游戏工程师', category: '游戏开发领域' },
  'godot-shader': { id: 'godot-shader-developer', name: 'Godot Shader开发者', category: '游戏开发领域' },
  'roblox-systems': { id: 'roblox-systems-scripter', name: 'Roblox系统脚本工程师', category: '游戏开发领域' },
  'roblox-experience': { id: 'roblox-experience-designer', name: 'Roblox体验设计师', category: '游戏开发领域' },
  'roblox-avatar': { id: 'roblox-avatar-creator', name: 'Roblox虚拟形象创作者', category: '游戏开发领域' },
  
  // ========== 空间计算领域 ==========
  'visionos-expert': { id: 'visionos-spatial-engineer', name: 'visionOS专家', category: '空间计算领域' },
  'macos-metal': { id: 'macos-spatial-metal-engineer', name: 'macOS Metal工程师', category: '空间计算领域' },
  'xr-interface': { id: 'xr-interface-architect', name: 'XR界面架构师', category: '空间计算领域' },
  'xr-immersive': { id: 'xr-immersive-developer', name: 'XR沉浸式开发者', category: '空间计算领域' },
  'xr-cockpit': { id: 'xr-cockpit-interaction-specialist', name: 'XR座舱交互专家', category: '空间计算领域' },
  'terminal-integration': { id: 'terminal-integration-specialist', name: '终端集成专家', category: '空间计算领域' },
  
  // ========== 专项领域 ==========
  'blockchain-expert': { id: 'engineering-solidity-smart-contract-engineer', name: '区块链专家', category: '专项领域' },
  'iot-expert': { id: 'engineering-iot-solution-architect', name: 'IoT专家', category: '专项领域' },
  'embedded-expert': { id: 'engineering-embedded-firmware-engineer', name: '嵌入式专家', category: '专项领域' },
  'embedded-linux': { id: 'engineering-embedded-linux-driver-engineer', name: '嵌入式Linux专家', category: '专项领域' },
  'fpga-expert': { id: 'engineering-fpga-digital-design-engineer', name: 'FPGA专家', category: '专项领域' },
  'feishu-expert': { id: 'engineering-feishu-integration-developer', name: '飞书集成专家', category: '专项领域' },
  'dingtalk-expert': { id: 'engineering-dingtalk-integration-developer', name: '钉钉集成专家', category: '专项领域' },
  'cultural-intelligence': { id: 'specialized-cultural-intelligence-strategist', name: '文化智能策略师', category: '专项领域' },
  'developer-advocate': { id: 'specialized-developer-advocate', name: '开发者布道师', category: '专项领域' },
  'document-generator': { id: 'specialized-document-generator', name: '文档生成器', category: '专项领域' },
  'salesforce-architect': { id: 'specialized-salesforce-architect', name: 'Salesforce架构师', category: '专项领域' },
  'pricing-optimizer': { id: 'specialized-pricing-optimizer', name: '动态定价策略师', category: '专项领域' },
  'meeting-assistant': { id: 'specialized-meeting-assistant', name: '会议效率专家', category: '专项领域' },
  
  // ========== 数据专项领域 ==========
  'data-consolidation': { id: 'data-consolidation-agent', name: '数据整合师', category: '数据专项领域' },
  'report-distribution': { id: 'report-distribution-agent', name: '报告分发师', category: '数据专项领域' },
  'sales-data-extraction': { id: 'sales-data-extraction-agent', name: '销售数据提取师', category: '数据专项领域' },
  'accounts-payable': { id: 'accounts-payable-agent', name: '应付账款智能体', category: '数据专项领域' },
  'identity-graph': { id: 'identity-graph-operator', name: '身份图谱操作员', category: '数据专项领域' },
  'zk-steward': { id: 'zk-steward', name: 'ZK管家', category: '数据专项领域' },
  
  // ========== 支持领域 ==========
  'support-responder': { id: 'support-support-responder', name: '客服响应者', category: '支持领域' },
  'analytics-reporter': { id: 'support-analytics-reporter', name: '数据分析师', category: '支持领域' },
  'legal-compliance': { id: 'support-legal-compliance-checker', name: '法务合规员', category: '支持领域' },
  'executive-summary': { id: 'support-executive-summary-generator', name: '高管摘要师', category: '支持领域' },
  'finance-tracker': { id: 'support-finance-tracker', name: '财务追踪员', category: '支持领域' },
  'infrastructure-maintainer': { id: 'support-infrastructure-maintainer', name: '基础设施运维师', category: '支持领域' },
  'recruitment-specialist': { id: 'support-recruitment-specialist', name: '招聘运营专家', category: '支持领域' },
  'supply-chain-strategist': { id: 'support-supply-chain-strategist', name: '供应链采购策略师', category: '支持领域' },
  
  // ========== 学术研究领域 ==========
  'anthropologist': { id: 'academic-anthropologist', name: '人类学家', category: '学术研究领域' },
  'geographer': { id: 'academic-geographer', name: '地理学家', category: '学术研究领域' },
  'historian': { id: 'academic-historian', name: '历史学家', category: '学术研究领域' },
  'narratologist': { id: 'academic-narratologist', name: '叙事学家', category: '学术研究领域' },
  'psychologist': { id: 'academic-psychologist', name: '心理学家', category: '学术研究领域' },
  'study-planner': { id: 'academic-study-planner', name: '学习规划师', category: '学术研究领域' },
  
  // ========== 教育咨询领域 ==========
  'study-abroad-advisor': { id: 'study-abroad-advisor', name: '留学规划顾问', category: '教育咨询领域' },
  'gaokao-advisor': { id: 'gaokao-college-advisor', name: '高考志愿填报顾问', category: '教育咨询领域' },
  'corporate-training': { id: 'corporate-training-designer', name: '企业培训课程设计师', category: '教育咨询领域' },
  
  // ========== 政务领域 ==========
  'government-presales': { id: 'government-digital-presales-consultant', name: '政务数字化售前顾问', category: '政务领域' },
  
  // ========== 领导力领域 ==========
  'capability-lead': { id: 'capability-lead', name: '能力主管', category: '领导力领域' },
  'delivery-lead': { id: 'delivery-lead', name: '交付主管', category: '领导力领域' }
};

// ============================================
// 分类汇总
// ============================================
const CATEGORY_SUMMARY = {
  npc: {
    '架构评判': ['system-architect', 'software-architect', 'unity-architect', 'unreal-architect'],
    '可行性评估': ['feasibility-analyst', 'rapid-prototyper', 'trend-researcher', 'experiment-tracker'],
    '风险评估': ['risk-assessor', 'threat-detection', 'fraud-detector', 'risk-specialist'],
    '质量监督': ['quality-supervisor', 'compliance-auditor', 'healthcare-compliance', 'ai-policy'],
    '性能评估': ['performance-analyst', 'database-optimizer', 'sre-expert'],
    '安全审计': ['security-auditor', 'incident-commander', 'identity-trust'],
    '全局统筹': ['orchestrator', 'workflow-architect', 'automation-governance']
  },
  cppcc: {}
};

// 自动生成政协分类汇总
for (const [id, info] of Object.entries(CPPCC_EXPERTISE)) {
  if (!CATEGORY_SUMMARY.cppcc[info.category]) {
    CATEGORY_SUMMARY.cppcc[info.category] = [];
  }
  CATEGORY_SUMMARY.cppcc[info.category].push(id);
}

// ============================================
// 统计
// ============================================
const getStats = () => ({
  npcCount: Object.keys(NPC_EXPERTISE).length,
  cppccCount: Object.keys(CPPCC_EXPERTISE).length,
  total: Object.keys(NPC_EXPERTISE).length + Object.keys(CPPCC_EXPERTISE).length,
  npcCategories: Object.keys(CATEGORY_SUMMARY.npc).length,
  cppccCategories: Object.keys(CATEGORY_SUMMARY.cppcc).length
});

// ============================================
// 导出
// ============================================
module.exports = {
  NPC_EXPERTISE,
  CPPCC_EXPERTISE,
  CATEGORY_SUMMARY,
  CPPCC_MEMBERS: ['cppcc-1', 'cppcc-2', 'cppcc-3', 'cppcc-4', 'cppcc-5'],
  NPC_MEMBERS: ['npc-1', 'npc-2', 'npc-3', 'npc-4', 'npc-5'],
  getStats
};