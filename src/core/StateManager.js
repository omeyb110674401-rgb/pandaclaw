/**
 * StateManager - 状态管理器（带 WAL 支持）
 * @author cppcc-2 (后端专家)
 * @version 1.0.0
 * 
 * 功能：
 * - SQLite 持久化存储
 * - WAL 写前日志
 * - 原子写入保证
 * - 快速状态恢复
 * 
 * 验收标准：
 * - 状态恢复 < 30s
 * - 零数据丢失
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

class StateManager {
  /**
   * 创建状态管理器
   * @param {Object} options 配置选项
   * @param {string} options.dbPath 数据库路径
   * @param {boolean} options.walEnabled 启用 WAL 模式
   */
  constructor(options = {}) {
    this.dbPath = options.dbPath || path.join(process.cwd(), 'data', 'pandaclaw.db');
    this.walEnabled = options.walEnabled !== false;
    this.db = null;
    this.isInitialized = false;
    
    // 写入队列（确保顺序写入）
    this.writeQueue = [];
    this.isWriting = false;
    
    // 缓存层
    this.cache = new Map();
    this.cacheTTL = 30000; // 30秒缓存
  }
  
  /**
   * 初始化数据库
   */
  initialize() {
    // 确保目录存在
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // 创建数据库连接
    this.db = new Database(this.dbPath);
    
    // 启用 WAL 模式
    if (this.walEnabled) {
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('wal_autocheckpoint = 1000');
    }
    
    // 创建表结构
    this._createTables();
    
    this.isInitialized = true;
    console.log('✅ StateManager 初始化完成');
    console.log(`   数据库路径: ${this.dbPath}`);
    console.log(`   WAL 模式: ${this.walEnabled ? '已启用' : '未启用'}`);
    
    return this;
  }
  
  /**
   * 创建数据库表
   */
  _createTables() {
    // 会议状态表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meetings (
        id TEXT PRIMARY KEY,
        meeting_type TEXT NOT NULL,
        topic TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'pending',
        current_stage TEXT,
        current_stage_index INTEGER DEFAULT -1,
        participants TEXT,
        expertise_bindings TEXT,
        stage_results TEXT,
        opinions TEXT,
        votes TEXT,
        inquiries TEXT,
        inquiry_responses TEXT,
        final_decision TEXT,
        created_at TEXT,
        updated_at TEXT,
        completed_at TEXT
      )
    `);
    
    // 消息日志表（用于恢复和审计）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS message_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meeting_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        direction TEXT NOT NULL,
        sender TEXT,
        receiver TEXT,
        content TEXT,
        status TEXT DEFAULT 'pending',
        created_at TEXT,
        delivered_at TEXT,
        FOREIGN KEY (meeting_id) REFERENCES meetings(id)
      )
    `);
    
    // 操作日志表（WAL）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS operation_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meeting_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        data TEXT,
        version INTEGER DEFAULT 1,
        created_at TEXT,
        UNIQUE(meeting_id, version)
      )
    `);
    
    // Agent 状态表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_states (
        agent_id TEXT PRIMARY KEY,
        session_key TEXT,
        expertise_id TEXT,
        expertise_name TEXT,
        status TEXT DEFAULT 'idle',
        current_meeting_id TEXT,
        last_heartbeat TEXT,
        created_at TEXT,
        updated_at TEXT
      )
    `);
    
    // 创建索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);
      CREATE INDEX IF NOT EXISTS idx_message_log_meeting ON message_log(meeting_id);
      CREATE INDEX IF NOT EXISTS idx_operation_log_meeting ON operation_log(meeting_id);
    `);
  }
  
  // ==================== 会议状态管理 ====================
  
  /**
   * 创建会议
   * @param {Object} meetingData 会议数据
   */
  createMeeting(meetingData) {
    const id = meetingData.id || uuidv4();
    const now = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      INSERT INTO meetings (
        id, meeting_type, topic, description, status, 
        current_stage, current_stage_index, participants, expertise_bindings,
        stage_results, opinions, votes, inquiries, inquiry_responses,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id,
      meetingData.meetingType || 'CONSULTATION',
      meetingData.topic,
      meetingData.description || '',
      'pending',
      null,
      -1,
      JSON.stringify(meetingData.participants || { cppcc: [], npc: [] }),
      JSON.stringify(meetingData.expertiseBindings || {}),
      JSON.stringify({}),
      JSON.stringify({}),
      JSON.stringify({}),
      JSON.stringify({}),
      JSON.stringify({}),
      now,
      now
    );
    
    // 记录操作日志
    this._logOperation(id, 'CREATE_MEETING', meetingData);
    
    // 更新缓存
    this.cache.set(id, { ...meetingData, id, status: 'pending', createdAt: now });
    
    return this.getMeeting(id);
  }
  
  /**
   * 获取会议
   * @param {string} meetingId 会议ID
   */
  getMeeting(meetingId) {
    // 先查缓存
    const cached = this.cache.get(meetingId);
    if (cached && Date.now() - new Date(cached.updatedAt).getTime() < this.cacheTTL) {
      return cached;
    }
    
    const stmt = this.db.prepare('SELECT * FROM meetings WHERE id = ?');
    const row = stmt.get(meetingId);
    
    if (!row) return null;
    
    const meeting = this._rowToMeeting(row);
    this.cache.set(meetingId, meeting);
    
    return meeting;
  }
  
  /**
   * 更新会议状态
   * @param {string} meetingId 会议ID
   * @param {Object} updates 更新内容
   */
  updateMeeting(meetingId, updates) {
    const meeting = this.getMeeting(meetingId);
    if (!meeting) {
      throw new Error(`会议不存在: ${meetingId}`);
    }
    
    const now = new Date().toISOString();
    const fields = [];
    const values = [];
    
    // 构建更新字段
    for (const [key, value] of Object.entries(updates)) {
      if (this._isJsonField(key)) {
        fields.push(`${this._camelToSnake(key)} = ?`);
        values.push(JSON.stringify(value));
      } else if (['status', 'currentStage', 'currentStageIndex', 'finalDecision', 'completedAt'].includes(key)) {
        fields.push(`${this._camelToSnake(key)} = ?`);
        values.push(value);
      }
    }
    
    if (fields.length === 0) return meeting;
    
    fields.push('updated_at = ?');
    values.push(now);
    values.push(meetingId);
    
    const stmt = this.db.prepare(`
      UPDATE meetings SET ${fields.join(', ')} WHERE id = ?
    `);
    
    stmt.run(...values);
    
    // 记录操作日志
    this._logOperation(meetingId, 'UPDATE_MEETING', updates);
    
    // 更新缓存
    const updated = { ...meeting, ...updates, updatedAt: now };
    this.cache.set(meetingId, updated);
    
    return updated;
  }
  
  /**
   * 列出会议
   * @param {Object} filters 过滤条件
   */
  listMeetings(filters = {}) {
    let sql = 'SELECT * FROM meetings WHERE 1=1';
    const params = [];
    
    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }
    
    if (filters.meetingType) {
      sql += ' AND meeting_type = ?';
      params.push(filters.meetingType);
    }
    
    sql += ' ORDER BY created_at DESC';
    
    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }
    
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params);
    
    return rows.map(row => this._rowToMeeting(row));
  }
  
  // ==================== 消息日志 ====================
  
  /**
   * 记录消息
   * @param {Object} message 消息对象
   */
  logMessage(message) {
    const messageId = message.messageId || uuidv4();
    
    const stmt = this.db.prepare(`
      INSERT INTO message_log (
        meeting_id, message_id, direction, sender, receiver, content, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      message.meetingId,
      messageId,
      message.direction,
      message.sender,
      message.receiver,
      JSON.stringify(message.content),
      'pending',
      new Date().toISOString()
    );
    
    return messageId;
  }
  
  /**
   * 更新消息状态
   * @param {string} messageId 消息ID
   * @param {string} status 新状态
   */
  updateMessageStatus(messageId, status) {
    const stmt = this.db.prepare(`
      UPDATE message_log SET status = ?, delivered_at = ? WHERE message_id = ?
    `);
    
    stmt.run(status, status === 'delivered' ? new Date().toISOString() : null, messageId);
  }
  
  /**
   * 获取会议消息历史
   * @param {string} meetingId 会议ID
   */
  getMessageHistory(meetingId) {
    const stmt = this.db.prepare(`
      SELECT * FROM message_log WHERE meeting_id = ? ORDER BY created_at ASC
    `);
    
    return stmt.all(meetingId).map(row => ({
      ...row,
      content: JSON.parse(row.content || '{}')
    }));
  }
  
  // ==================== Agent 状态管理 ====================
  
  /**
   * 注册 Agent
   * @param {string} agentId Agent ID
   * @param {Object} data Agent 数据
   */
  registerAgent(agentId, data = {}) {
    const now = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO agent_states (
        agent_id, session_key, expertise_id, expertise_name, status, 
        current_meeting_id, last_heartbeat, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      agentId,
      data.sessionKey || `agent:${agentId}:main`,
      data.expertiseId || null,
      data.expertiseName || null,
      data.status || 'idle',
      data.currentMeetingId || null,
      now,
      now,
      now
    );
    
    return this.getAgent(agentId);
  }
  
  /**
   * 获取 Agent 状态
   * @param {string} agentId Agent ID
   */
  getAgent(agentId) {
    const stmt = this.db.prepare('SELECT * FROM agent_states WHERE agent_id = ?');
    const row = stmt.get(agentId);
    
    if (!row) return null;
    
    return {
      agentId: row.agent_id,
      sessionKey: row.session_key,
      expertiseId: row.expertise_id,
      expertiseName: row.expertise_name,
      status: row.status,
      currentMeetingId: row.current_meeting_id,
      lastHeartbeat: row.last_heartbeat,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
  
  /**
   * 更新 Agent 心跳
   * @param {string} agentId Agent ID
   */
  heartbeat(agentId) {
    const stmt = this.db.prepare(`
      UPDATE agent_states SET last_heartbeat = ?, updated_at = ? WHERE agent_id = ?
    `);
    
    const now = new Date().toISOString();
    stmt.run(now, now, agentId);
    
    return this.getAgent(agentId);
  }
  
  // ==================== 操作日志（WAL）====================
  
  /**
   * 记录操作日志
   */
  _logOperation(meetingId, operation, data) {
    // 获取当前版本
    const versionStmt = this.db.prepare(`
      SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM operation_log WHERE meeting_id = ?
    `);
    const { next_version } = versionStmt.get(meetingId);
    
    const stmt = this.db.prepare(`
      INSERT INTO operation_log (meeting_id, operation, data, version, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run(meetingId, operation, JSON.stringify(data), next_version, new Date().toISOString());
  }
  
  /**
   * 获取操作日志
   * @param {string} meetingId 会议ID
   * @param {number} fromVersion 起始版本
   */
  getOperationLog(meetingId, fromVersion = 0) {
    const stmt = this.db.prepare(`
      SELECT * FROM operation_log 
      WHERE meeting_id = ? AND version > ?
      ORDER BY version ASC
    `);
    
    return stmt.all(meetingId, fromVersion).map(row => ({
      ...row,
      data: JSON.parse(row.data || '{}')
    }));
  }
  
  // ==================== 工具方法 ====================
  
  /**
   * 数据库行转会议对象
   */
  _rowToMeeting(row) {
    return {
      id: row.id,
      meetingType: row.meeting_type,
      topic: row.topic,
      description: row.description,
      status: row.status,
      currentStage: row.current_stage,
      currentStageIndex: row.current_stage_index,
      participants: JSON.parse(row.participants || '{}'),
      expertiseBindings: JSON.parse(row.expertise_bindings || '{}'),
      stageResults: JSON.parse(row.stage_results || '{}'),
      opinions: JSON.parse(row.opinions || '{}'),
      votes: JSON.parse(row.votes || '{}'),
      inquiries: JSON.parse(row.inquiries || '{}'),
      inquiryResponses: JSON.parse(row.inquiry_responses || '{}'),
      finalDecision: row.final_decision,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at
    };
  }
  
  /**
   * 判断是否为 JSON 字段
   */
  _isJsonField(key) {
    const jsonFields = [
      'participants', 'expertiseBindings', 'stageResults',
      'opinions', 'votes', 'inquiries', 'inquiryResponses'
    ];
    return jsonFields.includes(key);
  }
  
  /**
   * 驼峰转下划线
   */
  _camelToSnake(str) {
    return str.replace(/([A-Z])/g, '_$1').toLowerCase();
  }
  
  /**
   * 关闭数据库连接
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
    }
    this.cache.clear();
  }
  
  /**
   * 获取统计信息
   */
  getStats() {
    const stats = {
      meetings: this.db.prepare('SELECT COUNT(*) as count FROM meetings').get().count,
      messages: this.db.prepare('SELECT COUNT(*) as count FROM message_log').get().count,
      agents: this.db.prepare('SELECT COUNT(*) as count FROM agent_states').get().count,
      cacheSize: this.cache.size
    };
    
    return stats;
  }
}

module.exports = { StateManager };