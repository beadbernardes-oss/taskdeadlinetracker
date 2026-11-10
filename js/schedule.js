// Agenda de alertas futuros, calculada no aparelho (no fuso da usuária).
// O Supabase só precisa disparar cada linha quando fire_at chegar — sem lógica de fuso no servidor.
import { H, D, addDays, startOfDay, dayKey, fmtTime, fmtDate, fmtDateTime, inQuiet } from './util.js';
import { alertTime, preMeetingTime, isOpen, isMine, hasAgenda } from './engine.js';
import { occurrencesBetween } from './meetings.js';

const HORIZON_DAYS = 14;

export function buildSchedule(state, now = new Date()) {
  const s = state.settings;
  const end = addDays(now, HORIZON_DAYS);
  const out = [];
  const add = (at, a) => { if (at > now && at < end) out.push({ ...a, fire_at: new Date(at).toISOString() }); };
  // Repetições pulam o silêncio
  const repeats = (from, until, step, fn) => {
    let k = 0;
    for (let t = +from; t < +until && k < 40; t += step) { if (!inQuiet(t, s)) fn(new Date(t), k); k++; }
  };

  for (const i of state.items) {
    if (!isOpen(i) || !i.deadline) continue;
    const dl = new Date(i.deadline);
    // 1) Minhas entregas: pergunta 24h antes (+ repetição) e depois do prazo
    if (isMine(i) && i.subtype !== 'inform') {
      if (i.ans !== i.deadline) {
        repeats(alertTime(i.deadline, s), dl, s.repeatHours * H, (t, k) => add(t, {
          key: `ask:${i.id}:${i.deadline}:${k}`, kind: 'ask', title: 'Vou conseguir entregar no prazo?',
          body: `${i.title} · vence ${fmtDateTime(dl)}`, ref: { type: 'ask', id: i.id },
        }));
      }
      repeats(dl, +dl + 3 * D, s.repeatHours * H, (t, k) => add(t, {
        key: `overdue:${i.id}:${i.deadline}:${k}`, kind: 'ask', title: 'Prazo vencido: você entregou?',
        body: i.title, ref: { type: 'ask', id: i.id },
      }));
    }
    // 2) Aviso aos stakeholders
    if (i.subtype === 'inform') add(dl, { key: `due:${i.id}:${i.deadline}`, kind: 'inform', title: 'Avise os stakeholders', body: i.title, ref: { type: 'item', id: i.id } });
    // 3) Terceiros: D-2, no dia e diário após vencer (às 9h)
    if (i.owner === 'other') {
      const at9 = (day) => { const d = startOfDay(day); d.setHours(s.followUpHour, 0, 0, 0); return d; };
      const stages = [[at9(addDays(dl, -s.followUpDaysBefore)), `Prazo em ${s.followUpDaysBefore} dias`]];
      let dayOf = at9(dl); if (dayOf > dl) dayOf = new Date(+dl - H);
      stages.push([dayOf, 'Vence hoje']);
      for (let k = 1; k <= 7; k++) stages.push([at9(addDays(dl, k)), 'Atrasado']);
      for (const [at, label] of stages) {
        add(at, { key: `fu:${i.id}:${+at}`, kind: 'fu', title: `Follow-up com ${i.ownerName || 'terceiro'}`, body: `${label}: ${i.title}`, ref: { type: 'item', id: i.id } });
      }
    }
  }

  // 4) Reuniões que lidero sem pauta
  for (const o of occurrencesBetween(state, now, end, { leadOnly: true })) {
    if (hasAgenda(o)) continue;
    add(preMeetingTime(o.start, s), { key: `pre:${o.key}`, kind: 'meeting', title: `Reunião às ${fmtTime(o.start)} sem pauta`, body: `${o.series.title} (${fmtDate(o.start)}) — você é a lead.`, ref: { type: 'occ', key: o.key } });
  }

  // 5) Resumo do dia e check de agenda
  for (let d = 0; d <= HORIZON_DAYS; d++) {
    const day = addDays(startOfDay(now), d); const dk = dayKey(day);
    const at = new Date(day); at.setHours(s.digestHour, 0, 0, 0);
    const meetings = occurrencesBetween(state, day, addDays(day, 1), { leadOnly: true });
    const due = state.items.filter((i) => isMine(i) && isOpen(i) && i.deadline && dayKey(i.deadline) === dk).length;
    if (meetings.length || due) {
      const parts = [];
      if (meetings.length) parts.push(`${meetings.length} reuni${meetings.length > 1 ? 'ões' : 'ão'} que você lidera`);
      if (due) parts.push(`${due} entrega${due > 1 ? 's' : ''}`);
      add(at, { key: `digest:${dk}`, kind: 'digest', title: 'Seu dia', body: parts.join(' · '), ref: { type: 'route', route: 'hoje' } });
    }
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    if (s.agendaCheck && !(s.agendaCheckDays === 'weekdays' && weekend) && !(state.agendaChecks || {})[dk]) {
      const stop = new Date(day); stop.setHours(s.quietStart, 0, 0, 0);
      repeats(at, stop, s.repeatHours * H, (t, k) => add(t, { key: `agcheck:${dk}:${k}`, kind: 'ask', title: 'Check de agenda pendente', body: 'Confira se todas as reuniões de hoje e amanhã do Daxiang estão no tracker.', ref: { type: 'route', route: 'hoje' } }));
    }
  }
  return out;
}
