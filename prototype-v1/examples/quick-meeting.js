/**
 * 快速会议示例
 * 一键运行完整决策流程
 */

const { MeetingManager } = require('../src/democratic-meeting-system');

async function main() {
  console.log('🐼 PandaClaw - 快速会议模式\n');
  
  const manager = new MeetingManager();
  
  // 快速会议 - 一键运行
  const result = manager.runQuickMeeting(
    '技术架构选型',
    '为新项目选择技术架构：单体应用 vs 微服务架构',
    'medium'
  );
  
  console.log('📊 快速决策结果:');
  console.log('─'.repeat(40));
  console.log(`议题: ${result.topic}`);
  console.log(`通过: ${result.passed ? '✅ 是' : '❌ 否'}`);
  console.log(`参与者: 政协${result.participants.cppcc}人, 人大${result.participants.npc}人`);
  console.log('\n决策摘要:');
  console.log(result.summary);
  
  console.log('\n✅ 快速会议完成');
}

main().catch(console.error);