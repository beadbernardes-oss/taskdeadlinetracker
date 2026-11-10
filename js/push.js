// Push: inscreve o aparelho e mantém a agenda de alertas no Supabase.
import { sb, currentUser } from './cloud.js';
import { VAPID_PUBLIC_KEY } from './config.js';
import { S } from './store.js';
import { buildSchedule } from './schedule.js';

const LS = 'tracker.pushEnabled';
export const pushEnabledHere = () => { try { return localStorage.getItem(LS) === '1'; } catch { return false; } };

export function pushSupport() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { ok: false, reason: ios && !standalone ? 'No iPhone, abra pelo ícone da Tela de Início (Safari → Compartilhar → Adicionar à Tela de Início).' : 'Este navegador não suporta push.' };
  }
  return { ok: true };
}

const b64 = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, (c) => c.charCodeAt(0)); };
const ab64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function enablePush() {
  const sup = pushSupport(); if (!sup.ok) throw new Error(sup.reason);
  const user = currentUser(); if (!user) throw new Error('Entre na sua conta primeiro.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Permissão de notificação negada.');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID_PUBLIC_KEY) });
  const device = /iPhone/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : /Mac/.test(navigator.userAgent) ? 'Mac' : 'Windows';
  const { error } = await sb.from('push_subscriptions').upsert({
    user_id: user.id, endpoint: sub.endpoint, p256dh: ab64(sub.getKey('p256dh')), auth: ab64(sub.getKey('auth')), device,
  }, { onConflict: 'endpoint' });
  if (error) throw new Error(error.message);
  try { localStorage.setItem(LS, '1'); } catch { /* ok */ }
  await syncSchedule();
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) { await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
  try { localStorage.removeItem(LS); } catch { /* ok */ }
}

export async function sendTest() {
  const user = currentUser(); if (!user) throw new Error('Entre na sua conta primeiro.');
  const { error } = await sb.from('scheduled_alerts').insert({
    user_id: user.id, key: `test:${Date.now()}`, fire_at: new Date().toISOString(), kind: 'test',
    title: 'Teste do Tracker', body: 'Se você está vendo isto, os alertas estão funcionando.', ref: { type: 'route', route: 'hoje' },
  });
  if (error) throw new Error(error.message);
}

// Substitui os alertas futuros ainda não enviados pela agenda recalculada.
let syncing = false; let again = false;
export async function syncSchedule() {
  const user = currentUser(); if (!user) return;
  if (syncing) { again = true; return; }
  syncing = true;
  try {
    const rows = buildSchedule(S()).map((r) => ({ ...r, user_id: user.id }));
    await sb.from('scheduled_alerts').delete().eq('user_id', user.id).is('sent_at', null).not('key', 'like', 'test:%');
    for (let i = 0; i < rows.length; i += 400) {
      await sb.from('scheduled_alerts').upsert(rows.slice(i, i + 400), { onConflict: 'user_id,key', ignoreDuplicates: true });
    }
  } finally {
    syncing = false;
    if (again) { again = false; syncSchedule(); }
  }
}
