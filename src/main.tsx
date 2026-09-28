import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('A #root elem nem található.');

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
