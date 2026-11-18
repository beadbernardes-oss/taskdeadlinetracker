// Sincronização com o Supabase: login por link no e-mail + documento único por usuária + tempo real.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { S, setUI, replaceState, setPersistHook, toast } from './store.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

import { syncSchedule } from './push.js';
import { applyFeed } from './daxiang.js';
import { buildView, viewState } from './share.js';
import { S as getState, mutate } from './store.js';

let userId = null;
let user = null;
export const currentUser = () => user;
let version = 0;
let timer = null;
let pushing = false;
let dirty = false;
let viewerOf = null;   // quando a pessoa logada só vê a vitrine de outra (head): id da dona
let shareOn = false;   // a dona convidou alguém: o app mantém a vitrine atualizada
let lastShared = '';

const status = (cloud, extra = {}) => setUI({ cloud, ...extra });

// Login vencido no servidor (ex.: relógio do computador atrasado alguns minutos): renova e tenta de novo.
const isAuthErr = (e) => !!e && (e.code === 'PGRST301' || e.code === 'PGRST303' || /jwt|token is expired/i.test(e.message || ''));
export async function db(run) {
  let r = await run();
  if (r.error && isAuthErr(r.error)) {
    const { error } = await sb.auth.refreshSession();
    if (!error) r = await run();
  }
  return r;
}
let retryN = 0;
const retryConnect = (u) => { const wait = Math.min(60, 5 * 2 ** retryN++) * 1000; setTimeout(() => { if (user?.id === u.id) connect(u); }, wait); };

export async function startCloud() {
  status('loading');
  const { data: { session } } = await sb.auth.getSession();
  sb.auth.onAuthStateChange((ev, s) => {
    if (ev === 'SIGNED_IN' && s && s.user.id !== userId) connect(s.user);
    if (ev === 'SIGNED_OUT') { userId = null; user = null; viewerOf = null; setUI({ viewer: false }); status('out'); }
  });
  if (session) await connect(session.user);
  else status('out');
}

export async function sendLink(email) {
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true } });
  if (error) throw error;
}

// Senha: necessária no app instalado do iPhone (o link do e-mail abre no Safari, que tem login separado)
export async function signInPassword(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message);
}
export async function setPassword(password) {
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw error;
}

export async function signOut() { await sb.auth.signOut(); }

async function connect(u) {
  user = u; userId = u.id;
  status('syncing', { email: user.email });
  // Convidada (ex.: head)? Então só lê a vitrine de quem a convidou: nunca cria nem lê tracker_docs.
  const { data: inv } = await db(() => sb.from('shared_access').select('owner_id'));
  const invite = (inv || []).find((r) => r.owner_id !== userId);
  if (invite) { await connectViewer(invite.owner_id); return; }
  const { data, error } = await db(() => sb.from('tracker_docs').select('data, version').eq('user_id', userId).maybeSingle());
  if (error) { status('error', { cloudError: error.message }); retryConnect(u); return; }
  retryN = 0;
  if (!data) {
    // Primeiro login: sobe o que já existe neste navegador.
    version = 1;
    const { error: e2 } = await db(() => sb.from('tracker_docs').insert({ user_id: userId, data: payload(), version }));
    if (e2) { status('error', { cloudError: e2.message }); retryConnect(u); return; }
  } else {
    version = data.version;
    replaceState(data.data, { silent: true });
  }
  setPersistHook(schedule);
  listen();
  status('in');
  await pullFeed();
  syncSchedule().catch(() => {});
  refreshSharing().catch(() => {});
}

