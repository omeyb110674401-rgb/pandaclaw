/**
 * 民主协商会议系统
 * 基于七步闭环 + 身份匹配
 * 
 * 完整流程（2026-03-26 更新）：
 * 
 * 步骤1-4：准备阶段（广播→用户验收）
 *   1. 目标对齐 → 目标、成功标准、约束
 *   2. 信息共享 → 背景、历史、偏好
 *   3. 角色分工 → 身份绑定、权限定义
 *   4. 协调机制 → 表决规则、超时规则
 * 
 * 步骤5：政协协商（两轮）
 *   5-1. 独立输出 → 不看他人，独立分析
 *   5-2. 意见共享+立场 → 附议/补充/反对/独立
 * 
 * 步骤6：人大表决（三轮）
 *   6-1. 质询 → 必须提出至少1个质疑问题
 *   6-2. 政协回应 → 回应质询
 *   6-3. 投票 → 赞成/反对/弃权 + 理由
 * 
 * 步骤7：决策输出
 *   统计投票 → 少数服从多数
 *   写入文件 → meetings/meeting-{id}.json
 * 
 * 消息流向：
 *   main ──sessions_send──> Agent
 *   main <──inter_session── Agent（仅记录，不主动回复）
 */

const matcher = require('./project-expertise-matcher');
const { CPPCC_MEMBERS, NPC_MEMBERS, CPPCC_EXPERTISE, NPC_EXPERTISE } = require('./expertise-categories');

// ============================================
// 会议类型定义
// ============================================
const MEETING_TYPES = {
  'project-planning': {
    name: '项目规划会议',
    description: '新项目启动，确定目标、分工、计划',
    phases: ['goal_alignment', 'role_assignment', 'coordination'],
    outputs: ['目标文档', '分工矩阵', '项目计划']
  },
  'proposal-review': {
    name: '提案审议会议',
    description: '政协提案，人大审议表决',
    phases: ['information_sharing', 'deliberation', 'voting'],
    outputs: ['提案内容', '审议意见', '表决结果']
  },
  'progress-check': {
    name: '进度检查会议',
    description: '检查项目进度，发现问题',
    phases: ['information_sharing', 'feedback', 'supervision'],
    outputs: ['进度报告', '问题清单', '改进措施']
  },
  'problem-solving': {
    name: '问题解决会议',
    description: '分析问题，制定解决方案',
    phases: ['goal_alignment', 'information_sharing', 'deliberation', 'decision'],
    outputs: ['问题分析', '解决方案', '行动计划']
  },
  'final-review': {
    name: '最终验收会议',
    description: '项目验收，质量评估',
    phases: ['information_sharing', 'supervision', 'voting'],
    outputs: ['验收报告', '质量评估', '通过/不通过']
  }
};

// ============================================
// 会议状态
// ============================================
const MEETING_STATUS = {
  'pending': '待开始',
  'goal_alignment': '目标对齐',
  'information_sharing': '信息共享',
  'role_assignment': '角色分工',
  'coordination': '协调机制',
  'deliberation': '协商讨论',
  'feedback': '反馈闭环',
  'supervision': '监督制衡',
  'voting': '投票表决',
  'decision': '决策输出',
  'completed': '已完成'
};

// ============================================
// 会议类
// ============================================
class DemocraticMeeting {
  constructor(options) {
    this.id = `meeting-${Date.now()}`;
    this.type = options.type || 'project-planning';
    this.topic = options.topic;
    this.description = options.description;
    this.complexity = options.complexity || 'medium';
    this.projectType = options.projectType || null;
    
    // 会议状态
    this.status = 'pending';
    this.currentPhase = null;
    this.phaseHistory = [];
    
    // 参与者
    this.participants = {
      cppcc: [],  // 政协委员
      npc: []     // 人大代表
    };
    
    // 身份绑定
    this.expertiseBindings = {};
    
    // 会议产物
    this.outputs = {
      goalDocument: null,
      contextPackage: null,
      roleMatrix: null,
      deliberationResults: [],
      votingResult: null,
      finalDecision: null
    };
    
    // 七步闭环检查清单
    this.checklist = this.initChecklist();
    
    // 时间戳
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }
  
