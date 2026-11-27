import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';
import { DataProvider, UIProvider } from './store.jsx';
import Login from './screens/Login.jsx';

registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <UIProvider>
      <DataProvider login={<Login />}>
        <App />
      </DataProvider>
    </UIProvider>
  </React.StrictMode>
);
