/**
 * StateManager - 状态管理器（符合契约 v1）
 * @author cppcc-2 (后端专家)
 * @version 2.0.0 - 契约合规版
 * @contract contracts/api.ts
 * 
 * 功能：
 * - SQLite 持久化存储
 * - WAL 写前日志
 * - StateSnapshot checksum验证
 * - 时间戳使用毫秒格式
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

/** 契约版本号 */
const CONTRACT_VERSION = 1;

class StateManager {
  constructor(options = {}) {
    this.dbPath = options.dbPath || path.join(process.cwd(), 'data', 'pandaclaw.db');
    this.walEnabled = options.walEnabled !== false;
    this.db = null;
    this.isInitialized = false;
    this.cache = new Map();
    this.cacheTTL = 30000;
  }
  
  initialize() {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    this.db = new Database(this.dbPath);
    
    if (this.walEnabled) {
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
    }
    
    this._createTables();
    this.isInitialized = true;
    
    console.log('✅ StateManager 初始化完成 (契约 v1)');
    return this;
  }
  
  _createTables() {
    // 会议表（符合 Meeting 接口）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meetings (
        id TEXT PRIMARY KEY,
        version INTEGER DEFAULT ${CONTRACT_VERSION},
        topic TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        participants TEXT,
        context TEXT,
        decisions TEXT
      )
    `);
    
    // 状态快照表（符合 StateSnapshot 接口）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS state_snapshots (
        id TEXT PRIMARY KEY,
        meeting_id TEXT NOT NULL,
        step INTEGER NOT NULL,
        data TEXT,
        checksum TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (meeting_id) REFERENCES meetings(id)
      )
    `);
    
    // 检查点表（符合 Checkpoint 接口）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY,
        meeting_id TEXT NOT NULL,
        snapshot_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (meeting_id) REFERENCES meetings(id),
        FOREIGN KEY (snapshot_id) REFERENCES state_snapshots(id)
      )
    `);
    
    // Agent状态表（符合 AgentStatus 接口）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_status (
        id TEXT PRIMARY KEY,
        expertise TEXT,
        status TEXT DEFAULT 'idle',
        last_heartbeat INTEGER,
        current_task TEXT
      )
    `);
    
    // 创建索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);
      CREATE INDEX IF NOT EXISTS idx_snapshots_meeting ON state_snapshots(meeting_id);
    `);
  }
  
  // ==================== 会议管理（符合 Meeting 接口）====================
  
  /**
   * 创建会议
   * @param {Object} data 会议数据
   * @returns {Meeting} 符合契约的会议对象
   */
  createMeeting(data) {
    const id = data.id || uuidv4();
    const now = Date.now(); // 毫秒时间戳
    
    const meeting = {
      id,
      version: CONTRACT_VERSION,
      topic: data.topic,
      type: data.type || 'proposal-review',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      participants: data.participants || { cppcc: [], npc: [] },
      context: data.context || {
        background: '',
        history: [],
        constraints: [],
        successCriteria: []
      },
      decisions: []
    };
    
    const stmt = this.db.prepare(`
      INSERT INTO meetings (id, version, topic, type, status, created_at, updated_at, participants, context, decisions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      meeting.id,
      meeting.version,
      meeting.topic,
      meeting.type,
      meeting.status,
      meeting.createdAt,
      meeting.updatedAt,
      JSON.stringify(meeting.participants),
      JSON.stringify(meeting.context),
      JSON.stringify(meeting.decisions)
    );
    
    this.cache.set(id, meeting);
    return meeting;
  }
  
  /**
   * 获取会议
   * @param {string} meetingId 会议ID
   * @returns {Meeting|null} 符合契约的会议对象
   */
  getMeeting(meetingId) {
    const cached = this.cache.get(meetingId);
    if (cached && Date.now() - cached.updatedAt < this.cacheTTL) {
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
   * 更新会议状态（符合 MeetingStatus）
   * @param {string} meetingId 会议ID
   * @param {MeetingStatus} status 新状态
   */
  updateMeetingStatus(meetingId, status) {
    const validStatuses = [
      'pending', 'step1-alignment', 'step2-information', 'step3-roles',
      'step4-coordination', 'step5-deliberation', 'step6-voting',
      'step7-decision', 'completed', 'cancelled'
    ];
    
    if (!validStatuses.includes(status)) {
      throw new Error(`无效状态: ${status}`);
    }
    
    const now = Date.now();
    const stmt = this.db.prepare(`
      UPDATE meetings SET status = ?, updated_at = ? WHERE id = ?
    `);
    
    stmt.run(status, now, meetingId);
    
    const meeting = this.getMeeting(meetingId);
    if (meeting) {
      meeting.status = status;
      meeting.updatedAt = now;
      this.cache.set(meetingId, meeting);
    }
    
    return meeting;
  }
  
  /**
   * 记录决策（符合 Decision 接口）
   * @param {string} meetingId 会议ID
   * @param {Decision} decision 决策对象
   */
  recordDecision(meetingId, decision) {
    const meeting = this.getMeeting(meetingId);
    if (!meeting) throw new Error(`会议不存在: ${meetingId}`);
    
    const decisionRecord = {
      id: decision.id || uuidv4(),
      content: decision.content,
      rationale: decision.rationale,
      timestamp: Date.now(),
      votes: decision.votes || []
    };
    
    meeting.decisions.push(decisionRecord);
    meeting.updatedAt = Date.now();
    
    const stmt = this.db.prepare(`
      UPDATE meetings SET decisions = ?, updated_at = ? WHERE id = ?
    `);
    
    stmt.run(JSON.stringify(meeting.decisions), meeting.updatedAt, meetingId);
    this.cache.set(meetingId, meeting);
    
    return decisionRecord;
  }
  
  // ==================== 状态快照（符合 StateSnapshot 接口）====================
  
  /**
   * 创建状态快照
   * @param {string} meetingId 会议ID
   * @param {number} step 步骤号
   * @param {Object} data 快照数据
   * @returns {StateSnapshot} 符合契约的快照对象
   */
  createSnapshot(meetingId, step, data) {
    const id = uuidv4();
    const timestamp = Date.now();
    const checksum = this._computeChecksum({ meetingId, step, data, timestamp });
    
    const snapshot = {
      id,
      meetingId,
      step,
      data,
      checksum,
      timestamp
    };
    
    const stmt = this.db.prepare(`
      INSERT INTO state_snapshots (id, meeting_id, step, data, checksum, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(id, meetingId, step, JSON.stringify(data), checksum, timestamp);
    
    return snapshot;
  }
  
  /**
   * 获取最新快照
   * @param {string} meetingId 会议ID
   * @returns {StateSnapshot|null} 符合契约的快照对象
   */
  getLatestSnapshot(meetingId) {
    const stmt = this.db.prepare(`
      SELECT * FROM state_snapshots WHERE meeting_id = ? ORDER BY timestamp DESC LIMIT 1
    `);
    
    const row = stmt.get(meetingId);
    if (!row) return null;
    
    return {
      id: row.id,
      meetingId: row.meeting_id,
      step: row.step,
      data: JSON.parse(row.data || '{}'),
      checksum: row.checksum,
      timestamp: row.timestamp
    };
  }
  
  /**
   * 验证快照checksum
   * @param {StateSnapshot} snapshot 快照对象
   * @returns {boolean} 是否有效
   */
  verifySnapshot(snapshot) {
    const computed = this._computeChecksum({
      meetingId: snapshot.meetingId,
      step: snapshot.step,
      data: snapshot.data,
      timestamp: snapshot.timestamp
    });
    return computed === snapshot.checksum;
  }
  
  // ==================== Agent状态（符合 AgentStatus 接口）====================
  
  /**
   * 更新Agent心跳
   * @param {HeartbeatRequest} request 心跳请求
   * @returns {AgentStatus} Agent状态
   */
  heartbeat(request) {
    const now = Date.now();
    
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO agent_status (id, expertise, status, last_heartbeat, current_task)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run(request.agentId, request.expertise || '', request.status, now, request.currentTask || null);
    
    return {
      id: request.agentId,
      expertise: request.expertise || '',
      status: request.status,
      lastHeartbeat: now,
      currentTask: request.currentTask
    };
  }
  
  /**
   * 获取活跃Agent列表
   * @param {number} threshold 阈值（毫秒）
   * @returns {AgentStatus[]} Agent状态列表
   */
  getActiveAgents(threshold = 120000) {
    const now = Date.now();
    const stmt = this.db.prepare(`
      SELECT * FROM agent_status WHERE last_heartbeat > ?
    `);
    
    return stmt.all(now - threshold).map(row => ({
      id: row.id,
      expertise: row.expertise,
      status: row.status,
      lastHeartbeat: row.last_heartbeat,
      currentTask: row.current_task
    }));
  }
  
  // ==================== 工具方法 ====================
  
  _rowToMeeting(row) {
    return {
      id: row.id,
      version: row.version,
      topic: row.topic,
      type: row.type,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      participants: JSON.parse(row.participants || '{"cppcc":[],"npc":[]}'),
      context: JSON.parse(row.context || '{"background":"","history":[],"constraints":[],"successCriteria":[]}'),
      decisions: JSON.parse(row.decisions || '[]')
    };
  }
  
  _computeChecksum(data) {
    const content = JSON.stringify(data);
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }
  
  /**
   * 获取统计信息（符合 HealthCheckResponse.metrics）
   */
  getStats() {
    return {
      meetings: this.db.prepare('SELECT COUNT(*) as count FROM meetings').get().count,
      snapshots: this.db.prepare('SELECT COUNT(*) as count FROM state_snapshots').get().count,
      agents: this.db.prepare('SELECT COUNT(*) as count FROM agent_status').get().count,
      cacheSize: this.cache.size
    };
  }
  
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.cache.clear();
  }
}

module.exports = { StateManager, CONTRACT_VERSION };