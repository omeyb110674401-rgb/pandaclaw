/**
 * PandaClaw UI - 实时状态指示
 * 
 * 负责：前端专家 (cppcc-5)
 */

import React from 'react';

interface LiveIndicatorProps {
  isConnected: boolean;
}

export const LiveIndicator: React.FC<LiveIndicatorProps> = React.memo(
  ({ isConnected }) => {
    return (
      <div className={`live-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
        <span className={`live-dot ${isConnected ? 'active' : 'inactive'}`} />
        <span className="live-text">
          {isConnected ? '实时同步中' : '连接断开'}
        </span>
      </div>
    );
  }
);

LiveIndicator.displayName = 'LiveIndicator';