// Preparação recorrente de reunião: uma task sua antes de cada ocorrência (ex.: atualizar o doc da OB Weekly).
// Existe sempre só a task da próxima ocorrência; a seguinte nasce quando a reunião passa.
import { M, D, addDays, uid } from './util.js';
import { expand, occurrenceByKey } from './meetings.js';

// series.prep = [{ id, title, link, offsetMin, priority, macrotemaId, askSkipWeekend }]
// item.prep = { sid, pid, occ }  ·  state.prepLog = { 'pid|occKey': ISO criado }
export function prepOps(state, now = new Date()) {
  const ops = [];
  const log = state.prepLog || {};
  for (const s of state.series) {
    if (!(s.prep || []).length) continue;
    const next = s.hidden ? null : expand(s, now, addDays(now, 60)).find((o) => o.start > now) || null;
    for (const p of s.prep) {
      // Tasks abertas desta preparação: acompanha mudanças de horário e cancelamentos no Daxiang
      for (const it of state.items) {
        if (it.prep?.pid !== p.id || it.status === 'done') continue;
        const touched = (it.postponements || []).length > 0;
        const o = occurrenceByKey(state, it.prep.occ);
        if (!o) { if (!touched && new Date(it.deadline) > now) ops.push({ op: 'del', id: it.id }); continue; }
        const dl = new Date(+o.start - (p.offsetMin || 0) * M).toISOString();
        const patch = {};
        if (!touched && it.deadline !== dl) Object.assign(patch, { deadline: dl, originalDeadline: dl });
        if (it.askSkipWeekend !== !!p.askSkipWeekend) patch.askSkipWeekend = !!p.askSkipWeekend;
        if (Object.keys(patch).length) ops.push({ op: 'upd', id: it.id, patch });
      }
      if (!next) continue;
      const lk = `${p.id}|${next.key}`;
      if (log[lk] || state.items.some((i) => i.prep?.pid === p.id && i.prep.occ === next.key)) continue;
      const dl = new Date(+next.start - (p.offsetMin || 0) * M).toISOString();
      ops.push({ op: 'add', lk, item: {
        title: p.title || `Preparar ${s.title}`, link: p.link || '', deadline: dl, originalDeadline: dl,
        priority: p.priority ?? 1, macrotemaId: p.macrotemaId ?? s.macrotemaId ?? null,
        askSkipWeekend: !!p.askSkipWeekend, prep: { sid: s.id, pid: p.id, occ: next.key },
      } });
    }
  }
  return ops;
}

export function applyPrepOps(st, ops, newItem, now = new Date()) {
  st.prepLog = st.prepLog || {};
  for (const o of ops) {
    if (o.op === 'add') { st.items.push(newItem(o.item)); st.prepLog[o.lk] = now.toISOString(); }
    if (o.op === 'del') st.items = st.items.filter((i) => i.id !== o.id);
    if (o.op === 'upd') { const it = st.items.find((i) => i.id === o.id); if (it) Object.assign(it, o.patch); }
  }
  // registro enxuto: esquece criações com mais de 90 dias
  for (const [k, v] of Object.entries(st.prepLog)) if (now - new Date(v) > 90 * D) delete st.prepLog[k];
}

export const newPrep = () => ({ id: uid(), title: '', link: '', offsetMin: 60, priority: 1, macrotemaId: null, askSkipWeekend: true });
