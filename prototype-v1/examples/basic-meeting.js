/**
 * 基础会议示例
 * 演示完整的七步闭环流程
 */

const { MeetingManager } = require('../src/democratic-meeting-system');

async function main() {
  console.log('🐼 PandaClaw - 民主协商决策系统示例\n');
  
  // 创建会议管理器
  const manager = new MeetingManager();
  
  // 创建会议
  console.log('📋 创建会议...');
  const meeting = manager.createMeeting({
    type: 'project-planning',
    topic: '开发智能客服系统',
    description: `
      开发一个AI智能客服系统，具备以下功能：
      1. 多轮对话能力
      2. 知识库检索
      3. 情感分析
      4. 人机协作转接
    `,
    complexity: 'complex',
    constraints: [
      '预算：50万以内',
      '周期：3个月内上线',
      '技术栈：Node.js + Python'
    ]
  });
  
  console.log(`   会议ID: ${meeting.id}`);
  console.log(`   类型: ${meeting.type}`);
  console.log(`   复杂度: ${meeting.complexity}\n`);
  
  // 步骤1：目标对齐
  console.log('📍 步骤1：目标对齐');
  meeting.alignGoal();
  console.log('   ✅ 目标文档已生成\n');
  
  // 步骤2：信息共享
  console.log('📍 步骤2：信息共享');
  meeting.shareInformation();
  console.log('   ✅ 上下文包已构建\n');
  
  // 步骤3：角色分工
  console.log('📍 步骤3：角色分工');
  meeting.assignRoles();
  console.log('   ✅ 角色矩阵已分配');
  console.log(`   政协委员: ${meeting.participants.cppcc.length}人`);
  console.log(`   人大代表: ${meeting.participants.npc.length}人\n`);
  
  // 步骤4：协调机制
  console.log('📍 步骤4：协调机制');
  meeting.establishCoordination();
  console.log('   ✅ 协调协议已建立\n');
  
  // 步骤5：政协协商（两轮）
  console.log('📍 步骤5：政协协商');
  
  // 5-1: 独立输出
  console.log('   5-1: 独立输出...');
  const independentOpinions = [
    {
      agent: 'cppcc-1',
      expertise: 'AI工程师',
      opinion: '建议采用RAG架构，结合向量数据库实现知识库检索。技术选型：LangChain + Pinecone',
      risks: ['向量数据库成本', '模型响应延迟']
    },
    {
      agent: 'cppcc-2',
      expertise: '后端专家',
      opinion: '后端采用微服务架构，API Gateway统一入口。数据库选型：PostgreSQL + Redis',
      risks: ['服务间通信复杂度']
    },
    {
      agent: 'cppcc-3',
      expertise: '前端专家',
      opinion: '前端采用React + TypeScript，WebSocket实现实时通信。UI组件库：Ant Design',
      risks: ['首次加载性能']
    },
    {
      agent: 'cppcc-4',
      expertise: '产品专家',
      opinion: '优先实现核心对话功能，分三期迭代。一期：基础问答；二期：知识库；三期：情感分析',
      risks: ['用户期望管理']
    }
  ];
  
  // 5-2: 意见共享 + 立场标记
  console.log('   5-2: 意见共享 + 立场标记...');
  const positions = [
    { agent: 'cppcc-1', stance: 'independent', reason: '保持RAG架构方案' },
    { agent: 'cppcc-2', stance: 'supplement', reason: '同意微服务架构，补充服务治理方案' },
    { agent: 'cppcc-3', stance: 'endorse', reason: '附议前端方案，React + TS是成熟选择' },
    { agent: 'cppcc-4', stance: 'supplement', reason: '同意分期迭代，建议增加用户反馈闭环' }
  ];
  
  meeting.deliberate({ independentOpinions, positions });
  console.log('   ✅ 政协协商完成\n');
  
  // 步骤6：人大表决（三轮）
  console.log('📍 步骤6：人大表决');
  
  // 6-1: 质询
  console.log('   6-1: 质询...');
  const inquiries = [
    {
      agent: 'npc-1',
      expertise: '系统架构师',
      question: 'RAG架构的向量数据库选型，是否考虑过国产替代方案？数据安全如何保障？'
    },
    {
      agent: 'npc-2',
      expertise: '风险评估师',
      question: '微服务架构增加了运维复杂度，是否有DevOps自动化方案？'
    },
    {
      agent: 'npc-3',
      expertise: '质量监督员',
      question: '分期迭代的验收标准是什么？如何确保每期交付质量？'
    }
  ];
  
  // 6-2: 政协回应
  console.log('   6-2: 政协回应...');
  const responses = [
    {
      inquiry: inquiries[0],
      response: '可选用Milvus开源方案，数据加密存储，支持私有化部署。知识库数据不涉及敏感信息。'
    },
    {
      inquiry: inquiries[1],
      response: '建议采用Kubernetes + CI/CD流水线，已有成熟方案可复用。运维文档同步建设。'
    },
    {
      inquiry: inquiries[2],
      response: '每期设置明确的验收清单，包含功能测试、性能指标、用户满意度三个维度。'
    }
  ];
  
  // 6-3: 投票
  console.log('   6-3: 投票...');
  const votes = [
    { agent: 'npc-1', vote: 'approve', reason: '方案可行，数据安全措施完善' },
    { agent: 'npc-2', vote: 'approve', reason: '风险评估通过，有配套DevOps方案' },
    { agent: 'npc-3', vote: 'approve', reason: '质量保障机制健全，同意执行' }
  ];
  
  meeting.vote({ inquiries, responses, votes });
  console.log('   ✅ 人大表决完成\n');
  
  // 步骤7：决策输出
  console.log('📍 步骤7：决策输出');
  const decision = meeting.makeDecision();
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 决策结果');
  console.log('='.repeat(60));
  console.log(`\n议题: ${meeting.topic}`);
  console.log(`\n投票结果: ${votes.filter(v => v.vote === 'approve').length}赞成 / ${votes.filter(v => v.vote === 'reject').length}反对 / ${votes.filter(v => v.vote === 'abstain').length}弃权`);
  console.log(`\n结论: ${decision.passed ? '✅ 通过' : '❌ 未通过'}`);
  console.log('\n后续步骤:');
  decision.nextSteps.forEach((step, i) => {
    console.log(`   ${i + 1}. ${step}`);
  });
  
  // 持久化
  const savedPath = manager.saveMeeting(meeting.id);
  console.log(`\n📁 会议记录已保存: ${savedPath}`);
}

main().catch(console.error);