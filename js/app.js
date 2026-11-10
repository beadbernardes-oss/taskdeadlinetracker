import { html, render, useState, useEffect } from './lib.js';
import { S, U, setUI, subscribe, load, addItem, toast } from './store.js';
import { tick, questions, unread, setSW, followUp, isOpen, isMine, agendaCheckDue } from './engine.js';
import { parseQuick } from './util.js';
import { Icon, Seg, openNew } from './ui.js';
import { startCloud, sendLink, signOut, signInPassword } from './cloud.js';
import { Today, Week, Kanban, Meetings, People, Summary } from './views.js';
import { ItemDrawer, OccDrawer, AskModal, PostponeModal, PautaModal, SeriesModal, IcsModal, SettingsModal, NotifPanel } from './editors.js';

const ROUTES = [
  { id: 'hoje', label: 'Hoje', icon: 'sun', C: Today },
  { id: 'semana', label: 'Semana', icon: 'calendar', C: Week },
  { id: 'kanban', label: 'Kanban', icon: 'board', C: Kanban },
  { id: 'reunioes', label: 'Reuniões', icon: 'list', C: Meetings },
  { id: 'pessoas', label: 'Pessoas', icon: 'users', C: People },
  { id: 'resumo', label: 'Resumo', icon: 'doc', C: Summary },
];
const routeOf = () => { const r = location.hash.replace(/^#\/?/, '').split('/')[0]; return ROUTES.find((x) => x.id === r) || ROUTES[0]; };

function Filters() {
  const f = U().filters; const st = S();
  const set = (p) => setUI({ filters: { ...f, ...p } });
  const tog = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const active = f.owner !== 'all' || f.prios.length || f.macros.length || f.q;
  return html`<div class="filters">
    <div class="f-h"><span>Filtros</span>${active && html`<button class="btn btn-ghost btn-xs" onClick=${() => set({ owner: 'all', prios: [], macros: [], q: '' })}>Limpar</button>`}</div>
    <div class="f-search"><${Icon} n="search" s=${15} /><input placeholder="Buscar…" value=${f.q} onInput=${(e) => set({ q: e.target.value })} /></div>
    <${Seg} small value=${f.owner} onChange=${(v) => set({ owner: v })} options=${[{ value: 'all', label: 'Todos' }, { value: 'me', label: 'Eu' }, { value: 'other', label: 'Terceiros' }]} />
    <div class="f-prios">${[0, 1, 2, 3].map((p) => html`<button class=${`fp pp-${p} ${f.prios.includes(p) ? 'on' : ''}`} onClick=${() => set({ prios: tog(f.prios, p) })}>P${p}</button>`)}</div>
    <div class="f-macros">${st.macrotemas.map((m) => html`<button class=${`fm ${f.macros.includes(m.id) ? 'on' : ''}`} style=${`--mc:${m.color}`} onClick=${() => set({ macros: tog(f.macros, m.id) })}><i></i>${m.name}</button>`)}</div>
  </div>`;
}

function QuickAdd() {
  const [t, setT] = useState('');
  const st = S();
  const p = t.trim() ? parseQuick(t, st.macrotemas, st.settings.defaultTime) : null;
  const submit = (e) => {
    e.preventDefault();
    if (!p || !p.title) return;
    const it = addItem({
      title: p.title, deadline: p.deadline, kind: p.kind, priority: p.priority ?? 2, macrotemaId: p.macrotemaId,
      owner: p.ownerName ? 'other' : 'me', ownerName: p.ownerName || '', status: p.ownerName ? 'waiting' : 'todo',
    });
    setT(''); toast(`Criado: ${it.title}`);
  };
  return html`<form class="quick" onSubmit=${submit}>
    <${Icon} n="plus" s=${16} />
    <input value=${t} onInput=${(e) => setT(e.target.value)} placeholder="Criar rápido: Revisar PRD sex 18h #pr !p1 @Lucas" aria-label="Criar rápido" />
    ${p && p.tokens.length > 0 && html`<div class="quick-tokens">${p.tokens.map((x) => html`<span>${x}</span>`)}</div>`}
    <div class="quick-help" tabindex="0" aria-label="Ajuda">?
      <div class="quick-tip"><b>Atalhos</b><br />Data: hoje, amanhã, seg…dom, 15/11<br />Hora: 18h, 9h30, 14:00<br />Prioridade: !p0 a !p3<br />Macrotema: #kappa, #pr, #ppr, #ya…<br />Terceiro: @Nome (use _ para espaço)<br />Marco: !marco</div>
    </div>
  </form>`;
}

function Login() {
  const u = U();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState('');
  const [mode, setMode] = useState(window.matchMedia('(display-mode: standalone)').matches || navigator.standalone ? 'pw' : 'link');
  const go = async (e) => {
    e.preventDefault(); if (!email.trim()) return;
    setBusy(true);
    try {
      if (mode === 'pw') await signInPassword(email.trim(), pw);
      else { await sendLink(email.trim()); setSent(true); }
    } catch (err) { toast(err.message); }
    setBusy(false);
  };
  return html`<div class="login">
    <form class="login-card" onSubmit=${go}>
      <span class="logo big"><${Icon} n="check" s=${22} /></span>
      <h2>Tracker</h2><p class="muted">Integrações de API</p>
      ${u.cloud === 'loading' ? html`<p class="muted">Conectando…</p>` : sent ? html`<div class="callout hot"><div><b>Link enviado</b><span>Abra o e-mail neste aparelho e toque no link para entrar.</span></div></div>
        <button type="button" class="btn btn-ghost btn-sm" onClick=${() => setSent(false)}>Voltar</button>` : html`
        <${Seg} small value=${mode} onChange=${setMode} options=${[{ value: 'link', label: 'Link por e-mail' }, { value: 'pw', label: 'Senha' }]} />
        <label class="field"><span class="field-l">Seu e-mail</span><input type="email" autocomplete="email" value=${email} onInput=${(e) => setEmail(e.target.value)} required /></label>
        ${mode === 'pw' && html`<label class="field"><span class="field-l">Senha</span><input type="password" autocomplete="current-password" value=${pw} onInput=${(e) => setPw(e.target.value)} required /></label>`}
        <button class="btn btn-primary btn-lg" disabled=${busy}>${busy ? 'Aguarde…' : mode === 'pw' ? 'Entrar' : 'Receber link de acesso'}</button>
        ${mode === 'pw' && html`<p class="muted small">Ainda sem senha? Entre pelo link no computador e defina em Configurações → Conta.</p>`}
        ${u.cloud === 'error' && html`<p class="warn-txt">${u.cloudError}</p>`}`}
    </form>
  </div>`;
}

function SyncDot() {
  const u = U();
  const map = { in: ['ok', 'Sincronizado'], syncing: ['busy', 'Sincronizando…'], error: ['bad', 'Erro de sincronização'] };
  const [c, t] = map[u.cloud] || ['busy', 'Conectando…'];
  return html`<div class="sync" title=${u.cloudError || u.email || ''}><i class=${c}></i><span>${t}</span>
    <button class="btn btn-ghost btn-xs" onClick=${() => { if (confirm('Sair desta conta neste aparelho?')) signOut(); }}>Sair</button></div>`;
}

function App() {
  const [, force] = useState(0);
  const [route, setRoute] = useState(routeOf());
  useEffect(() => subscribe(() => force((x) => x + 1)), []);
  useEffect(() => {
    const onHash = () => { setRoute(routeOf()); setUI({ drawer: null, notifOpen: false }); window.scrollTo(0, 0); };
    addEventListener('hashchange', onHash);
    const t = setInterval(() => { tick(); force((x) => x + 1); }, 30000);
    const onVis = () => { if (!document.hidden) { tick(); force((x) => x + 1); } };
    document.addEventListener('visibilitychange', onVis);
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      const x = U();
      if (x.modal) setUI({ modal: null });
      else if (x.notifOpen) setUI({ notifOpen: false });
      else if (x.drawer) setUI({ drawer: null });
      else if (questions(S(), new Date()).length && x.askSnoozeUntil < Date.now()) setUI({ askSnoozeUntil: Date.now() + 30 * 60000 });
    };
    document.addEventListener('keydown', onKey);
    tick();
    return () => { removeEventListener('hashchange', onHash); clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = S().settings.theme === 'auto' ? '' : S().settings.theme; });

  const st = S(); const u = U(); const now = new Date();
  const qs = questions(st, now);
  const nUnread = unread();
  const counts = {
    hoje: qs.length + st.items.filter((i) => followUp(i, st.settings, now)?.needs).length + (agendaCheckDue(st, now) ? 1 : 0),
  };
  const showAsk = qs.length && !u.modal && u.askSnoozeUntil < Date.now();
  const m = u.modal;
  const d = u.drawer;
  const View = route.C;
  if (u.cloud === 'out' || u.cloud === 'loading' || (u.cloud === 'error' && !u.email)) return html`<${Login} />${u.toast && html`<div class="toast" role="status">${u.toast}</div>`}`;

  return html`<div class="app">
    <aside class="side">
      <div class="brand"><span class="logo"><${Icon} n="check" s=${16} /></span><div><b>Tracker</b><span>Integrações de API</span></div></div>
      <nav class="nav">${ROUTES.map((r) => html`<a href=${`#/${r.id}`} class=${route.id === r.id ? 'on' : ''}><${Icon} n=${r.icon} /><span>${r.label}</span>${counts[r.id] ? html`<em>${counts[r.id]}</em>` : ''}</a>`)}</nav>
      <${Filters} />
      <div class="grow"></div>
      <${SyncDot} />
      <button class="nav-btn" onClick=${() => setUI({ modal: { type: 'settings' } })}><${Icon} n="sliders" /><span>Configurações</span></button>
    </aside>
    <main class="main">
      <header class="top">
        <h1>${route.label}</h1>
        <${QuickAdd} />
        <button class=${`btn btn-icon filt-btn ${u.showFilters ? 'on' : ''}`} aria-label="Filtros" onClick=${() => setUI({ showFilters: !u.showFilters })}><${Icon} n="filter" /></button>
        <button class="btn btn-icon bell" aria-label="Notificações" onClick=${() => setUI({ notifOpen: !u.notifOpen })}><${Icon} n="bell" />${nUnread > 0 && html`<em>${nUnread > 9 ? '9+' : nUnread}</em>`}</button>
        <button class="btn btn-primary new-btn" onClick=${() => openNew()}><${Icon} n="plus" s=${16} /><span>Novo</span></button>
        <button class="btn btn-icon set-btn" aria-label="Configurações" onClick=${() => setUI({ modal: { type: 'settings' } })}><${Icon} n="sliders" /></button>
      </header>
      ${u.showFilters && html`<div class="mobile-filters"><${Filters} /></div>`}
      <div class="content"><${View} /></div>
    </main>
    <nav class="tabbar">${ROUTES.map((r) => html`<a href=${`#/${r.id}`} class=${route.id === r.id ? 'on' : ''}><${Icon} n=${r.icon} s=${20} /><span>${r.label}</span>${counts[r.id] ? html`<em>${counts[r.id]}</em>` : ''}</a>`)}</nav>

    ${d && html`<div class="drawer-bg" onClick=${(e) => { if (e.target === e.currentTarget) setUI({ drawer: null }); }}>
      <aside class="drawer">
        ${d.type === 'occ' ? html`<${OccDrawer} k=${d.key} key=${d.key} />` : html`<${ItemDrawer} id=${d.type === 'item' ? d.id : null} preset=${d.preset} key=${d.id || `new-${JSON.stringify(d.preset)}`} />`}
      </aside>
    </div>`}
    ${u.notifOpen && html`<${NotifPanel} />`}
    ${m?.type === 'postpone' && html`<${PostponeModal} ...${m} key=${m.id + (m.proposed || '')} />`}
    ${m?.type === 'pauta' && html`<${PautaModal} ...${m} />`}
    ${m?.type === 'series' && html`<${SeriesModal} id=${m.id} key=${m.id || 'new'} />`}
    ${m?.type === 'ics' && html`<${IcsModal} />`}
    ${m?.type === 'settings' && html`<${SettingsModal} />`}
    ${showAsk ? html`<${AskModal} />` : null}
    ${u.toast && html`<div class="toast" role="status">${u.toast}</div>`}
  </div>`;
}

load();
render(html`<${App} />`, document.getElementById('root'));
startCloud().catch((e) => setUI({ cloud: 'error', cloudError: e.message }));

// Atualiza sozinho quando há versão nova publicada (evita uma janela antiga lendo dados novos)
import { APP_VERSION } from './config.js';
async function checkVersion() {
  try {
    const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    const { v } = await r.json();
    if (v > APP_VERSION) location.reload();
  } catch { /* offline: tenta depois */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); });
setInterval(checkVersion, 10 * 60 * 1000);
checkVersion();

function openRef(r) {
  if (!r) return;
  if (r.type === 'ask') setUI({ askSnoozeUntil: 0, askFocus: r.id, modal: null });
  else if (r.type === 'item') setUI({ drawer: { type: 'item', id: r.id } });
  else if (r.type === 'occ') setUI({ drawer: { type: 'occ', key: r.key } });
}
// Aberto a partir de uma notificação push (app estava fechado)
try {
  const q = new URLSearchParams(location.search).get('ref');
  if (q) { openRef(JSON.parse(q)); history.replaceState(null, '', location.pathname + location.hash); }
} catch { /* ignora */ }

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then((reg) => setSW(reg)).catch(() => {});
  navigator.serviceWorker.addEventListener('message', (e) => {
    const r = e.data?.ref; if (!r) return;
    if (r.type === 'ask') setUI({ askSnoozeUntil: 0, askFocus: r.id, modal: null });
    else if (r.type === 'item') setUI({ drawer: { type: 'item', id: r.id } });
    else if (r.type === 'occ') setUI({ drawer: { type: 'occ', key: r.key } });
  });
}
