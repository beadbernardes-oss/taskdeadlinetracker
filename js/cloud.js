// Sincronização com o Supabase: login por link no e-mail + documento único por usuária + tempo real.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { S, setUI, replaceState, setPersistHook, toast } from './store.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

import { syncSchedule } from './push.js';

let userId = null;
let user = null;
export const currentUser = () => user;
let version = 0;
let timer = null;
let pushing = false;
let dirty = false;

const status = (cloud, extra = {}) => setUI({ cloud, ...extra });

export async function startCloud() {
  status('loading');
  const { data: { session } } = await sb.auth.getSession();
  sb.auth.onAuthStateChange((ev, s) => {
    if (ev === 'SIGNED_IN' && s && s.user.id !== userId) connect(s.user);
    if (ev === 'SIGNED_OUT') { userId = null; user = null; status('out'); }
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
  const { data, error } = await sb.from('tracker_docs').select('data, version').eq('user_id', userId).maybeSingle();
  if (error) { status('error', { cloudError: error.message }); return; }
  if (!data) {
    // Primeiro login: sobe o que já existe neste navegador.
    version = 1;
    const { error: e2 } = await sb.from('tracker_docs').insert({ user_id: userId, data: payload(), version });
    if (e2) { status('error', { cloudError: e2.message }); return; }
  } else {
    version = data.version;
    replaceState(data.data, { silent: true });
  }
  setPersistHook(schedule);
  listen();
  status('in');
  syncSchedule().catch(() => {});
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
  const { data, error } = await sb.from('tracker_docs')
    .update({ data: payload(), version: next, updated_at: new Date().toISOString() })
    .eq('user_id', userId).eq('version', version).select('version');
  pushing = false;
  if (error) { setUI({ cloud: 'error', cloudError: error.message }); return; }
  if (!data || !data.length) {
    // Outro aparelho gravou antes: pega a versão dele.
    const { data: remote } = await sb.from('tracker_docs').select('data, version').eq('user_id', userId).single();
    if (remote) { version = remote.version; replaceState(remote.data, { silent: true }); toast('Atualizado com mudanças de outro aparelho.'); }
  } else version = next;
  setUI({ cloud: dirty ? 'syncing' : 'in' });
  if (!dirty) syncSchedule().catch(() => {});
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
    .subscribe();
}

// Ao voltar para o app (ex.: iPhone), confere se há versão mais nova.
document.addEventListener('visibilitychange', async () => {
  if (document.hidden || !userId || dirty || pushing) return;
  const { data } = await sb.from('tracker_docs').select('data, version').eq('user_id', userId).single();
  if (data && data.version > version) { version = data.version; replaceState(data.data, { silent: true }); }
  syncSchedule().catch(() => {}); // recalcula ao voltar (ex.: novo dia)
});
