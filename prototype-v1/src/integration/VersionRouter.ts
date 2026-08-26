/**
 * VersionRouter - 版本路由（符合契约 v1）
 * @author npc-2 (AI工程师)
 * @version 1.0.0
 * @contract contracts/api.ts, contracts/messages.ts
 * 
 * 功能：
 * - v1/v2/v3 版本路由
 * - 向后兼容检查
 * - 版本不匹配降级
 * - Breaking Change 拦截
 */

import { EventEmitter } from 'events';

/** 当前支持的契约版本 */
const SUPPORTED_VERSIONS = [1, 2, 3] as const;
const CURRENT_VERSION = 1;

/** 版本类型 */
export type ContractVersion = 1 | 2 | 3;

/** 版本兼容性类型 */
export type Compatibility = 'full' | 'partial' | 'none';

/** 版本检查结果 */
export interface VersionCheckResult {
  version: ContractVersion;
  compatibility: Compatibility;
  warnings: string[];
  errors: string[];
  canProceed: boolean;
  downgradeTo?: ContractVersion;
}

/** 版本路由配置 */
export interface VersionRouterOptions {
  strictMode?: boolean;        // 严格模式（拒绝部分兼容）
  autoDowngrade?: boolean;     // 自动降级
  breakingChangeHandler?: (version: number, message: any) => void;
}

/** 版本变更记录 */
export interface VersionChangeLog {
  version: ContractVersion;
  changes: string[];
  breakingChanges: string[];
  deprecatedFields: string[];
  newFields: string[];
}

/** 版本变更日志 */
const VERSION_CHANGELOG: VersionChangeLog[] = [
  {
    version: 1,
    changes: ['初始版本'],
    breakingChanges: [],
    deprecatedFields: [],
    newFields: [
      'Meeting', 'Message', 'StateSnapshot', 'AgentStatus',
      'QueuedMessage', 'TokenPoolStatus'
    ]
  },
  {
    version: 2,
    changes: ['扩展会议类型', '新增紧急会议'],
    breakingChanges: [],
    deprecatedFields: [],
    newFields: ['MeetingType.emergency', 'HeartbeatRequest', 'HeartbeatResponse']
  },
  {
    version: 3,
    changes: ['重构消息结构', '优化状态管理'],
    breakingChanges: [
      'Meeting.participants 结构变更',
      'Message.content 拆分为 text 和 data'
    ],
    deprecatedFields: ['MeetingContext.oldField'],
    newFields: ['Meeting.participants.user', 'MessageContent.data']
  }
];

/**
 * 版本路由器
 */
export class VersionRouter extends EventEmitter {
  private strictMode: boolean;
  private autoDowngrade: boolean;
  private breakingChangeHandler?: (version: number, message: any) => void;
  
  private stats = {
    routedCount: 0,
    downgradeCount: 0,
    rejectedCount: 0,
    warningCount: 0
  };
  
  private routeHandlers: Map<ContractVersion, (message: any) => Promise<any>> = new Map();
  
  constructor(options: VersionRouterOptions = {}) {
    super();
    
    this.strictMode = options.strictMode ?? false;
    this.autoDowngrade = options.autoDowngrade ?? true;
    this.breakingChangeHandler = options.breakingChangeHandler;
    
    // 注册默认路由处理器
    this._registerDefaultHandlers();
    
    console.log(`✅ VersionRouter 初始化完成`);
    console.log(`   当前版本: v${CURRENT_VERSION}`);
    console.log(`   支持版本: ${SUPPORTED_VERSIONS.map(v => `v${v}`).join(', ')}`);
    console.log(`   严格模式: ${this.strictMode ? '启用' : '禁用'}`);
    console.log(`   自动降级: ${this.autoDowngrade ? '启用' : '禁用'}`);
  }
  
  private _registerDefaultHandlers(): void {
    // v1 处理器
    this.routeHandlers.set(1, async (message) => {
      return this._handleV1(message);
    });
    
    // v2 处理器（向后兼容 v1）
    this.routeHandlers.set(2, async (message) => {
      return this._handleV2(message);
    });
    
    // v3 处理器（需要架构师审批）
    this.routeHandlers.set(3, async (message) => {
      return this._handleV3(message);
    });
  }
  
  /**
   * 检查版本兼容性
   * @param version 契约版本号
   * @returns VersionCheckResult 检查结果
   */
  checkVersion(version: number): VersionCheckResult {
    const warnings: string[] = [];
    const errors: string[] = [];
    
    // 版本不存在
    if (!SUPPORTED_VERSIONS.includes(version as ContractVersion)) {
      return {
        version: CURRENT_VERSION,
        compatibility: 'none',
        warnings: [],
        errors: [`不支持的版本: v${version}`],
        canProceed: false
      };
    }
    
    // 版本高于当前
    if (version > CURRENT_VERSION) {
      const changelog = VERSION_CHANGELOG.find(c => c.version === version);
      
      if (changelog && (changelog.breakingChanges?.length ?? 0) > 0) {
        errors.push(`版本 v${version} 包含 breaking changes，需要架构师审批`);
        warnings.push(...changelog.breakingChanges.map(c => `Breaking: ${c}`));
      } else {
        warnings.push(`版本 v${version} 高于当前 v${CURRENT_VERSION}，可能存在新特性未支持`);
      }
      
      const compatibility = (changelog?.breakingChanges?.length ?? 0) > 0 ? 'none' : 'partial';
      
      return {
        version: version as ContractVersion,
        compatibility,
        warnings,
        errors,
        canProceed: this.autoDowngrade && compatibility === 'partial',
        downgradeTo: CURRENT_VERSION
      };
    }
    
    // 版本低于当前（向后兼容）
    if (version < CURRENT_VERSION) {
      const changelog = VERSION_CHANGELOG.find(c => c.version === CURRENT_VERSION);
      
      if (changelog && changelog.deprecatedFields.length > 0) {
        warnings.push(...changelog.deprecatedFields.map(f => `已废弃字段: ${f}`));
      }
      
      return {
        version: version as ContractVersion,
        compatibility: 'full',
        warnings,
        errors: [],
        canProceed: true
      };
    }
    
    // 版本匹配
    return {
      version: CURRENT_VERSION,
      compatibility: 'full',
      warnings: [],
      errors: [],
      canProceed: true
    };
  }
  
