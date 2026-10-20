import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.tsx';
import { initMonitoring, onUncaughtError } from './lib/monitoring';

initMonitoring();

createRoot(document.getElementById('root')!, { onUncaughtError }).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
