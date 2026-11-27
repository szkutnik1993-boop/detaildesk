// Rozpoznanie urządzenia i przeglądarki – do instrukcji „Dodaj DetailDesk do ekranu telefonu”.
// Tylko dla aplikacji studia (klienci studiów korzystają z linków w e-mailach, bez instalacji).

export function detectPlatform(ua = '', { maxTouchPoints = 0 } = {}) {
  const iPadOS = /Macintosh/.test(ua) && maxTouchPoints > 1; // iPad udaje komputer Mac
  const ios = /iPhone|iPad|iPod/.test(ua) || iPadOS;
  const android = /Android/.test(ua);
  let browser = 'other';
  if (ios) {
    if (/CriOS\//.test(ua)) browser = 'chrome';
    else if (/FxiOS\//.test(ua)) browser = 'firefox';
    else if (/EdgiOS\//.test(ua)) browser = 'edge';
    else if (/GSA\//.test(ua)) browser = 'google';
    else if (/FBAN|FBAV|Instagram|Line\/|GoogleGmail|Gmail/.test(ua)) browser = 'inapp';
    else if (/Version\/[\d.]+.*Safari\//.test(ua)) browser = 'safari';
    else browser = 'inapp'; // wbudowana przeglądarka aplikacji (np. Gmail) – bez „Safari/” w nazwie
  } else if (android) {
    if (/SamsungBrowser\//.test(ua)) browser = 'samsung';
    else if (/Firefox\//.test(ua)) browser = 'firefox';
    else if (/EdgA\//.test(ua)) browser = 'edge';
    else if (/; wv\)/.test(ua) || /GoogleGmail|Gmail|FBAN|Instagram/.test(ua)) browser = 'inapp';
    else if (/Chrome\//.test(ua)) browser = 'chrome';
  } else {
    if (/Edg\//.test(ua)) browser = 'edge';
    else if (/Chrome\//.test(ua)) browser = 'chrome';
    else if (/Firefox\//.test(ua)) browser = 'firefox';
    else if (/Safari\//.test(ua)) browser = 'safari';
  }
  const os = ios ? 'ios' : android ? 'android' : 'desktop';
  return { os, browser, iosNeedsSafari: ios && browser !== 'safari' };
}

export const currentPlatform = () =>
  detectPlatform(typeof navigator !== 'undefined' ? navigator.userAgent : '', { maxTouchPoints: typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0 });

export const isStandaloneApp = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);

// natywny monit instalacji (Chrome / Samsung Internet / Edge) – przechwytywany w main.jsx
export const installPrompt = () => (typeof window !== 'undefined' ? window.__ddInstallPrompt || null : null);
export async function runInstallPrompt() {
  const p = installPrompt();
  if (!p) return null;
  p.prompt();
  const choice = await p.userChoice.catch(() => ({ outcome: 'dismissed' }));
  window.__ddInstallPrompt = null;
  return choice.outcome; // 'accepted' | 'dismissed'
}
