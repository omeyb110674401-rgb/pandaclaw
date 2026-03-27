/**
 * PandaClaw UI - 根组件
 * 
 * 负责：前端专家 (cppcc-5)
 */

import React from 'react';
import { MeetingDashboard } from './components/MeetingDashboard';
import { useMeetingStore } from './store/meetingStore';

const App: React.FC = () => {
  const { currentMeeting } = useMeetingStore();

  return (
    <div className="app">
      <header className="app-header">
        <h1>🐼 PandaClaw</h1>
        <p>民主协商决策系统</p>
      </header>
      <main className="app-main">
        {currentMeeting ? (
          <MeetingDashboard meeting={currentMeeting} />
        ) : (
          <div className="no-meeting">
            <p>暂无进行中的会议</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;