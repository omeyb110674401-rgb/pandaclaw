/**
 * PandaClaw UI - 会议仪表盘
 * 
 * 负责：前端专家 (cppcc-5)
 * 验收标准：UI响应时间 < 100ms
 */

import React, { useMemo } from 'react';
import type { Meeting } from '../types';
import { StepIndicator } from './StepIndicator';
import { ParticipantsPanel } from './ParticipantsPanel';
import { VotePanel } from './VotePanel';
import { LiveIndicator } from './LiveIndicator';
import { useWebSocket } from '../hooks/useWebSocket';

interface MeetingDashboardProps {
  meeting: Meeting;
}

export const MeetingDashboard: React.FC<MeetingDashboardProps> = React.memo(
  ({ meeting }) => {
    // WebSocket 实时同步
    const { isConnected } = useWebSocket({
      url: `ws://${window.location.host}/ws/meeting/${meeting.id}`,
    });
    
    // 缓存计算结果，确保响应时间 < 100ms
    const currentStep = useMemo(() => {
      const stepMap: Record<string, number> = {
        'pending': 0,
        'step1-alignment': 1,
        'step2-information': 2,
        'step3-roles': 3,
        'step4-coordination': 4,
        'step5-deliberation': 5,
        'step6-voting': 6,
        'step7-decision': 7,
        'completed': 8,
      };
      return stepMap[meeting.status] || 0;
    }, [meeting.status]);
    
    const showVotePanel = useMemo(() => {
      return meeting.status === 'step6-voting' || meeting.status === 'step7-decision';
    }, [meeting.status]);
    
    return (
      <div className="meeting-dashboard">
        {/* 标题栏 */}
        <div className="dashboard-header">
          <div className="meeting-info">
            <h2>{meeting.topic}</h2>
            <span className="meeting-type">{meeting.type}</span>
          </div>
          <LiveIndicator isConnected={isConnected} />
        </div>
        
        {/* 步骤指示器 */}
        <StepIndicator currentStep={currentStep} status={meeting.status} />
        
        {/* 参与者面板 */}
        <ParticipantsPanel
          cppcc={meeting.participants.cppcc}
          npc={meeting.participants.npc}
        />
        
        {/* 投票面板（仅在表决阶段显示） */}
        {showVotePanel && (
          <VotePanel
            decisions={meeting.decisions}
            npcParticipants={meeting.participants.npc}
          />
        )}
        
        {/* 上下文信息 */}
        <div className="context-panel">
          <h3>会议背景</h3>
          <p>{meeting.context.background}</p>
          
          {meeting.context.constraints.length > 0 && (
            <>
              <h4>约束条件</h4>
              <ul>
                {meeting.context.constraints.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </>
          )}
          
          {meeting.context.successCriteria.length > 0 && (
            <>
              <h4>成功标准</h4>
              <ul>
                {meeting.context.successCriteria.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    );
  }
);

MeetingDashboard.displayName = 'MeetingDashboard';