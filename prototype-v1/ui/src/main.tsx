/**
 * PandaClaw UI - 入口文件
 * 
 * 负责：前端专家 (cppcc-5)
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);