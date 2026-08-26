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
    strictMode?: boolean;
    autoDowngrade?: boolean;
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
/**
 * 版本路由器
 */
export declare class VersionRouter extends EventEmitter {
    private strictMode;
    private autoDowngrade;
    private breakingChangeHandler?;
    private stats;
    private routeHandlers;
    constructor(options?: VersionRouterOptions);
    private _registerDefaultHandlers;
    /**
     * 检查版本兼容性
     * @param version 契约版本号
     * @returns VersionCheckResult 检查结果
     */
    checkVersion(version: number): VersionCheckResult;
    /**
     * 路由消息
     * @param message 包含 version 字段的消息
     * @returns Promise<any> 处理结果
     */
    route<T = any>(message: {
        version: number;
    } & Record<string, any>): Promise<T>;
    /**
     * 注册自定义版本处理器
     * @param version 版本号
     * @param handler 处理函数
     */
    registerHandler(version: ContractVersion, handler: (message: any) => Promise<any>): void;
    /**
     * 获取版本变更日志
     * @param version 版本号（可选）
     */
    getChangelog(version?: ContractVersion): VersionChangeLog[];
    /**
     * 获取统计信息
     */
    getStats(): Record<string, number>;
    private _handleV1;
    private _handleV2;
    private _handleV3;
    /**
     * 获取当前版本
     */
    getCurrentVersion(): ContractVersion;
    /**
     * 关闭版本路由器
     */
    close(): Promise<void>;
}
export default VersionRouter;
//# sourceMappingURL=VersionRouter.d.ts.map