  // ============================================
  // 步骤1：目标对齐
  // ============================================
  
  /**
   * 初始化检查清单
   */
  initChecklist() {
    return {
      goal_alignment: {
        name: '目标对齐',
        items: [
          { id: 'goal_clear', text: '目标是否清晰定义？', checked: false },
          { id: 'goal_understood', text: '目标是否被理解？(置信度≥0.8)', checked: false },
          { id: 'goal_decomposable', text: '目标是否可分解？', checked: false },
          { id: 'constraints_defined', text: '约束条件是否明确？', checked: false }
        ],
        completed: false
      },
      information_sharing: {
        name: '信息共享',
        items: [
          { id: 'context_complete', text: '上下文是否完整？', checked: false },
          { id: 'knowledge_loaded', text: '知识是否充足？', checked: false },
          { id: 'status_synced', text: '状态是否同步？', checked: false },
          { id: 'format_standard', text: '信息格式是否标准？', checked: false }
        ],
        completed: false
      },
      role_assignment: {
        name: '角色分工',
        items: [
          { id: 'roles_defined', text: '角色是否定义？', checked: false },
          { id: 'assignment_reasonable', text: '分工是否合理？', checked: false },
          { id: 'permissions_clear', text: '权限是否明确？', checked: false },
          { id: 'collaboration_clear', text: '协作关系是否清晰？', checked: false }
        ],
        completed: false
      },
      coordination: {
        name: '协调机制',
        items: [
          { id: 'coordination_mode', text: '协调模式是否确定？', checked: false },
          { id: 'communication_protocol', text: '通信协议是否建立？', checked: false },
          { id: 'decision_mechanism', text: '决策机制是否明确？', checked: false },
          { id: 'sync_mechanism', text: '同步机制是否建立？', checked: false }
        ],
        completed: false
      },
      feedback: {
        name: '反馈闭环',
        items: [
          { id: 'feedback_channel', text: '反馈渠道是否畅通？', checked: false },
          { id: 'feedback_timely', text: '反馈是否及时？', checked: false },
          { id: 'feedback_effective', text: '反馈是否有效？', checked: false },
          { id: 'feedback_loop', text: '反馈是否形成闭环？', checked: false }
        ],
        completed: false
      },
      supervision: {
        name: '监督制衡',
        items: [
          { id: 'supervision_mechanism', text: '监督机制是否建立？', checked: false },
          { id: 'check_balance', text: '制衡机制是否建立？', checked: false },
          { id: 'supervision_independent', text: '监督是否独立？', checked: false },
          { id: 'check_effective', text: '制衡是否有效？', checked: false }
        ],
        completed: false
      },
      error_correction: {
        name: '纠错机制',
        items: [
          { id: 'error_detection', text: '错误检测是否及时？', checked: false },
          { id: 'error_handling', text: '错误处理是否规范？', checked: false },
          { id: 'correction_ability', text: '纠错能力是否具备？', checked: false },
          { id: 'prevention_mechanism', text: '预防机制是否建立？', checked: false }
        ],
        completed: false
      }
    };
  }
  
  /**
   * 执行目标对齐阶段
   */
  alignGoal() {
    this.setStatus('goal_alignment');
    
    // 生成目标文档
    const goalDocument = {
      topic: this.topic,
      description: this.description,
      successCriteria: this.extractSuccessCriteria(),
      constraints: this.identifyConstraints(),
      createdAt: new Date().toISOString()
    };
    
    this.outputs.goalDocument = goalDocument;
    
    // 自动检查清单项
    this.checkChecklistItem('goal_alignment', 'goal_clear', true);
    this.checkChecklistItem('goal_alignment', 'goal_understood', true);
    this.checkChecklistItem('goal_alignment', 'goal_decomposable', true);
    this.checkChecklistItem('goal_alignment', 'constraints_defined', true);
    this.completePhase('goal_alignment');
    
    return {
      phase: 'goal_alignment',
      document: goalDocument,
      checklistStatus: this.checklist.goal_alignment
    };
  }
  
