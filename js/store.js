import { uid, H, M, addDays, startOfDay, startOfWeek, fmtDateTime, nameKey, normName, dayKey, anticipate } from './util.js';
import { ensureOcc } from './meetings.js';

const KEY = 'tracker.v1';

export const PALETTE = ['#7c5cff', '#0e9f9a', '#ea7a1a', '#d6409f', '#64748b', '#4f46e5', '#0891b2', '#a16207', '#9333ea', '#be123c'];

export const DEFAULT_SETTINGS = {
  alertLeadHours: 24,      // pergunta "vou conseguir entregar?"
  quietStart: 22,          // sem alertas entre 22h e 8h
  quietEnd: 8,
  repeatHours: 4,          // repete a pergunta se não respondida
  followUpDaysBefore: 2,   // follow-up de terceiros D-2
  followUpHour: 9,
  digestHour: 8,           // resumo do dia
  preMeetingMinutes: 60,   // checagem de pauta
  defaultTime: '18:00',
  informWithinHours: 2,    // prazo da sub-task "Informar stakeholders"
  myEmail: '',
  agendaCheck: true,       // check diário: o tracker reflete toda a agenda do Daxiang?
  agendaCheckDays: 'all',  // 'all' | 'weekdays'
  theme: 'auto',
};

export function checkAgenda() {
  mutate((s) => { s.agendaChecks = { ...(s.agendaChecks || {}), [dayKey(new Date())]: new Date().toISOString() }; });
}

const MACROS = ['Product Requirements', 'Ponctual Product Requirements', 'Tickets to Product Team', 'Yellow&Alpha', 'Kappa', 'Expansion&Epicenters'];

let state;
let ui = {
  drawer: null, modal: null, toast: null, askSnoozeUntil: 0, askFocus: null,
  filters: { owner: 'all', prios: [], macros: [], q: '' }, showFilters: false,
  weekOffset: 0, leadOnly: true, person: null, summaryWeek: 0,
};
const subs = new Set();
const emit = () => subs.forEach((f) => f());

export const S = () => state;
export const U = () => ui;
export const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };

export function setUI(patch) {
  ui = { ...ui, ...(typeof patch === 'function' ? patch(ui) : patch) };
  emit();
}
let toastTimer;
export function toast(msg) {
  setUI({ toast: msg }); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setUI({ toast: null }), 2600);
}

let persistHook = null;
export const setPersistHook = (f) => { persistHook = f; };

export function mutate(fn) {
  fn(state);
  state = { ...state, updatedAt: new Date().toISOString() };
  save(); emit();
  if (persistHook) persistHook();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* cheio ou bloqueado */ } }

function blank() {
  return {
    version: 1, settings: { ...DEFAULT_SETTINGS },
    macrotemas: MACROS.map((name, i) => ({ id: uid(), name, color: PALETTE[i] })),
    items: [], series: [], occ: {}, notifs: [], log: {}, agendaChecks: {},
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      state = { ...blank(), ...s, settings: { ...DEFAULT_SETTINGS, ...s.settings } };
      return;
    }
  } catch { /* corrompido: recomeça */ }
  state = seed(blank());
  save();
}

export function replaceState(s, { silent = false } = {}) {
  state = { ...blank(), ...s, settings: { ...DEFAULT_SETTINGS, ...s.settings } };
  save(); emit();
  if (!silent && persistHook) persistHook();
}

// ---------- Itens ----------
export function newItem(p = {}) {
  const now = new Date().toISOString();
  return {
    id: uid(), kind: 'task', owner: 'me', ownerName: '', title: '', notes: '',
    macrotemaId: null, priority: 2, deadline: null, originalDeadline: null, postponements: [],
    status: 'todo', doneAt: null, stakeholders: [], dependsOn: [], parentId: null, subtype: null,
    followUps: [], lastFollowUp: null, ans: null, ansAt: null, message: '', fromOcc: null,
    createdAt: now, updatedAt: now, ...p,
  };
}

export function addItem(p) {
  const it = newItem(p);
  if (it.deadline && !it.originalDeadline) it.originalDeadline = it.deadline;
  if (it.ownerName) it.ownerName = normName(it.ownerName);
  mutate((s) => { s.items.push(it); });
  return it;
}

export function updateItem(id, patch) {
  mutate((s) => {
    const it = s.items.find((x) => x.id === id); if (!it) return;
    Object.assign(it, typeof patch === 'function' ? patch(it) : patch, { updatedAt: new Date().toISOString() });
    if (it.status === 'done' && !it.doneAt) it.doneAt = new Date().toISOString();
    if (it.status !== 'done') it.doneAt = null;
    if (it.deadline && !it.originalDeadline) it.originalDeadline = it.deadline;
  });
}

