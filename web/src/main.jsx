import React from 'react';
import ReactDOM from 'react-dom/client';
// self-hosted: the app runs on a home server with no internet guarantee, so no CDN
import '@fontsource-variable/archivo';
import '@fontsource/archivo-black';
import '@fontsource-variable/inter';
import '@fontsource-variable/bodoni-moda';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
