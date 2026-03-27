/**
 * PandaClaw UI - WebSocket 实时连接
 * 
 * 负责：前端专家 (cppcc-5)
 * 功能：会议状态实时同步
 */

import { useEffect, useRef, useCallback } from 'react';
import { useMeetingStore } from '../store/meetingStore';
import type { WSMessage, Meeting, StateSnapshot, AgentState } from '../types';

interface UseWebSocketOptions {
  url: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export function useWebSocket(options: UseWebSocketOptions) {
  const {
    url,
    reconnectInterval = 3000,
    maxReconnectAttempts = 5,
  } = options;
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const {
    setMeeting,
    setStateSnapshot,
    updateAgentState,
    setConnected,
  } = useMeetingStore();
  
  // 处理消息
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: WSMessage = JSON.parse(event.data);
      
      switch (message.type) {
        case 'state:update':
          const meeting = message.payload as Meeting;
          setMeeting(meeting);
          break;
          
        case 'meeting:event':
          // 处理会议事件
          const eventPayload = message.payload as { type: string; data: unknown };
          if (eventPayload.type === 'state:updated') {
            const snapshot = eventPayload.data as StateSnapshot;
            setStateSnapshot(snapshot);
          }
          break;
          
        case 'agent:status':
          const agentState = message.payload as AgentState;
          updateAgentState(agentState.id, agentState);
          break;
          
        case 'step:change':
          // 步骤变更，请求完整状态
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'fetch:state' }));
          }
          break;
      }
    } catch (error) {
      console.error('WebSocket message parse error:', error);
    }
  }, [setMeeting, setStateSnapshot, updateAgentState]);
  
  // 连接 WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }
    
    const ws = new WebSocket(url);
    wsRef.current = ws;
    
    ws.onopen = () => {
      console.log('[WebSocket] Connected');
      setConnected(true);
      reconnectAttemptsRef.current = 0;
      
      // 请求初始状态
      ws.send(JSON.stringify({ type: 'fetch:state' }));
    };
    
    ws.onmessage = handleMessage;
    
    ws.onerror = (error) => {
      console.error('[WebSocket] Error:', error);
    };
    
    ws.onclose = () => {
      console.log('[WebSocket] Disconnected');
      setConnected(false);
      
      // 自动重连
      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current++;
        console.log(`[WebSocket] Reconnecting... (${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, reconnectInterval);
      }
    };
  }, [url, handleMessage, setConnected, reconnectInterval, maxReconnectAttempts]);
  
  // 断开连接
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);
  
  // 发送消息
  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);
  
  // 生命周期
  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);
  
  return {
    isConnected: useMeetingStore((s) => s.isConnected),
    send,
    connect,
    disconnect,
  };
}