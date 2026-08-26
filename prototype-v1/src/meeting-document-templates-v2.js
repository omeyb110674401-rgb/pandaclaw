/**
 * 会议文档模板 - 按会议类型生成
 * @author cppcc-4 (产品专家)
 * @version 2.0
 * @updated 2026-03-27
 */

/**
 * 生成协商型会议文档（白皮书风格）
 */
function generateConsultationDocument(state) {
  const stageData = state.stageData || {};
  const stageResults = state.stageResults || {};
  
  const docNo = generateDocNumber(state.meetingId, '协');
  const date = new Date(state.createdAt).toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
  
  let doc = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    协商会议报告
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

                        ${docNo}

───────────────────────────────────────────────────────────────────────

【前言】

    本报告依据协商型会议流程，就"${state.topic}"议题完成深度协商。

    流程阶段：
    1. 立项 → 2. 成立起草组 → 3. 调查研究 → 4. 起草初稿
    5. 征求意见 → 6. 审议表决 → 7. 审定发布

───────────────────────────────────────────────────────────────────────

【一、会议概况】

    议题：${state.topic}
    
    背景：${state.description || '（详见调研报告）'}
    
    参会人员：
`;

  // 政协委员
  doc += `\n    政协委员会：\n`;
  state.participants.cppcc.forEach(id => {
    const expertise = state.expertiseBindings?.[id]?.expertiseName || '未分配';
    doc += `        · ${id}（${expertise}）\n`;
  });
  
  // 人大代表
  doc += `\n    人民代表大会：\n`;
  state.participants.npc.forEach(id => {
    const expertise = state.expertiseBindings?.[id]?.expertiseName || '未分配';
    doc += `        · ${id}（${expertise}）\n`;
  });
  
  // 各阶段结果
  doc += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【二、协商过程】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

  // 调查研究阶段
  if (stageResults.research) {
    doc += `
一、调查研究阶段

    本阶段政协委员开展了深入调研，收集了背景资料和历史数据。
    
    调研成果：
${formatStageOutput(stageResults.research.outputs?.调研报告)}
`;
  }
  
  // 起草初稿阶段
  if (stageResults.drafting) {
    doc += `
二、起草初稿阶段

    各政协委员独立分析议题，形成个人意见书。
    
    个人意见汇总：
${formatStageOutput(stageResults.drafting.outputs?.个人意见书)}
`;
  }
  
  // 征求意见阶段
  if (stageResults.consultation) {
    doc += `
三、征求意见阶段

    政协委员分享意见，讨论分歧点，形成共识。
    
    意见汇总：
${formatStageOutput(stageResults.consultation.outputs?.意见汇总)}

    立场记录：
${formatStageOutput(stageResults.consultation.outputs?.立场记录)}
`;
  }
  
  // 审议表决阶段
  if (stageResults.review) {
    doc += `
四、审议表决阶段

    人大代表审查提案，提出质询，投票表决。
    
    质询记录：
${formatStageOutput(stageResults.review.outputs?.质询记录)}
    
    投票结果：
${formatStageOutput(stageResults.review.outputs?.投票结果)}
`;
  }
  
  // 决策输出
  doc += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【三、决策结论】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    会议结论：${state.status === 'completed' ? '已完成' : '进行中'}

    最终决策：
${formatStageOutput(stageResults.publication?.outputs?.决策文件)}

───────────────────────────────────────────────────────────────────────

                        ${date}

                    民主协商会议系统 印制

───────────────────────────────────────────────────────────────────────

  抄送：各参会委员、代表
  印发日期：${date}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
  
  return doc;
}

/**
 * 生成战略型会议文档（一号文件风格）
 */
function generateStrategicDocument(state) {
  const stageResults = state.stageResults || {};
  
  const docNo = generateDocNumber(state.meetingId, '战');
  const date = new Date(state.createdAt).toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
  
  return `
╔═══════════════════════════════════════════════════════════════════════╗
║                                                                       ║
║                    战略决策文件                                        ║
║                                                                       ║
║                        ${docNo}                        ║
║                                                                       ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  关于"${state.topic}"的战略决策                                        ║
║                                                                       ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  【第一部分：前期评估】                                                ║
║                                                                       ║
║      中期评估报告：                                                    ║
${formatBoxContent(stageResults.assessment?.outputs?.中期评估报告, 6)}
║                                                                       ║
║  【第二部分：战略研究】                                                ║
║                                                                       ║
║      战略研究报告：                                                    ║
${formatBoxContent(stageResults.research?.outputs?.战略研究报告, 6)}
║                                                                       ║
║  【第三部分：战略目标】                                                ║
║                                                                       ║
║      战略建议稿：                                                      ║
${formatBoxContent(stageResults.drafting?.outputs?.战略建议稿, 6)}
║                                                                       ║
║  【第四部分：实施规划】                                                ║
║                                                                       ║
║      详细规划：                                                        ║
${formatBoxContent(stageResults.planning?.outputs?.实施规划, 6)}
║                                                                       ║
║      里程碑计划：                                                      ║
${formatBoxContent(stageResults.planning?.outputs?.里程碑计划, 6)}
║                                                                       ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  本战略决策经民主协商会议审议通过，自发布之日起施行。                  ║
║                                                                       ║
║                                        ${date}                        ║
║                                                                       ║
║                                   民主协商会议系统                    ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
`;
}

/**
 * 生成决议型会议文档（红头文件风格）
 */
function generateResolutionDocument(state) {
  const stageResults = state.stageResults || {};
  
  const docNo = generateDocNumber(state.meetingId, '决');
  const date = new Date(state.createdAt).toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
  
  const voteResult = stageResults.review?.outputs?.投票结果 || {};
  const passed = voteResult.passed !== false;
  
  return `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                        民 主 协 商 会 议                              ┃
┃                                                                       ┃
┃                            决 议                                      ┃
┃                                                                       ┃
┃                        ${docNo}                        ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

关于"${state.topic}"的决议

───────────────────────────────────────────────────────────────────────

    经民主协商会议审议，现就"${state.topic}"作出如下决议：

    一、${stageResults.publication?.outputs?.正式决议文件?.content || '（根据会议结果填写）'}

    二、本决议自通过之日起生效。

───────────────────────────────────────────────────────────────────────

表决结果：${passed ? '通过' : '未通过'}
${formatVoteResult(voteResult)}

───────────────────────────────────────────────────────────────────────

                                        ${date}

                                   民主协商会议系统

───────────────────────────────────────────────────────────────────────
主题词：决议  ${state.topic?.slice(0, 10) || ''}
───────────────────────────────────────────────────────────────────────
`;
}

/**
 * 生成规划型会议文档（规划纲要风格）
 */
function generatePlanningDocument(state) {
  const stageResults = state.stageResults || {};
  
  const docNo = generateDocNumber(state.meetingId, '规');
  const date = new Date(state.createdAt).toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
  
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                         规 划 纲 要
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

                        ${docNo}

【第一部分：前期评估】

    一、上一周期目标完成情况
${formatIndent(JSON.stringify(stageResults.assessment?.outputs?.中期评估报告?.goalCompletion || {}, null, 2), 8)}

    二、存在的问题与不足
${formatList(stageResults.assessment?.outputs?.中期评估报告?.problems, 8)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【第二部分：本周期规划】

    一、规划背景
        ${state.description || ''}

    二、规划目标
${formatIndent(JSON.stringify(stageResults.drafting?.outputs?.规划建议稿?.goals || [], null, 2), 8)}

    三、里程碑计划
${formatList(stageResults.planning?.outputs?.里程碑计划?.milestones, 8)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【第三部分：实施保障】

    一、资源配置
${formatIndent(JSON.stringify(stageResults.drafting?.outputs?.规划建议稿?.resources || {}, null, 2), 8)}

    二、责任分工
${formatIndent(JSON.stringify(stageResults.drafting?.outputs?.规划建议稿?.responsibilities || {}, null, 2), 8)}

───────────────────────────────────────────────────────────────────────

                        ${date}

                    民主协商会议系统 印制

───────────────────────────────────────────────────────────────────────
`;
}

