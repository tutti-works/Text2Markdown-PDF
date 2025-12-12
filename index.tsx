import React from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Get Client ID from environment variables
const clientId = process.env.GOOGLE_CLIENT_ID || '';

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {clientId ? (
      <GoogleOAuthProvider clientId={clientId}>
        <App />
      </GoogleOAuthProvider>
    ) : (
      <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
        <h1>Configuration Error</h1>
        <p>Google Client ID is missing. Please set GOOGLE_CLIENT_ID in your environment variables.</p>
      </div>
    )}
  </React.StrictMode>
);