  /**
   * 路由消息
   * @param message 包含 version 字段的消息
   * @returns Promise<any> 处理结果
   */
  async route<T = any>(message: { version: number } & Record<string, any>): Promise<T> {
    const checkResult = this.checkVersion(message.version);
    
    // 严格模式下拒绝非完全兼容
    if (this.strictMode && checkResult.compatibility !== 'full') {
      this.stats.rejectedCount++;
      this.emit('rejected', { message, checkResult });
      throw new Error(`版本不兼容 (严格模式): v${message.version}`);
    }
    
    // 无法处理
    if (!checkResult.canProceed) {
      this.stats.rejectedCount++;
      this.emit('rejected', { message, checkResult });
      throw new Error(`版本不兼容: v${message.version}`);
    }
    
    // 自动降级
    let targetVersion = checkResult.version;
    if (checkResult.downgradeTo && this.autoDowngrade) {
      targetVersion = checkResult.downgradeTo;
      this.stats.downgradeCount++;
      this.emit('downgraded', { 
        originalVersion: message.version, 
        targetVersion, 
        reason: checkResult.warnings.join('; ') 
      });
    }
    
    // 记录警告
    if (checkResult.warnings.length > 0) {
      this.stats.warningCount++;
      this.emit('warning', { version: message.version, warnings: checkResult.warnings });
    }
    
    // 执行路由
    const handler = this.routeHandlers.get(targetVersion);
    if (!handler) {
      throw new Error(`版本处理器不存在: v${targetVersion}`);
    }
    
    this.stats.routedCount++;
    this.emit('routed', { version: targetVersion, message });
    
    return handler(message) as Promise<T>;
  }
  
  /**
   * 注册自定义版本处理器
   * @param version 版本号
   * @param handler 处理函数
   */
  registerHandler(version: ContractVersion, handler: (message: any) => Promise<any>): void {
    if (!SUPPORTED_VERSIONS.includes(version)) {
      throw new Error(`不支持的版本: v${version}`);
    }
    
    this.routeHandlers.set(version, handler);
    this.emit('handlerRegistered', { version });
  }
  
  /**
   * 获取版本变更日志
   * @param version 版本号（可选）
   */
  getChangelog(version?: ContractVersion): VersionChangeLog[] {
    if (version) {
      const log = VERSION_CHANGELOG.find(c => c.version === version);
      return log ? [log] : [];
    }
    return VERSION_CHANGELOG;
  }
  
  /**
   * 获取统计信息
   */
  getStats(): Record<string, number> {
    return {
      ...this.stats,
      currentVersion: CURRENT_VERSION,
      supportedVersions: SUPPORTED_VERSIONS.length
    };
  }
  
  // ==================== 内部处理器 ====================
  
  private async _handleV1(message: any): Promise<any> {
    // v1 基础处理
    return { ...message, routedVersion: 1 };
  }
  
  private async _handleV2(message: any): Promise<any> {
    // v2 向后兼容 v1，添加新特性支持
    // 如果是 v1 消息，自动升级
    if (message.version === 1) {
      // 添加 v2 新字段默认值
      message = {
        ...message,
        // v2 新增字段
        heartbeatDue: message.heartbeatDue ?? 30000
      };
    }
    
    return { ...message, routedVersion: 2 };
  }
  
  private async _handleV3(message: any): Promise<any> {
    // v3 包含 breaking changes，需要架构师审批
    if (this.breakingChangeHandler) {
      this.breakingChangeHandler(3, message);
    }
    
    // 检查是否有 v3 breaking change 相关的字段
    if (message.participants && !message.participants.user) {
      message.participants.user = undefined; // v3 新增字段
    }
    
    if (message.content && typeof message.content === 'string') {
      // v3 breaking change: content 拆分为 text 和 data
      message.content = {
        text: message.content,
        data: undefined
      };
    }
    
    return { ...message, routedVersion: 3 };
  }
  
  /**
   * 获取当前版本
   */
  getCurrentVersion(): ContractVersion {
    return CURRENT_VERSION;
  }
  
  /**
   * 关闭版本路由器
   */
  async close(): Promise<void> {
    this.routeHandlers.clear();
    this.removeAllListeners();
    console.log('✅ VersionRouter 已关闭');
  }
}

export default VersionRouter;