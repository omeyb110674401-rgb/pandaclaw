/**
 * PandaClaw UI - 投票面板
 * 
 * 负责：前端专家 (cppcc-5)
 */

import React, { useMemo } from 'react';
import type { Decision, AgentParticipant, Vote } from '../types';
import { VOTE_LABELS } from '../types';

interface VotePanelProps {
  decisions: Decision[];
  npcParticipants: AgentParticipant[];
}

export const VotePanel: React.FC<VotePanelProps> = React.memo(
  ({ decisions, npcParticipants }) => {
    // 计算投票结果
    const voteResult = useMemo(() => {
      const result = { approve: 0, reject: 0, abstain: 0, total: 0 };
      
      npcParticipants.forEach((p) => {
        if (p.vote) {
          result[p.vote]++;
          result.total++;
        }
      });
      
      return result;
    }, [npcParticipants]);
    
    // 判断决议结果
    const isPassed = useMemo(() => {
      return voteResult.approve > voteResult.reject;
    }, [voteResult]);
    
    if (voteResult.total === 0) {
      return (
        <div className="vote-panel">
          <h3>🗳️ 投票进行中...</h3>
          <p>等待人大代表投票</p>
        </div>
      );
    }
    
    return (
      <div className="vote-panel">
        <h3>🗳️ 投票结果</h3>
        
        {/* 结果指示 */}
        <div className={`vote-summary ${isPassed ? 'passed' : 'rejected'}`}>
          <span className="vote-result-text">
            {isPassed ? '✅ 提案通过' : '❌ 提案未通过'}
          </span>
          <span className="vote-count">
            {voteResult.approve} 赞成 / {voteResult.reject} 反对 / {voteResult.abstain} 弃权
          </span>
        </div>
        
        {/* 投票条形图 */}
        <div className="vote-bars">
          <div className="vote-bar-container">
            <div
              className="vote-bar approve"
              style={{ width: `${(voteResult.approve / voteResult.total) * 100}%` }}
            />
            <span className="vote-bar-label">
              {VOTE_LABELS.approve}: {voteResult.approve}
            </span>
          </div>
          
          <div className="vote-bar-container">
            <div
              className="vote-bar reject"
              style={{ width: `${(voteResult.reject / voteResult.total) * 100}%` }}
            />
            <span className="vote-bar-label">
              {VOTE_LABELS.reject}: {voteResult.reject}
            </span>
          </div>
          
          <div className="vote-bar-container">
            <div
              className="vote-bar abstain"
              style={{ width: `${(voteResult.abstain / voteResult.total) * 100}%` }}
            />
            <span className="vote-bar-label">
              {VOTE_LABELS.abstain}: {voteResult.abstain}
            </span>
          </div>
        </div>
        
        {/* 投票详情 */}
        {decisions.length > 0 && (
          <div className="vote-details">
            <h4>决策内容</h4>
            <div className="decision-content">
              {decisions[decisions.length - 1].content}
            </div>
            <div className="decision-rationale">
              <strong>理由：</strong>
              {decisions[decisions.length - 1].rationale}
            </div>
          </div>
        )}
      </div>
    );
  }
);

VotePanel.displayName = 'VotePanel';