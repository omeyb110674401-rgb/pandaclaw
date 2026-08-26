#!/usr/bin/env node
/**
 * 生成会议文件示例脚本
 * @author cppcc-4 (产品专家)
 * @description 演示如何生成官方格式的会议文件
 * 
 * 用法：
 *   node scripts/generate-meeting-document.js [meetingId] [format]
 *   
 * format 选项：
 *   - cover: 会议封面
 *   - full: 完整报告（白皮书风格）
 *   - redheader: 红头文件
 *   - minutes: 会议纪要
 */

const path = require('path');
const { generateDocument, saveDocument, listMeetings } = require('./meeting-state-store');

// 解析命令行参数
const meetingId = process.argv[2];
const format = process.argv[3] || 'full';

function main() {
  console.log('🐼 PandaClaw - 会议文件生成器\n');
  
  // 如果没有指定会议 ID，列出最近的会议
  if (!meetingId) {
    console.log('📋 最近的会议：\n');
    const meetings = listMeetings().slice(-5).reverse();
    
    if (meetings.length === 0) {
      console.log('   （无会议记录）');
      console.log('\n用法：node scripts/generate-meeting-document.js <meetingId> [format]');
      console.log('示例：node scripts/generate-meeting-document.js meeting-20260327-123456 full\n');
      return;
    }
    
    meetings.forEach((m, i) => {
      console.log(`   ${i + 1}. ${m.meetingId}`);
      console.log(`      议题：${m.topic}`);
      console.log(`      状态：${m.status}`);
      console.log(`      时间：${new Date(m.createdAt).toLocaleString('zh-CN')}`);
      console.log('');
    });
    
    return;
  }
  
  // 生成指定格式的文档
  console.log(`📄 生成会议文件：${meetingId}`);
  console.log(`   格式：${getFormatName(format)}\n`);
  
  try {
    // 生成文档
    const doc = generateDocument(meetingId, format);
    
    // 保存到文件
    const filepath = saveDocument(meetingId, format);
    
    console.log(`✅ 文件已生成：${filepath}`);
    console.log(`\n📊 文档预览（前 50 行）：\n`);
    console.log('─'.repeat(60));
    
    const lines = doc.split('\n').slice(0, 50);
    console.log(lines.join('\n'));
    
    if (doc.split('\n').length > 50) {
      console.log('\n...（更多内容请查看文件）');
    }
    
    console.log('\n' + '─'.repeat(60));
    console.log(`\n💡 提示：可用格式包括 cover, full, redheader, minutes`);
    console.log(`   完整报告：node scripts/generate-meeting-document.js ${meetingId} full`);
    console.log(`   红头文件：node scripts/generate-meeting-document.js ${meetingId} redheader`);
    console.log(`   会议纪要：node scripts/generate-meeting-document.js ${meetingId} minutes\n`);
    
  } catch (err) {
    console.error(`❌ 错误：${err.message}`);
    console.error('\n可能的原因：');
    console.error('   1. 会议 ID 不存在');
    console.error('   2. 会议数据不完整');
    console.error('   3. 文件格式参数错误\n');
    process.exit(1);
  }
}

function getFormatName(format) {
  const names = {
    'cover': '会议封面',
    'full': '完整报告（白皮书风格）',
    'redheader': '红头文件',
    'minutes': '会议纪要'
  };
  return names[format] || format;
}

main();