/**
 * 生成立法型会议文档（行政法规风格）
 */
function generateLegislativeDocument(state) {
  const stageResults = state.stageResults || {};
  
  const docNo = generateDocNumber(state.meetingId, '法');
  const date = new Date(state.createdAt).toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
  
  const regulation = stageResults.publication?.outputs?.正式规范文件 || {};
  const articles = stageResults.drafting?.outputs?.['规范草案（征求意见稿）']?.articles || [];
  
  let doc = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                           规范文件
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

                        ${docNo}

${state.topic}

第一章  总则

    第一条  为规范${state.topic}，制定本规范。

    第二条  本规范适用于相关范围。

`;
  
  if (articles.length > 0) {
    doc += `第二章  具体规定\n\n`;
    articles.forEach((article, i) => {
      doc += `    第${i + 3}条  ${article}\n\n`;
    });
  }
  
  doc += `第三章  施行

    本规范自发布之日起施行。

───────────────────────────────────────────────────────────────────────

【附件】

    1. 公开征求意见报告
    2. 专家论证报告
    3. 合规审查报告

───────────────────────────────────────────────────────────────────────

                        ${date}

                    民主协商会议系统 印制

───────────────────────────────────────────────────────────────────────
`;
  
  return doc;
}

/**
 * 生成纪要型会议文档（会议纪要风格）
 */
function generateMinutesDocument(state) {
  const stageResults = state.stageResults || {};
  const date = new Date(state.createdAt).toLocaleDateString('zh-CN');
  
  const recording = stageResults.recording?.outputs?.原始记录 || {};
  const minutes = stageResults.compilation?.outputs?.会议纪要草稿 || {};
  
  return `
【会议纪要】

会议议题：${state.topic}
会议时间：${date}
参会人员：政协${state.participants.cppcc?.length || 0}人${state.participants.npc?.length ? `，人大${state.participants.npc.length}人` : ''}

──────────────────────────────────────────────────────────────────────

【讨论内容】

${formatList(recording.discussions, 0) || '（待记录）'}

──────────────────────────────────────────────────────────────────────

【会议结论】

    ${minutes.summary || '（待填写）'}

【待办事项】

${formatList(minutes.actionItems, 4) || '    （无）'}

──────────────────────────────────────────────────────────────────────

                                    记录人：系统
                                    ${date}
`;
}

// ========== 辅助函数 ==========

/**
 * 生成文档编号
 */
function generateDocNumber(meetingId, type) {
  const year = new Date().getFullYear();
  const hash = meetingId.split('-').pop() || Date.now().toString().slice(-6);
  const seq = parseInt(hash, 16) % 1000;
  
  const typeMap = {
    '协': '熊猫协字',
    '战': '熊猫战字',
    '决': '熊猫决字',
    '规': '熊猫规字',
    '法': '熊猫法字'
  };
  
  const prefix = typeMap[type] || '熊猫协字';
  return `${prefix}〔${year}〕${String(seq).padStart(3, '0')}号`;
}

/**
 * 格式化阶段输出
 */
function formatStageOutput(output) {
  if (!output) return '    （无）';
  if (typeof output === 'string') return `    ${output}`;
  return `    ${JSON.stringify(output, null, 4).split('\n').join('\n    ')}`;
}

/**
 * 格式化列表
 */
function formatList(items, indent) {
  if (!items || items.length === 0) return '';
  const spaces = ' '.repeat(indent);
  return items.map((item, i) => `${spaces}${i + 1}. ${item}`).join('\n');
}

/**
 * 格式化缩进
 */
function formatIndent(text, indent) {
  const spaces = ' '.repeat(indent);
  return text.split('\n').map(line => spaces + line).join('\n');
}

/**
 * 格式化方框内容
 */
function formatBoxContent(content, indent) {
  if (!content) return ' '.repeat(indent) + '（待填写）';
  const spaces = ' '.repeat(indent);
  const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  return text.split('\n').map(line => spaces + '║      ' + line).join('\n');
}

/**
 * 格式化投票结果
 */
function formatVoteResult(result) {
  if (!result || !result.votes) return '';
  const votes = result.votes;
  const lines = [];
  Object.entries(votes).forEach(([agent, vote]) => {
    lines.push(`    ${agent}：${vote.vote || vote}`);
  });
  return lines.join('\n');
}

/**
 * 根据会议类型生成文档
 */
function generateDocument(state) {
  const meetingType = state.meetingType || 'CONSULTATION';
  
  switch (meetingType) {
    case 'CONSULTATION':
      return generateConsultationDocument(state);
    case 'STRATEGIC':
      return generateStrategicDocument(state);
    case 'RESOLUTION':
      return generateResolutionDocument(state);
    case 'PLANNING':
      return generatePlanningDocument(state);
    case 'LEGISLATIVE':
      return generateLegislativeDocument(state);
    case 'MINUTES':
      return generateMinutesDocument(state);
    default:
      return generateConsultationDocument(state);
  }
}

module.exports = {
  generateDocument,
  generateConsultationDocument,
  generateStrategicDocument,
  generateResolutionDocument,
  generatePlanningDocument,
  generateLegislativeDocument,
  generateMinutesDocument,
  generateDocNumber
};