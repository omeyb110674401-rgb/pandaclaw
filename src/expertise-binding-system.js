/**
 * 专业身份赋予系统（完整版）
 * 基于180个专业Agent分类
 */

const { NPC_EXPERTISE, CPPCC_EXPERTISE, CATEGORY_SUMMARY, CPPCC_MEMBERS, NPC_MEMBERS } = require('./expertise-categories');

// 当前绑定状态
let currentBindings = {};

/**
 * 绑定专业身份
 */
function bindExpertise(memberId, expertiseId) {
  const isCppcc = CPPCC_MEMBERS.includes(memberId);
  const isNpc = NPC_MEMBERS.includes(memberId);
  
  if (!isCppcc && !isNpc) {
    throw new Error(`无效的成员ID: ${memberId}`);
  }
  
  const expertiseList = isCppcc ? CPPCC_EXPERTISE : NPC_EXPERTISE;
  const expertise = expertiseList[expertiseId];
  
  if (!expertise) {
    const allowedList = isCppcc ? Object.keys(CPPCC_EXPERTISE) : Object.keys(NPC_EXPERTISE);
    throw new Error(`${memberId} 不能绑定身份: ${expertiseId}`);
  }
  
  currentBindings[memberId] = expertiseId;
  console.log(`✅ ${memberId} → ${expertise.name} (${expertise.perspective})`);
  
  return { memberId, expertiseId, ...expertise };
}

/**
 * 批量绑定
 */
function bindExpertiseBatch(bindings) {
  const results = [];
  for (const [memberId, expertiseId] of Object.entries(bindings)) {
    try {
      results.push(bindExpertise(memberId, expertiseId));
    } catch (error) {
      console.error(`❌ ${memberId}: ${error.message}`);
    }
  }
  return results;
}

/**
 * 获取成员的专业身份
 */
function getMemberExpertise(memberId) {
  const expertiseId = currentBindings[memberId];
  if (!expertiseId) return null;
  
  const isCppcc = CPPCC_MEMBERS.includes(memberId);
  const expertiseList = isCppcc ? CPPCC_EXPERTISE : NPC_EXPERTISE;
  return expertiseList[expertiseId] || null;
}

/**
 * 获取可用的专业身份列表（按分类）
 */
function getAvailableExpertiseByCategory(memberId) {
  const isCppcc = CPPCC_MEMBERS.includes(memberId);
  const categories = isCppcc ? CATEGORY_SUMMARY.cppcc : CATEGORY_SUMMARY.npc;
  const expertiseList = isCppcc ? CPPCC_EXPERTISE : NPC_EXPERTISE;
  
  const result = {};
  for (const [category, ids] of Object.entries(categories)) {
    result[category] = ids.map(id => ({
      id,
      ...expertiseList[id]
    }));
  }
  return result;
}

/**
 * 获取可用的专业身份列表（平铺）
 */
function getAvailableExpertise(memberId) {
  const isCppcc = CPPCC_MEMBERS.includes(memberId);
  const expertiseList = isCppcc ? CPPCC_EXPERTISE : NPC_EXPERTISE;
  
  return Object.entries(expertiseList).map(([id, info]) => ({
    id,
    ...info
  }));
}

/**
 * 生成系统提示词
 */
function generateSystemPrompt(memberId) {
  const isCppcc = CPPCC_MEMBERS.includes(memberId);
  const role = isCppcc ? '政协委员' : '人大代表';
  const roleType = isCppcc ? '特定领域专家' : '全局观身份';
  const expertise = getMemberExpertise(memberId);
  
  let prompt = `你是${memberId}，担任${role}（${roleType}）。`;
  
  if (expertise) {
    prompt += `\n\n## 专业身份\n**${expertise.name}** (${expertise.perspective})\n\n${expertise.description}`;
  }
  
  if (isCppcc) {
    prompt += `\n\n## 政协委员职责\n- 从专业领域视角分析议题\n- 提出专业建议和技术方案\n- 关注技术细节和实现\n- ❌ 无最终决策权`;
  } else {
    prompt += `\n\n## 人大代表职责\n- 从全局视角评判方案\n- 评估可行性和风险\n- 投票表决，少数服从多数\n- ✅ 有最终决策权`;
  }
  
  return prompt;
}

/**
 * 获取所有成员信息
 */
function getAllMembers() {
  const members = [];
  
  for (const id of CPPCC_MEMBERS) {
    members.push({
      id,
      role: 'cppcc',
      roleName: '政协委员',
      roleType: '特定领域专家',
      expertise: getMemberExpertise(id)
    });
  }
  
  for (const id of NPC_MEMBERS) {
    members.push({
      id,
      role: 'npc',
      roleName: '人大代表',
      roleType: '全局观身份',
      expertise: getMemberExpertise(id)
    });
  }
  
  return members;
}

/**
 * 获取身份配置
 */
function getExpertiseConfig() {
  return {
    npc: NPC_EXPERTISE,
    cppcc: CPPCC_EXPERTISE,
    categories: CATEGORY_SUMMARY
  };
}

module.exports = {
  bindExpertise,
  bindExpertiseBatch,
  getMemberExpertise,
  getAvailableExpertise,
  getAvailableExpertiseByCategory,
  generateSystemPrompt,
  getAllMembers,
  getExpertiseConfig,
  CPPCC_MEMBERS,
  NPC_MEMBERS
};