// Motor de alertas: calcula o que precisa de atenção e dispara notificações.
// Nesta versão roda no app aberto. Na fase 2 a mesma lógica roda no Supabase (cron) e manda push.
import { S, mutate, U } from './store.js';
import { H, M, D, uid, startOfDay, addDays, dayKey, fmtRel, fmtTime, inQuiet, anticipate } from './util.js';
import { occurrencesBetween, occurrenceByKey, nextOccurrence, ensureOcc } from './meetings.js';
import { prepOps, applyPrepOps } from './prep.js';
import { newItem } from './store.js';

export { inQuiet, anticipate };
export const isOpen = (i) => i.status !== 'done';
export const isMine = (i) => i.owner === 'me';

// Momento da pergunta de entrega: deadline - 24h, respeitando o silêncio.
export function alertTime(deadlineISO, s, item) {
  let t = new Date(new Date(deadlineISO).getTime() - s.alertLeadHours * H);
  // Tasks marcadas para não perguntar no fim de semana: a pergunta vem na sexta, no mesmo horário
  if (item?.askSkipWeekend) { if (t.getDay() === 6) t = addDays(t, -1); else if (t.getDay() === 0) t = addDays(t, -2); }
  return anticipate(+t, s);
}

// Momento da checagem de pauta: início - 60min, respeitando o silêncio (reunião às 8h30 → alerta às 21h da véspera).
export const preMeetingTime = (start, s) => anticipate(+new Date(start) - s.preMeetingMinutes * M, s);

// Check diário de agenda (Daxiang sem exportação: conferência manual obrigatória)
export function agendaCheckDue(state = S(), now = new Date()) {
  const s = state.settings;
  if (!s.agendaCheck) return false;
  if (s.agendaCheckDays === 'weekdays' && (now.getDay() === 0 || now.getDay() === 6)) return false;
  return !(state.agendaChecks || {})[dayKey(now)];
}

export function questions(state = S(), now = new Date()) {
  const out = [];
  for (const i of state.items) {
    if (!isMine(i) || !isOpen(i) || !i.deadline || i.subtype === 'inform') continue;
    const dl = new Date(i.deadline);
    if (now >= dl) out.push({ type: 'overdue', item: i });
    else if (now >= alertTime(i.deadline, state.settings, i) && i.ans !== i.deadline) out.push({ type: 'ask', item: i });
  }
  return out.sort((a, b) => new Date(a.item.deadline) - new Date(b.item.deadline));
}

// Follow-up de terceiros: D-2 às 9h, no dia às 9h e, depois de vencido, todo dia às 9h.
export function followUp(i, s, now = new Date()) {
  if (i.owner !== 'other' || !isOpen(i) || !i.deadline) return null;
  const dl = new Date(i.deadline);
  const at9 = (day) => { const d = startOfDay(day); d.setHours(s.followUpHour, 0, 0, 0); return d; };
  const cands = [{ at: at9(addDays(dl, -s.followUpDaysBefore)), label: `Prazo em ${s.followUpDaysBefore} dias` }];
  let dayOf = at9(dl); if (dayOf > dl) dayOf = new Date(+dl - H);
  cands.push({ at: dayOf, label: 'Vence hoje' });
  if (now > dl) {
    let late = at9(now); if (late <= dl) late = new Date(+dl + H);
    if (late > now) late = at9(addDays(now, -1));
    if (late > dl) cands.push({ at: late, label: 'Atrasado' });
  }
  const passed = cands.filter((c) => c.at <= now).sort((a, b) => b.at - a.at)[0];
  if (!passed) return { needs: false, next: cands.find((c) => c.at > now) };
  const base = new Date(i.lastFollowUp || i.createdAt);
  return { ...passed, needs: base < passed.at };
}

export function risk(i, state = S(), now = new Date()) {
  if (!isOpen(i)) return [];
  const reasons = [];
  for (const id of i.dependsOn || []) {
    const d = state.items.find((x) => x.id === id);
    if (!d || !isOpen(d)) continue;
    if (d.deadline && new Date(d.deadline) < now) reasons.push(`"${d.title}" está atrasado`);
    else if (d.deadline && i.deadline && new Date(d.deadline) > new Date(i.deadline)) reasons.push(`"${d.title}" vence depois deste prazo`);
  }
  return reasons;
}

export const leadToday = (state = S(), now = new Date()) =>
  occurrencesBetween(state, startOfDay(now), addDays(startOfDay(now), 1), { leadOnly: true });

const hasAgenda = (o) => (o.rec?.agenda || []).some((a) => (a.text || '').trim());
export { hasAgenda };

// ---------- Notificações ----------
let swReg = null;
export function setSW(reg) { swReg = reg; }

function osNotify(n) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    // Aparelho com push ativo recebe pelo servidor; evita notificação dupla.
    if (localStorage.getItem('tracker.pushEnabled') === '1') return;
    const opts = { body: n.body, tag: n.key, data: { ref: n.ref }, icon: 'icon.svg', badge: 'icon.svg', requireInteraction: n.kind === 'ask' };
    if (swReg) swReg.showNotification(n.title, opts);
    else new Notification(n.title, opts);
  } catch { /* sem suporte */ }
}

// Pauta que ainda precisa ir para a próxima reunião
const needsCarry = (a) => !a.discussed && !a.carriedTo && (a.text || '').trim();

