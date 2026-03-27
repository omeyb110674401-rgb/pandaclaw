/**
 * PandaClaw UI - 参与者面板
 * 
 * 负责：前端专家 (cppcc-5)
 */

import React from 'react';
import type { AgentParticipant, Stance, Vote } from '../types';
import { STANCE_LABELS, VOTE_LABELS } from '../types';

interface ParticipantsPanelProps {
  cppcc: AgentParticipant[];
  npc: AgentParticipant[];
}

export const ParticipantsPanel: React.FC<ParticipantsPanelProps> = React.memo(
  ({ cppcc, npc }) => {
    return (
      <div className="participants-panel">
        {/* 政协委员 */}
        <div className="participant-group">
          <h3>🏛️ 政协委员（协商建议）</h3>
          <div className="participant-list">
            {cppcc.map((participant) => (
              <ParticipantItem
                key={participant.id}
                participant={participant}
                type="cppcc"
              />
            ))}
          </div>
        </div>
        
        {/* 人大代表 */}
        <div className="participant-group">
          <h3>⚖️ 人大代表（审议决策）</h3>
          <div className="participant-list">
            {npc.map((participant) => (
              <ParticipantItem
                key={participant.id}
                participant={participant}
                type="npc"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }
);

interface ParticipantItemProps {
  participant: AgentParticipant;
  type: 'cppcc' | 'npc';
}

const ParticipantItem: React.FC<ParticipantItemProps> = React.memo(
  ({ participant, type }) => {
    const statusBadge = type === 'cppcc' && participant.stance
      ? STANCE_LABELS[participant.stance]
      : type === 'npc' && participant.vote
      ? VOTE_LABELS[participant.vote]
      : null;
    
    const statusClass = statusBadge ? `status-${participant.stance || participant.vote}` : '';
    
    return (
      <div className="participant-item">
        <div className="participant-avatar">
          {participant.id.split('-')[1]}
        </div>
        <div className="participant-info">
          <div className="participant-name">{participant.id}</div>
          <div className="participant-expertise">{participant.expertise}</div>
        </div>
        {statusBadge && (
          <span className={`participant-status ${statusClass}`}>
            {statusBadge}
          </span>
        )}
      </div>
    );
  }
);

ParticipantsPanel.displayName = 'ParticipantsPanel';
ParticipantItem.displayName = 'ParticipantItem';