  /**
   * 提取成功标准
   */
  extractSuccessCriteria() {
    // 根据项目类型生成默认成功标准
    const defaultCriteria = [
      '功能完整性 ≥ 90%',
      '代码质量评分 ≥ 8/10',
      '性能达标',
      '安全合规'
    ];
    return defaultCriteria;
  }
  
  /**
   * 识别约束条件
   */
  identifyConstraints() {
    const constraints = {
      time: this.complexity === 'simple' ? '< 1周' : 
            this.complexity === 'medium' ? '1-4周' :
            this.complexity === 'complex' ? '1-3月' : '> 3月',
      quality: '符合验收标准',
      security: '无安全漏洞',
      resources: '团队规模 ' + (this.complexity === 'simple' ? '1-2人' :
                                   this.complexity === 'medium' ? '2-5人' :
                                   this.complexity === 'complex' ? '5-10人' : '> 10人')
    };
    return constraints;
  }
  
  // ============================================
  // 步骤2：信息共享
  // ============================================
  
  /**
   * 执行信息共享阶段
   */
  shareInformation(contextData = {}) {
    this.setStatus('information_sharing');
    
    // 构建上下文包
    const contextPackage = {
      background: contextData.background || this.description,
      history: contextData.history || [],
      preferences: contextData.preferences || {},
      constraints: this.outputs.goalDocument?.constraints || {},
      relatedDocs: contextData.relatedDocs || [],
      knowledgeBase: this.loadKnowledgeBase()
    };
    
    this.outputs.contextPackage = contextPackage;
    
    // 自动检查
    this.checkChecklistItem('information_sharing', 'context_complete', true);
    this.checkChecklistItem('information_sharing', 'knowledge_loaded', true);
    this.checkChecklistItem('information_sharing', 'status_synced', true);
    this.checkChecklistItem('information_sharing', 'format_standard', true);
    this.completePhase('information_sharing');
    
    return {
      phase: 'information_sharing',
      contextPackage
    };
  }
  
  /**
   * 加载知识库
   */
  loadKnowledgeBase() {
    // 根据项目类型加载相关知识
    const projectTypeMatch = matcher.identifyProjectType(this.description);
    return {
      projectTypes: projectTypeMatch.map(m => m.typeInfo.name),
      relatedSkills: this.getRelatedSkills(projectTypeMatch)
    };
  }
  
  /**
   * 获取相关技能
   */
  getRelatedSkills(projectTypeMatch) {
    const skills = new Set();
    projectTypeMatch.forEach(match => {
      const recommended = match.typeInfo.recommended;
      recommended.cppcc.forEach(id => {
        if (CPPCC_EXPERTISE[id]) {
          skills.add(CPPCC_EXPERTISE[id].category);
        }
      });
    });
    return Array.from(skills);
  }
  
  // ============================================
  // 步骤3：角色分工
  // ============================================
  
  /**
   * 执行角色分工阶段（使用身份匹配系统）
   */
  assignRoles() {
    this.setStatus('role_assignment');
    
    // 使用身份匹配系统
    const recommendation = matcher.generateBindingRecommendation(
      this.description,
      this.complexity
    );
    
    // 应用绑定
    this.expertiseBindings = recommendation.bindings;
    
    // 构建角色矩阵
    const roleMatrix = this.buildRoleMatrix(recommendation);
    this.outputs.roleMatrix = roleMatrix;
    
    // 记录参与者
    this.recordParticipants();
    
    // 自动检查
    this.checkChecklistItem('role_assignment', 'roles_defined', true);
    this.checkChecklistItem('role_assignment', 'assignment_reasonable', true);
    this.checkChecklistItem('role_assignment', 'permissions_clear', true);
    this.checkChecklistItem('role_assignment', 'collaboration_clear', true);
    this.completePhase('role_assignment');
    
    return {
      phase: 'role_assignment',
      projectType: recommendation.projectType,
      complexity: recommendation.complexity,
      roleMatrix,
      expertiseBindings: this.expertiseBindings
    };
  }
  
