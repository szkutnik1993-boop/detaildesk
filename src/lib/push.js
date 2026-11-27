import { VAPID_PUBLIC_KEY } from '../config.js';
import { supabase } from './supabase.js';

const toUint8 = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function enablePush() {
  if (!pushSupported()) {
    throw new Error(
      /iPhone|iPad/.test(navigator.userAgent) && !isStandalone()
        ? 'Na iPhonie powiadomienia działają tylko w aplikacji dodanej do ekranu początkowego (Udostępnij → Do ekranu początkowego).'
        : 'Ta przeglądarka nie obsługuje powiadomień push.'
    );
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Nie zezwolono na powiadomienia. Włącz je w Ustawieniach iPhone’a → Powiadomienia → DetailDesk.');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toUint8(VAPID_PUBLIC_KEY) });
  const json = sub.toJSON();
  const device = /iPhone/.test(navigator.userAgent) ? 'iPhone' : /iPad/.test(navigator.userAgent) ? 'iPad' : /Android/.test(navigator.userAgent) ? 'Android' : 'Komputer';
  const { error } = await supabase.from('push_subscriptions').upsert({ endpoint: json.endpoint, subscription: json, device });
  if (error) throw new Error(error.message);
  return sub;
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}