export function deleteItem(id) {
  mutate((s) => {
    const kill = new Set([id, ...s.items.filter((x) => x.parentId === id).map((x) => x.id)]);
    s.items = s.items.filter((x) => !kill.has(x.id));
    s.items.forEach((x) => { x.dependsOn = (x.dependsOn || []).filter((d) => !kill.has(d)); });
  });
}

export const macroName = (id) => state.macrotemas.find((m) => m.id === id)?.name || 'Sem macrotema';

export function informMessage(it, from, to, reason) {
  const who = it.stakeholders.length ? it.stakeholders.join(', ') : 'pessoal';
  return `Oi, ${who}! Atualização sobre "${it.title}" (${macroName(it.macrotemaId)}): o prazo de entrega mudou de ${fmtDateTime(from)} para ${fmtDateTime(to)}.\nMotivo: ${reason}\nSigo acompanhando e aviso se houver qualquer mudança.`;
}

// Resposta "Não" / arrastar para depois: registra adiamento e (se for meu) cria sub-task de aviso.
export function postpone(id, newISO, reason, { createInform = true } = {}) {
  let informId = null;
  mutate((s) => {
    const it = s.items.find((x) => x.id === id); if (!it) return;
    const from = it.deadline;
    it.postponements = [...(it.postponements || []), { from, to: newISO, reason, at: new Date().toISOString() }];
    it.deadline = newISO; it.ans = null; it.ansAt = null; it.updatedAt = new Date().toISOString();
    if (createInform) {
      // Prazo do aviso respeita o silêncio; se a antecipação cair no passado, vence já.
      const due = new Date(Math.max(Date.now(), +anticipate(Date.now() + s.settings.informWithinHours * H, s.settings))).toISOString();
      const sub = newItem({
        title: `Informar stakeholders: novo prazo de "${it.title}"`, parentId: it.id, subtype: 'inform',
        macrotemaId: it.macrotemaId, priority: it.priority, deadline: due, originalDeadline: due,
        stakeholders: [...it.stakeholders], message: informMessage(it, from, newISO, reason),
      });
      s.items.push(sub); informId = sub.id;
    }
  });
  return informId;
}

export function answerYes(id) { updateItem(id, (it) => ({ ans: it.deadline, ansAt: new Date().toISOString() })); }
export function markDone(id) { updateItem(id, { status: 'done' }); }

export function logFollowUp(id, note = '') {
  updateItem(id, (it) => {
    const at = new Date().toISOString();
    return { lastFollowUp: at, followUps: [...(it.followUps || []), { at, note }] };
  });
}

// ---------- Reuniões ----------
export function addAgendaItem(key, p = {}) {
  const a = { id: uid(), text: '', macrotemaId: null, priority: 2, links: [], discussed: false, ...p };
  mutate((s) => { ensureOcc(s, key).agenda.push(a); });
  return a;
}
export function updateAgenda(key, aid, patch) {
  mutate((s) => { const a = ensureOcc(s, key).agenda.find((x) => x.id === aid); if (a) Object.assign(a, patch); });
}
export function removeAgenda(key, aid) {
  mutate((s) => { const r = ensureOcc(s, key); r.agenda = r.agenda.filter((x) => x.id !== aid); });
}
export function updateOcc(key, patch) { mutate((s) => { Object.assign(ensureOcc(s, key), patch); }); }

export function people() {
  const map = new Map();
  const add = (n) => { const k = nameKey(n); if (k && !map.has(k)) map.set(k, normName(n)); };
  state.items.forEach((i) => { if (i.owner === 'other') add(i.ownerName); (i.stakeholders || []).forEach(add); });
  state.series.forEach((s) => (s.participants || []).forEach(add));
  return [...map.values()].sort((a, b) => a.localeCompare(b));
}

