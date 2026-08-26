/**
 * 信息隔离层 - 会议消息模板
 * 确保main不向政协/人大传递预设意见
 * 
 * @author cppcc-1（AI工程师）
 */

// ============================================
// 核心Schema定义
// ============================================

const MESSAGE_SCHEMA = {
  // 必需字段
  required: ['sessionId', 'step', 'topic', 'role', 'expertise'],
  
  // 禁止字段（隔离main倾向）
  forbidden: [
    'mainOpinion',      // main预设意见
    'expectedAnswer',   // 期望答案
    'hint',             // 提示词
    'bias',             // 倾向内容
    'previousVotes',    // 历史投票（避免跟票）
    'suggestedResult'   // 建议结果
  ],
  
  // 允许字段
  allowed: ['sessionId', 'step', 'topic', 'role', 'expertise', 
            'context', 'deadline', 'createdAt']
};

// ============================================
// 消息构建器
// ============================================

/**
 * 创建隔离消息
 */
function createIsolatedMessage(options) {
  // 1. 验证必需字段
  const missing = MESSAGE_SCHEMA.required.filter(f => !options[f]);
  if (missing.length > 0) {
    throw new Error(`[信息隔离] 缺少必需字段: ${missing.join(', ')}`);
  }
  
  // 2. 检测禁止字段
  const violations = MESSAGE_SCHEMA.forbidden.filter(f => options[f] !== undefined);
  if (violations.length > 0) {
    throw new Error(`[信息隔离] 检测到禁止字段: ${violations.join(', ')}`);
  }
  
  // 3. 构建纯净消息
  return {
    sessionId: options.sessionId,
    step: options.step,
    topic: purifyTopic(options.topic),
    role: options.role,
    expertise: {
      id: options.expertise.id,
      name: options.expertise.name,
      perspective: options.expertise.perspective
    },
    context: {
      history: purifyHistory(options.context?.history || []),
      constraints: options.context?.constraints || []
    },
    deadline: options.deadline || 30000,
    createdAt: new Date().toISOString()
  };
}

/**
 * 净化议题（移除引导性内容）
 */
function purifyTopic(topic) {
  if (typeof topic !== 'string') return topic;
  
  const biasPatterns = [
    /^我们认为[：:]/,
    /^建议你[：:]/,
    /^你应该[：:]/,
    /^正确的做法是[：:]/,
    /^推荐方案是[：:]/
  ];
  
  let purified = topic.trim();
  for (const pattern of biasPatterns) {
    purified = purified.replace(pattern, '');
  }
  
  return purified.trim();
}

/**
 * 净化历史记录（递归移除倾向性字段）
 */
function purifyHistory(history) {
  if (!Array.isArray(history)) return [];
  
  return history.map(item => {
    const purified = { ...item };
    // 移除可能的倾向性字段
    MESSAGE_SCHEMA.forbidden.forEach(f => delete purified[f]);
    return purified;
  });
}

/**
 * 验证消息完整性
 */
function validateMessage(message) {
  const errors = [];
  
  // 检查必需字段
  MESSAGE_SCHEMA.required.forEach(f => {
    if (!message[f]) errors.push(`缺少必需字段: ${f}`);
  });
  
  // 检查禁止字段
  MESSAGE_SCHEMA.forbidden.forEach(f => {
    if (message[f] !== undefined) errors.push(`存在禁止字段: ${f}`);
  });
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 格式化为发送文本
 */
function formatForSend(message) {
  const header = `【民主协商会议 - 步骤${message.step}】\n`;
  const identity = `\n你是${message.role}（${message.expertise.name}）。\n`;
  const task = `\n**议题：** ${message.topic}\n`;
  const footer = '\n请从你的专业视角独立分析，给出你的意见。简短回复。';
  
  return header + identity + task + footer;
}

// ============================================
// 导出
// ============================================

module.exports = {
  MESSAGE_SCHEMA,
  createIsolatedMessage,
  purifyTopic,
  purifyHistory,
  validateMessage,
  formatForSend
};