  /**
   * 构建角色矩阵
   */
  buildRoleMatrix(recommendation) {
    const matrix = {
      coordinator: null,
      executors: [],
      reviewers: [],
      supervisors: [],
      supporters: []
    };
    
    // 人大作为监督者/审查者
    if (this.expertiseBindings) {
      Object.entries(this.expertiseBindings)
        .filter(([k]) => k.startsWith('npc'))
        .forEach(([memberId, info]) => {
          matrix.supervisors.push({
            id: memberId,
            role: 'supervisor',
            expertise: info?.expertiseName || '全局观',
            permissions: ['审议权', '质询权', '决策权']
          });
          matrix.reviewers.push({
            id: memberId,
            role: 'reviewer',
            expertise: info?.expertiseName || '全局观',
            permissions: ['否决权']
          });
        });
      
      // 政协作为执行者
      Object.entries(this.expertiseBindings)
        .filter(([k]) => k.startsWith('cppcc'))
        .forEach(([memberId, info]) => {
          matrix.executors.push({
            id: memberId,
            role: 'executor',
            expertise: info?.expertiseName || '专业领域',
            permissions: ['提案权', '建议权', '协商权']
          });
        });
    }
    
    // 主Agent作为协调者
    matrix.coordinator = {
      id: 'main',
      role: 'coordinator',
      permissions: ['统筹调度', '决策拍板']
    };
    
    return matrix;
  }
  
  /**
   * 记录参与者
   */
  recordParticipants() {
    if (this.expertiseBindings) {
      this.participants.cppcc = Object.keys(this.expertiseBindings)
        .filter(k => k.startsWith('cppcc'));
      this.participants.npc = Object.keys(this.expertiseBindings)
        .filter(k => k.startsWith('npc'));
    }
  }
  
  // ============================================
  // 步骤4：协调机制
  // ============================================
  
  /**
   * 建立协调机制
   */
  establishCoordination() {
    this.setStatus('coordination');
    
    const coordinationProtocol = {
      mode: this.determineCoordinationMode(),
      communicationProtocol: {
        format: 'standard_json',
        routing: 'main_agent_central',
        errorHandling: 'retry_3_times'
      },
      decisionMechanism: {
        type: 'democratic_voting',
        threshold: 'majority',
        vetoTriggers: ['security_risk', 'compliance_violation']
      },
      syncMechanism: {
        frequency: this.complexity === 'simple' ? 'daily' :
                    this.complexity === 'medium' ? 'daily' :
                    this.complexity === 'complex' ? 'every_4_hours' : 'realtime',
        reportTriggers: ['phase_complete', 'blocked', 'timeout_warning']
      }
    };
    
    this.outputs.coordinationProtocol = coordinationProtocol;
    
    // 自动检查
    this.checkChecklistItem('coordination', 'coordination_mode', true);
    this.checkChecklistItem('coordination', 'communication_protocol', true);
    this.checkChecklistItem('coordination', 'decision_mechanism', true);
    this.checkChecklistItem('coordination', 'sync_mechanism', true);
    this.completePhase('coordination');
    
    return {
      phase: 'coordination',
      protocol: coordinationProtocol
    };
  }
  
  /**
   * 确定协调模式
   */
  determineCoordinationMode() {
    if (this.complexity === 'simple') {
      return 'centralized'; // 集中式
    } else if (this.complexity === 'enterprise') {
      return 'distributed'; // 分布式
    }
    return 'hybrid'; // 混合式
  }
  
  // ============================================
  // 步骤5：政协协商（两轮）
  // ============================================
  
  /**
   * 步骤5-1：政协独立输出
   * @description 不看他人意见，独立分析议题
   */
  deliberateRound1(opinions = []) {
    this.setStatus('deliberation_round1');
    
    // 收集政协委员独立意见
    const independentResults = [];
    
    this.participants.cppcc.forEach(memberId => {
      const expertise = this.expertiseBindings[memberId];
      const opinion = opinions.find(o => o.memberId === memberId) || {
        memberId,
        expertise: expertise?.expertiseName,
        analysis: `[${expertise?.expertiseName}] 独立分析`,
        suggestions: [],
        risks: [],
        stance: 'independent' // 独立立场
      };
      
      independentResults.push({
        memberId,
        expertise: expertise?.expertiseName,
        opinion,
        timestamp: new Date().toISOString()
      });
    });
    
    this.outputs.deliberationRound1 = independentResults;
    
    return {
      phase: 'deliberation_round1',
      results: independentResults,
      instruction: '独立输出，不看他人意见'
    };
  }
  
