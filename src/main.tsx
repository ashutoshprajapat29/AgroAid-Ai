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

// Force unregister legacy service worker once to break any cached redirect loop
const SW_VERSION = "v2";
if (localStorage.getItem("sw_version") !== SW_VERSION) {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister();
        console.log("Legacy service worker unregistered to prevent routing loops.");
      }
      localStorage.setItem("sw_version", SW_VERSION);
    }).catch((err) => {
      console.error("Failed to unregister legacy service worker:", err);
    });
  } else {
    localStorage.setItem("sw_version", SW_VERSION);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