// ---------- Dados de exemplo ----------
function seed(s) {
  const now = new Date();
  const mac = (i) => s.macrotemas[i].id;
  const at = (days, h, m = 0) => { const d = addDays(startOfDay(now), days); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const soon = new Date(Math.ceil((+now + 20 * H) / H) * H).toISOString();
  const created = addDays(now, -6).toISOString();
  const it = (p) => { const x = newItem({ demo: true, createdAt: created, ...p }); x.originalDeadline = x.originalDeadline || x.deadline; s.items.push(x); return x; };

  const doc = it({ title: 'Documentação dos endpoints de conciliação', owner: 'other', ownerName: 'Lucas', macrotemaId: mac(5), priority: 1, deadline: at(2, 18), status: 'doing', stakeholders: ['Ana'] });
  it({ title: 'Retorno do time de Produto sobre ticket de rate limit', owner: 'other', ownerName: 'Marina', macrotemaId: mac(2), priority: 0, deadline: at(-1, 17), status: 'waiting', lastFollowUp: addDays(now, -3).toISOString(), followUps: [{ at: addDays(now, -3).toISOString(), note: 'Cobrei no Daxiang' }] });
  it({ title: 'Revisar requisitos pontuais do parceiro de checkout', macrotemaId: mac(1), priority: 1, deadline: soon, stakeholders: ['Rafael'], notes: 'Exemplo: este prazo está a menos de 24h, então o app já pergunta se você vai conseguir entregar.' });
  it({ title: 'Consolidar PRD da API de pagamentos v2', macrotemaId: mac(0), priority: 0, deadline: at(3, 18), status: 'doing', stakeholders: ['Ana', 'Rafael'], dependsOn: [doc.id], notes: 'Depende da documentação do Lucas. Se ela atrasar, esta task fica em risco.' });
  it({ title: 'Go-live Kappa', kind: 'marco', macrotemaId: mac(4), priority: 0, deadline: at(9, 10), stakeholders: ['Ana', 'Diretoria'] });
  it({ title: 'Mapear processo de priorização de tickets', macrotemaId: mac(2), priority: 2, deadline: at(6, 18), status: 'todo' });
  it({ title: 'Definir critérios de entrada Yellow&Alpha', macrotemaId: mac(3), priority: 3, deadline: at(12, 18) });
  it({ title: 'Alinhar escopo de Expansion com Epicenters', macrotemaId: mac(5), priority: 2, deadline: at(-2, 18), status: 'done', doneAt: addDays(now, -2).toISOString() });

  // Reunião semanal que você lidera (começou semana passada, para mostrar o "carry-over")
  const weekly = { id: uid(), demo: true, title: 'Weekly Integrações de API', start: at(-7, 10), durationMin: 60, recur: { freq: 'weekly', interval: 1, byDay: [addDays(now, -7).getDay()], exdates: [] }, lead: true, participants: ['Ana', 'Rafael', 'Lucas'], macrotemaId: mac(0), link: '', source: 'manual' };
  // Reunião que começa em menos de 1h e está sem pauta (dispara o alerta)
  const startSoon = new Date(Math.ceil((+now + 40 * M) / (15 * M)) * 15 * M);
  const sync = { id: uid(), demo: true, title: 'Sync Yellow&Alpha', start: startSoon.toISOString(), durationMin: 30, recur: { freq: 'weekly', interval: 1, byDay: [startSoon.getDay()], exdates: [] }, lead: true, participants: ['Marina', 'Rafael'], macrotemaId: mac(3), link: '', source: 'manual' };
  const allhands = { id: uid(), demo: true, title: 'All-hands Produto', start: at(1, 15), durationMin: 60, recur: { freq: 'none' }, lead: false, participants: [], macrotemaId: null, link: '', source: 'manual' };
  s.series.push(weekly, sync, allhands);
  const pastKey = `${weekly.id}|${dayKey(weekly.start)}`;
  s.occ[pastKey] = {
    agenda: [
      { id: uid(), text: 'Status do PRD da API de pagamentos', macrotemaId: mac(0), priority: 0, links: [], discussed: true },
      { id: uid(), text: 'Proposta de SLA para tickets ao time de Produto', macrotemaId: mac(2), priority: 1, links: [{ label: 'Rascunho SLA', url: 'https://example.com/sla' }], discussed: false },
    ],
    notes: 'Decidido: PRD v2 sai antes do go-live Kappa.', closed: false, carried: false,
  };
  return s;
}

export function clearDemo() {
  mutate((s) => {
    const sids = new Set(s.series.filter((x) => x.demo).map((x) => x.id));
    s.items = s.items.filter((x) => !x.demo && !(x.parentId && !s.items.find((p) => p.id === x.parentId && !p.demo)));
    s.series = s.series.filter((x) => !x.demo);
    for (const k of Object.keys(s.occ)) if (sids.has(k.split('|')[0])) delete s.occ[k];
    s.notifs = []; s.log = {};
  });
}

export const hasDemo = () => state.items.some((x) => x.demo) || state.series.some((x) => x.demo);
export const weekStartFor = (offset) => addDays(startOfWeek(new Date()), offset * 7);