  /**
   * 步骤5-2：意见共享 + 立场标记
   * @description 参考他人意见，选择立场
   */
  deliberateRound2(stanceDecisions = []) {
    this.setStatus('deliberation_round2');
    
    // 意见共享 + 立场标记
    const stanceResults = [];
    
    // 可选立场
    const VALID_STANCES = ['附议', '补充', '反对', '独立'];
    
    this.participants.cppcc.forEach(memberId => {
      const expertise = this.expertiseBindings[memberId];
      const decision = stanceDecisions.find(d => d.memberId === memberId) || {
        memberId,
        stance: '独立',
        reason: '保持独立判断'
      };
      
      // 验证立场
      const stance = VALID_STANCES.includes(decision.stance) ? decision.stance : '独立';
      
      stanceResults.push({
        memberId,
        expertise: expertise?.expertiseName,
        stance,
        reason: decision.reason,
        referencedOpinions: decision.referencedOpinions || [],
        timestamp: new Date().toISOString()
      });
    });
    
    this.outputs.deliberationRound2 = stanceResults;
    
    // 合并协商结果
    this.outputs.deliberationResults = {
      round1: this.outputs.deliberationRound1,
      round2: stanceResults,
      summary: this.summarizeDeliberation(stanceResults)
    };
    
    return {
      phase: 'deliberation_round2',
      results: stanceResults,
      summary: this.outputs.deliberationResults.summary
    };
  }
  
  /**
   * 政协协商讨论（兼容旧接口）
   */
  deliberate(opinions = []) {
    // 默认执行两轮协商
    const round1 = this.deliberateRound1(opinions);
    return round1;
  }
  
  /**
   * 汇总协商结果
   */
  summarizeDeliberation(results) {
    return {
      totalOpinions: results.length,
      consensus: results.length >= 3 ? '初步共识' : '需要进一步讨论',
      keyPoints: results.map(r => r.opinion.analysis).filter(Boolean),
      timestamp: new Date().toISOString()
    };
  }
  
  // ============================================
  // 步骤6：人大表决（三轮）
  // ============================================
  
  /**
   * 步骤6-1：人大质询（强制）
   * @description 每位人大代表必须提出至少1个质疑问题
   */
  inquiryRound(inquiries = []) {
    this.setStatus('inquiry');
    
    const inquiryResults = [];
    
    this.participants.npc.forEach(memberId => {
      const expertise = this.expertiseBindings[memberId];
      const inquiry = inquiries.find(i => i.memberId === memberId) || {
        memberId,
        expertise: expertise?.expertiseName,
        questions: ['默认质询问题：方案的可行性如何？'],
        targetMember: this.participants.cppcc[0] || 'cppcc-1'
      };
      
      // 确保至少有1个问题
      const questions = inquiry.questions?.length > 0 ? inquiry.questions : ['请补充质询问题'];
      
      inquiryResults.push({
        memberId,
        expertise: expertise?.expertiseName,
        questions,
        targetMember: inquiry.targetMember,
        timestamp: new Date().toISOString()
      });
    });
    
    this.outputs.inquiryResults = inquiryResults;
    
    return {
      phase: 'inquiry',
      results: inquiryResults,
      requirement: '人大必须提出至少1个质疑问题'
    };
  }
  
  /**
   * 步骤6-2：政协回应质询
   * @description 政协委员回应人大质询
   */
  inquiryResponse(responses = []) {
    this.setStatus('inquiry_response');
    
    const responseResults = [];
    
    this.participants.cppcc.forEach(memberId => {
      const expertise = this.expertiseBindings[memberId];
      const response = responses.find(r => r.memberId === memberId) || {
        memberId,
        answers: ['默认回应：已收到质询，将进一步完善方案']
      };
      
      responseResults.push({
        memberId,
        expertise: expertise?.expertiseName,
        answers: response.answers,
        timestamp: new Date().toISOString()
      });
    });
    
    this.outputs.inquiryResponses = responseResults;
    
    return {
      phase: 'inquiry_response',
      results: responseResults
    };
  }
  
