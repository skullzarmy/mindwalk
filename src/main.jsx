import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/main.css';
// Load Inter font weights used by the Canvas share-image generator
import '@fontsource/inter/400.css';
import '@fontsource/inter/700.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
