/**
 * PandaClaw UI - 步骤指示器
 * 
 * 负责：前端专家 (cppcc-5)
 */

import React from 'react';
import { STEP_LABELS, type MeetingStatus } from '../types';

interface StepIndicatorProps {
  currentStep: number;
  status: MeetingStatus;
}

const STEPS = [
  { key: 'step1-alignment', label: '目标对齐' },
  { key: 'step2-information', label: '信息共享' },
  { key: 'step3-roles', label: '角色分工' },
  { key: 'step4-coordination', label: '协调机制' },
  { key: 'step5-deliberation', label: '政协协商' },
  { key: 'step6-voting', label: '人大表决' },
  { key: 'step7-decision', label: '决策输出' },
];

export const StepIndicator: React.FC<StepIndicatorProps> = React.memo(
  ({ currentStep, status }) => {
    return (
      <div className="step-indicator">
        {STEPS.map((step, index) => {
          const stepNum = index + 1;
          const isCompleted = currentStep > stepNum;
          const isActive = currentStep === stepNum;
          
          return (
            <div
              key={step.key}
              className={`step-item ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}`}
            >
              <div className="step-number">
                {isCompleted ? '✓' : stepNum}
              </div>
              <div className="step-label">{step.label}</div>
            </div>
          );
        })}
      </div>
    );
  }
);

StepIndicator.displayName = 'StepIndicator';