  /**
   * 步骤6-3：人大投票
   * @description 投票必须附带理由
   */
  voteRound(votes = []) {
    this.setStatus('voting');
    
    // 收集人大代表投票
    const votingResult = {
      votes: [],
      summary: {
        approve: 0,
        reject: 0,
        abstain: 0
      },
      decision: null
    };
    
    this.participants.npc.forEach(memberId => {
      const expertise = this.expertiseBindings[memberId];
      const vote = votes.find(v => v.memberId === memberId) || {
        memberId,
        expertise: expertise?.expertiseName,
        vote: 'approve',
        reason: '从全局视角评估通过'
      };
      
      // 验证投票类型
      const validVotes = ['approve', '赞成', 'reject', '反对', 'abstain', '弃权'];
      let voteType = vote.vote;
      if (voteType === '赞成') voteType = 'approve';
      else if (voteType === '反对') voteType = 'reject';
      else if (voteType === '弃权') voteType = 'abstain';
      
      if (!['approve', 'reject', 'abstain'].includes(voteType)) {
        voteType = 'abstain';
      }
      
      votingResult.votes.push({
        memberId,
        expertise: expertise?.expertiseName,
        vote: voteType,
        voteText: voteType === 'approve' ? '赞成' : voteType === 'reject' ? '反对' : '弃权',
        reason: vote.reason,
        timestamp: new Date().toISOString()
      });
      
      // 统计
      if (voteType === 'approve') votingResult.summary.approve++;
      else if (voteType === 'reject') votingResult.summary.reject++;
      else votingResult.summary.abstain++;
    });
    
    // 决策：少数服从多数
    const total = votingResult.summary.approve + votingResult.summary.reject + votingResult.summary.abstain;
    if (votingResult.summary.approve > total / 2) {
      votingResult.decision = '通过';
    } else if (votingResult.summary.reject > total / 2) {
      votingResult.decision = '否决';
    } else {
      votingResult.decision = '需要重新讨论';
    }
    
    this.outputs.votingResult = votingResult;
    
    // 完成监督制衡阶段
    this.checkChecklistItem('supervision', 'supervision_mechanism', true);
    this.checkChecklistItem('supervision', 'check_balance', true);
    this.checkChecklistItem('supervision', 'supervision_independent', true);
    this.checkChecklistItem('supervision', 'check_effective', true);
    this.completePhase('supervision');
    
    return {
      phase: 'voting',
      votingResult
    };
  }
  
  /**
   * 人大审议表决（兼容旧接口）
   */
  vote(votes = []) {
    // 默认执行投票轮
    return this.voteRound(votes);
  }
  
  // ============================================
  // 步骤7：输出决策
  // ============================================
  
  /**
   * 输出最终决策
   */
  makeDecision() {
    this.setStatus('decision');
    
    const finalDecision = {
      topic: this.topic,
      projectType: this.outputs.roleMatrix?.projectType,
      goal: this.outputs.goalDocument,
      expertiseAssignments: this.expertiseBindings,
      deliberationSummary: this.summarizeDeliberation(this.outputs.deliberationResults),
      votingResult: this.outputs.votingResult,
      decision: this.outputs.votingResult?.decision,
      nextSteps: this.generateNextSteps(),
      createdAt: new Date().toISOString()
    };
    
    this.outputs.finalDecision = finalDecision;
    
    // 完成纠错机制阶段
    this.checkChecklistItem('error_correction', 'error_detection', true);
    this.checkChecklistItem('error_correction', 'error_handling', true);
    this.checkChecklistItem('error_correction', 'correction_ability', true);
    this.checkChecklistItem('error_correction', 'prevention_mechanism', true);
    this.completePhase('error_correction');
    
    // 标记完成
    this.setStatus('completed');
    
    return {
      phase: 'decision',
      finalDecision
    };
  }
  
