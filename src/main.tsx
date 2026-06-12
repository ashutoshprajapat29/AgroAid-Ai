import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import './index.css';

// Global error handlers for background asynchronous exceptions
window.addEventListener("unhandledrejection", (event) => {
  console.error("Global captured unhandled promise rejection:", event.reason);
});
window.addEventListener("error", (event) => {
  console.error("Global captured unhandled runtime error:", event.error);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
