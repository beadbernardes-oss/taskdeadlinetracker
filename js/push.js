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

// Diagnóstico visível na tela (para descobrir por que o alerta não chega)
export async function pushDiagnose() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua);
  const v = ua.match(/OS (\d+)_(\d+)/);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const perm = 'Notification' in window ? Notification.permission : 'indisponível';
  let sw = 'não'; let sub = 'não';
  try {
    const reg = await Promise.race([navigator.serviceWorker?.getRegistration(), new Promise((r) => setTimeout(() => r(null), 3000))]);
    if (reg) { sw = reg.active ? 'sim' : 'instalando'; if (reg.pushManager) sub = (await reg.pushManager.getSubscription()) ? 'sim' : 'não'; }
  } catch (e) { sw = 'erro: ' + e.message; }
  return [
    ['Aparelho', ios ? `iPhone, iOS ${v ? v[1] + '.' + v[2] : '?'}` : (/Mac/.test(ua) ? 'Mac' : /Android/.test(ua) ? 'Android' : 'Computador')],
    ['Aberto pelo ícone da Tela de Início', standalone ? 'sim' : 'não'],
    ['Navegador aceita push', 'PushManager' in window && 'Notification' in window ? 'sim' : 'não'],
    ['Permissão de notificação', { granted: 'permitida', denied: 'BLOQUEADA', default: 'ainda não perguntada' }[perm] || perm],
    ['Conta conectada', currentUser() ? 'sim' : 'não'],
    ['Service worker', sw],
    ['Inscrição neste aparelho', sub],
  ];
}

const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

const b64 = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, (c) => c.charCodeAt(0)); };
const ab64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function enablePush() {
  const sup = pushSupport(); if (!sup.ok) throw new Error(sup.reason);
  const user = currentUser(); if (!user) throw new Error('Entre na sua conta primeiro.');
  const perm = await Notification.requestPermission();
  if (perm === 'denied') throw new Error('As notificações estão bloqueadas. No iPhone: Ajustes → Notificações → Tracker → ligar "Permitir Notificações". Depois toque em Ativar de novo.');
  if (perm !== 'granted') throw new Error('O iPhone não mostrou o pedido de permissão (resposta: ' + perm + ').');
  const reg = await withTimeout(navigator.serviceWorker.ready, 10000, 'O service worker não ficou pronto. Feche o app (arraste para cima) e abra de novo.');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await withTimeout(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID_PUBLIC_KEY) }), 20000, 'A Apple não respondeu à inscrição. Tente de novo em instantes.');
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