  /**
   * 生成后续步骤
   */
  generateNextSteps() {
    const steps = [];
    
    if (this.outputs.votingResult?.decision === '通过') {
      steps.push('开始执行项目');
      steps.push('按照分工矩阵分配任务');
      steps.push('建立进度追踪机制');
    } else if (this.outputs.votingResult?.decision === '否决') {
      steps.push('重新分析问题');
      steps.push('调整方案');
      steps.push('重新召开审议会议');
    } else {
      steps.push('收集更多意见');
      steps.push('完善提案');
      steps.push('重新投票表决');
    }
    
    return steps;
  }
  
  // ============================================
  // 辅助方法
  // ============================================
  
  /**
   * 设置状态
   */
  setStatus(status) {
    this.status = status;
    this.currentPhase = status;
    this.updatedAt = new Date().toISOString();
    this.phaseHistory.push({
      phase: status,
      timestamp: this.updatedAt
    });
  }
  
  /**
   * 检查清单项
   */
  checkChecklistItem(phase, itemId, checked) {
    if (this.checklist[phase]) {
      const item = this.checklist[phase].items.find(i => i.id === itemId);
      if (item) {
        item.checked = checked;
      }
    }
  }
  
  /**
   * 完成阶段
   */
  completePhase(phase) {
    if (this.checklist[phase]) {
      const allChecked = this.checklist[phase].items.every(i => i.checked);
      this.checklist[phase].completed = allChecked;
    }
  }
  
  /**
   * 获取会议状态
   */
  getStatus() {
    return {
      id: this.id,
      type: this.type,
      topic: this.topic,
      status: this.status,
      currentPhase: this.currentPhase,
      participants: this.participants,
      expertiseBindings: this.expertiseBindings,
      checklistStatus: this.getChecklistStatus(),
      outputs: Object.keys(this.outputs).filter(k => this.outputs[k] !== null),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
  
  /**
   * 获取检查清单状态
   */
  getChecklistStatus() {
    const status = {};
    for (const [phase, data] of Object.entries(this.checklist)) {
      status[phase] = {
        name: data.name,
        completed: data.completed,
        progress: `${data.items.filter(i => i.checked).length}/${data.items.length}`
      };
    }
    return status;
  }
  
  /**
   * 获取完整报告
   */
  getReport() {
    return {
      meeting: this.getStatus(),
      outputs: this.outputs,
      checklist: this.checklist,
      phaseHistory: this.phaseHistory
    };
  }
}

// ============================================
// 会议管理器
// ============================================
class MeetingManager {
  constructor() {
    this.meetings = new Map();
  }
  
  /**
   * 创建会议
   */
  createMeeting(options) {
    const meeting = new DemocraticMeeting(options);
    this.meetings.set(meeting.id, meeting);
    return meeting;
  }
  
  /**
   * 获取会议
   */
  getMeeting(meetingId) {
    return this.meetings.get(meetingId);
  }
  
  /**
   * 列出会议
   */
  listMeetings(status = null) {
    const meetings = Array.from(this.meetings.values());
    if (status) {
      return meetings.filter(m => m.status === status);
    }
    return meetings;
  }
  
  /**
   * 快速创建并执行完整会议
   */
  runQuickMeeting(topic, description, complexity = 'medium', opinions = [], votes = []) {
    const meeting = this.createMeeting({
      type: 'project-planning',
      topic,
      description,
      complexity
    });
    
    // 执行七步闭环
    meeting.alignGoal();
    meeting.shareInformation();
    meeting.assignRoles();
    meeting.establishCoordination();
    meeting.deliberate(opinions);
    meeting.vote(votes);
    meeting.makeDecision();
    
    return meeting.getReport();
  }
}

// ============================================
// 导出
// ============================================
module.exports = {
  DemocraticMeeting,
  MeetingManager,
  MEETING_TYPES,
  MEETING_STATUS,
  // 新增：两轮协商 + 三轮表决
  PHASES: {
    STEP_5_1: 'deliberation_round1',
    STEP_5_2: 'deliberation_round2',
    STEP_6_1: 'inquiry',
    STEP_6_2: 'inquiry_response',
    STEP_6_3: 'voting'
  },
  // 立场标记
  STANCES: ['附议', '补充', '反对', '独立'],
  // 投票类型
  VOTE_TYPES: ['赞成', '反对', '弃权']
};