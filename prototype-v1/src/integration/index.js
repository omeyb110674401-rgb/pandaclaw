/**
 * Integration 模块入口
 * @author npc-2 (AI工程师)
 * @version 1.0.0
 * @contract contracts/api.ts, contracts/messages.ts
 */

const { TokenPool, TOKEN_POOL_CONFIG } = require('./TokenPool');
const { VersionRouter } = require('./VersionRouter');
const { OpenClawBridge, OPENCLAW_CONFIG } = require('./OpenClawBridge');
const { LLMScheduler, LLM_SCHEDULER_CONFIG } = require('./LLMScheduler');

module.exports = {
  // 令牌池
  TokenPool,
  TOKEN_POOL_CONFIG,
  
  // 版本路由
  VersionRouter,
  
  // OpenClaw 桥接
  OpenClawBridge,
  OPENCLAW_CONFIG,
  
  // LLM 调度器
  LLMScheduler,
  LLM_SCHEDULER_CONFIG,
  
  // 常量
  CONTRACT_VERSION: 1
};