// ---------- Vitrine (Gantt + OKR3) para a head ----------
async function connectViewer(ownerId) {
  viewerOf = ownerId;
  setPersistHook(null); // nada do que acontece aqui volta para o Supabase
  setUI({ viewer: true });
  if (!/^#\/(gantt|okr3)/.test(location.hash)) location.hash = '#/gantt';
  await pullView();
  if (channel) sb.removeChannel(channel);
  channel = sb.channel('vitrine')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_views', filter: `owner_id=eq.${ownerId}` }, (p) => { if (p.new?.data) showView(p.new); })
    .subscribe();
}
async function pullView() {
  const { data, error } = await db(() => sb.from('shared_views').select('data, updated_at').eq('owner_id', viewerOf).maybeSingle());
  if (error) { status('error', { cloudError: error.message }); return; }
  showView(data || { data: {} });
}
function showView(row) {
  replaceState(viewState(row.data || {}), { silent: true });
  setUI({ viewUpdatedAt: row.updated_at || null });
  status('in');
}

// Dona: lista, convida e remove quem vê a vitrine
export async function listViewers() {
  const { data, error } = await db(() => sb.from('shared_access').select('viewer_email, created_at').eq('owner_id', userId).order('created_at'));
  if (error) throw error;
  return data || [];
}
export async function addViewer(email) {
  const e = (email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('E-mail inválido.');
  if (e === (user?.email || '').toLowerCase()) throw new Error('Esse é o seu próprio e-mail.');
  const { error } = await db(() => sb.from('shared_access').insert({ owner_id: userId, viewer_email: e }));
  if (error && error.code !== '23505') throw error;
  shareOn = true; lastShared = '';
  await publishView();
}
export async function removeViewer(email) {
  const { error } = await db(() => sb.from('shared_access').delete().eq('owner_id', userId).eq('viewer_email', email));
  if (error) throw error;
  await refreshSharing();
}
async function refreshSharing() {
  if (!userId || viewerOf) return;
  const { data, error } = await db(() => sb.from('shared_access').select('viewer_email').eq('owner_id', userId));
  shareOn = !error && !!(data && data.length);
  if (shareOn) await publishView();
}
async function publishView() {
  if (!shareOn || !userId || viewerOf) return;
  const v = buildView(); const j = JSON.stringify(v);
  if (j === lastShared) return;
  const { error } = await db(() => sb.from('shared_views').upsert({ owner_id: userId, data: v, updated_at: new Date().toISOString() }));
  if (!error) lastShared = j;
}

// Agenda do Daxiang enviada pelo script do computador
async function pullFeed(row) {
  if (!userId) return;
  if (!row) { const { data } = await db(() => sb.from('calendar_feed').select('data, updated_at').eq('user_id', userId).maybeSingle()); row = data; }
  if (!row || !row.data) return;
  setUI({ dxSyncedAt: row.data.syncedAt || row.updated_at });
  const draft = JSON.parse(JSON.stringify(getState()));
  if (applyFeed(draft, row.data)) mutate((st) => { applyFeed(st, row.data); });
}

function payload() {
  const s = { ...S() };
  s.settings = { ...s.settings, tz: Intl.DateTimeFormat().resolvedOptions().timeZone };
  return s;
}

function schedule() {
  if (!userId) return;
  dirty = true;
  clearTimeout(timer);
  timer = setTimeout(push, 800);
  setUI({ cloud: 'syncing' });
}

async function push() {
  if (pushing) { timer = setTimeout(push, 400); return; }
  pushing = true; dirty = false;
  const next = version + 1;
  // Grava só se ninguém gravou antes (controle por versão)
  const { data, error } = await db(() => sb.from('tracker_docs')
    .update({ data: payload(), version: next, updated_at: new Date().toISOString() })
    .eq('user_id', userId).eq('version', version).select('version'));
  pushing = false;
  if (error) {
    // Não perde a mudança: tenta gravar de novo em alguns segundos
    setUI({ cloud: 'error', cloudError: error.message });
    dirty = true; clearTimeout(timer); timer = setTimeout(push, 15000);
    return;
  }
  if (!data || !data.length) {
    // Outro aparelho gravou antes: pega a versão dele.
    const { data: remote } = await db(() => sb.from('tracker_docs').select('data, version').eq('user_id', userId).single());
    if (remote) { version = remote.version; replaceState(remote.data, { silent: true }); toast('Atualizado com mudanças de outro aparelho.'); }
  } else version = next;
  setUI({ cloud: dirty ? 'syncing' : 'in' });
  if (!dirty) { syncSchedule().catch(() => {}); publishView().catch(() => {}); }
}

let channel = null;
function listen() {
  if (channel) sb.removeChannel(channel);
  channel = sb.channel('doc')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tracker_docs', filter: `user_id=eq.${userId}` }, (p) => {
      const v = p.new?.version;
      if (!v || v <= version || pushing || dirty) return;
      version = v;
      replaceState(p.new.data, { silent: true });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_feed', filter: `user_id=eq.${userId}` }, () => { pullFeed().catch(() => {}); })
    .subscribe();
}

// Ao voltar para o app (ex.: iPhone), confere se há versão mais nova.
document.addEventListener('visibilitychange', async () => {
  if (document.hidden || !userId || pushing) return;
  if (viewerOf) { await pullView().catch(() => {}); return; }
  if (dirty) { clearTimeout(timer); push(); return; } // havia mudança pendente (ex.: erro de rede): grava agora
  const { data } = await db(() => sb.from('tracker_docs').select('data, version').eq('user_id', userId).single());
  if (data && data.version > version) { version = data.version; replaceState(data.data, { silent: true }); }
  await pullFeed().catch(() => {});
  syncSchedule().catch(() => {}); // recalcula ao voltar (ex.: novo dia)
});