export function tick(now = new Date(), { force } = {}) {
  // 0) Preparações recorrentes de reunião (cria a task da próxima ocorrência)
  const pops = prepOps(S(), now);
  if (pops.length) mutate((st) => applyPrepOps(st, pops, newItem, now));
  const state = S(); const s = state.settings;
  const fire = []; const carry = [];
  const last = (k) => (state.log[k] ? new Date(state.log[k]) : null);
  const quiet = inQuiet(now, s);

  // 1) Pergunta de prazo (minhas entregas)
  if (!quiet) {
    for (const q of questions(state, now)) {
      const k = `${q.type}:${q.item.id}:${q.item.deadline}`; const l = last(k);
      if (!l || now - l >= s.repeatHours * H) {
        fire.push(q.type === 'ask'
          ? { key: k, kind: 'ask', title: 'Vou conseguir entregar no prazo?', body: `${q.item.title} · ${fmtRel(q.item.deadline, now)}`, ref: { type: 'ask', id: q.item.id } }
          : { key: k, kind: 'ask', title: 'Prazo vencido: você entregou?', body: q.item.title, ref: { type: 'ask', id: q.item.id } });
      }
    }
  }
  // 2) Follow-ups com terceiros e sub-tasks de aviso
  for (const i of state.items) {
    if (!isOpen(i)) continue;
    const f = followUp(i, s, now);
    if (f?.needs && !quiet) {
      const k = `fu:${i.id}:${+f.at}`;
      if (!last(k)) fire.push({ key: k, kind: 'fu', title: `Follow-up com ${i.ownerName || 'terceiro'}`, body: `${f.label}: ${i.title}`, ref: { type: 'item', id: i.id } });
    }
    if (i.subtype === 'inform' && i.deadline && new Date(i.deadline) <= now) {
      const k = `due:${i.id}:${i.deadline}`;
      if (!last(k) && !quiet) fire.push({ key: k, kind: 'inform', title: 'Avise os stakeholders', body: i.title, ref: { type: 'item', id: i.id } });
    }
  }
  // 3) Reuniões que você lidera
  const upcoming = occurrencesBetween(state, new Date(+now - 1), new Date(+now + s.preMeetingMinutes * M + 14 * H), { leadOnly: true });
  for (const o of upcoming) {
    if (o.start <= now || hasAgenda(o) || now < preMeetingTime(o.start, s)) continue;
    const k = `pre:${o.key}`;
    if (!last(k) && !quiet) fire.push({ key: k, kind: 'meeting', title: `Reunião às ${fmtTime(o.start)} sem pauta`, body: `${o.series.title} começa ${fmtRel(o.start, now)} e você é a lead.`, ref: { type: 'occ', key: o.key } });
  }
  // Check de agenda: a partir do horário do resumo, repete até ser feito
  if (agendaCheckDue(state, now) && now.getHours() >= s.digestHour && !quiet) {
    const k = `agcheck:${dayKey(now)}`; const l = last(k);
    if (!l || now - l >= s.repeatHours * H) fire.push({ key: k, kind: 'ask', title: 'Check de agenda pendente', body: 'Confira se todas as reuniões de hoje e amanhã do Daxiang estão no tracker.', ref: { type: 'route', route: 'hoje' } });
  }
  const dk = `digest:${dayKey(now)}`;
  if (now.getHours() >= s.digestHour && now.getHours() < 12 && !last(dk)) {
    const today = leadToday(state, now);
    const empty = today.filter((o) => !hasAgenda(o)).length;
    const due = state.items.filter((i) => isMine(i) && isOpen(i) && i.deadline && dayKey(i.deadline) === dayKey(now)).length;
    const fus = state.items.filter((i) => followUp(i, s, now)?.needs).length;
    if (today.length || due || fus) {
      const parts = [];
      if (today.length) parts.push(`${today.length} reuni${today.length > 1 ? 'ões' : 'ão'} que você lidera${empty ? ` (${empty} sem pauta)` : ''}`);
      if (due) parts.push(`${due} entrega${due > 1 ? 's' : ''}`);
      if (fus) parts.push(`${fus} follow-up${fus > 1 ? 's' : ''}`);
      fire.push({ key: dk, kind: 'digest', title: 'Seu dia', body: parts.join(' · '), ref: { type: 'route', route: 'hoje' } });
    }
  }
  // 4) Pautas não discutidas passam para a próxima ocorrência
  // Vale para cada pauta individualmente: uma pauta escrita depois do fim da reunião também passa.
  // Não mexe na reunião aberta na tela (para não copiar texto pela metade), exceto ao tocar em "Encerrar".
  const d = U().drawer; const openKey = d && d.type === 'occ' ? d.key : null;
  for (const [key, rec] of Object.entries(state.occ)) {
    if (!(rec.agenda || []).some(needsCarry)) continue;
    const o = occurrenceByKey(state, key);
    if (!o) continue;
    if (o.end > now && !rec.closed) continue;
    if (key === openKey && key !== force) continue;
    const nx = nextOccurrence(o.series, o.end);
    if (!nx) continue;
    carry.push({ o, nx });
  }

  if (!fire.length && !carry.length) return;
  mutate((st) => {
    for (const n of fire) {
      st.log[n.key] = now.toISOString();
      st.notifs.unshift({ id: uid(), ...n, at: now.toISOString(), read: false });
      osNotify(n);
    }
    st.notifs = st.notifs.slice(0, 80);
    for (const { o, nx } of carry) {
      const rec = ensureOcc(st, o.key); rec.carried = true;
      const pending = rec.agenda.filter(needsCarry);
      if (!pending.length) continue;
      const nrec = ensureOcc(st, nx.key);
      for (const a of pending) {
        if (nrec.agenda.some((x) => x.carriedId === a.id)) continue;
        nrec.agenda.push({ ...a, id: uid(), carriedId: a.id, carriedFrom: dayKey(o.start), discussed: false });
        a.carriedTo = nx.key;
      }
    }
  });
}

export const unread = () => S().notifs.filter((n) => !n.read).length;
export { D };
