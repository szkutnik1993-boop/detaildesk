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
import InstallGuide from './screens/InstallGuide.jsx';
import { useRoute } from './router.js';

registerSW({ immediate: true });

// natywny monit instalacji (Android: Chrome, Samsung Internet; komputer: Chrome, Edge) – pokazujemy własny przycisk
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__ddInstallPrompt = e;
  window.dispatchEvent(new Event('dd-install-available'));
});
window.addEventListener('appinstalled', () => {
  window.__ddInstallPrompt = null;
});

// bez logowania dostępna jest tylko instrukcja instalacji (link z e-maila powitalnego)
function LoginGate() {
  const route = useRoute();
  return route.parts[0] === 'instalacja' ? <InstallGuide /> : <Login />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <UIProvider>
      <DataProvider login={<LoginGate />}>
        <App />
      </DataProvider>
    </UIProvider>
  </React.StrictMode>
);
