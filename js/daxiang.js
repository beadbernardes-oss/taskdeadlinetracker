// Integração com o Daxiang: o script do computador envia a agenda (feed) para o Supabase,
// e aqui o app transforma o feed em séries de reunião, preservando lead, pautas e macrotema.
import { uid, dayKey } from './util.js';
import { expand } from './meetings.js';

const norm = (t) => (t || '').toLowerCase().replace(/\s+/g, ' ').trim();
const MAX_PAST_SEED = 400; // dias de histórico preservados ao converter uma série manual

// feed: { from, to, syncedAt, events: [{ sid, title, s, m, org, people:[nomes], link }] }
// Retorna true se mudou algo no estado.
export function applyFeed(state, feed) {
  if (!feed || !Array.isArray(feed.events)) return false;
  const snap = () => JSON.stringify([state.series, state.occ]);
  const before = snap();
  const from = new Date(feed.from); const to = new Date(feed.to);
  const inWin = (iso) => { const d = new Date(iso); return d >= from && d < to; };

  // Agrupa ocorrências por série do Daxiang
  const groups = new Map();
  for (const e of feed.events) {
    if (!groups.has(e.sid)) groups.set(e.sid, []);
    groups.get(e.sid).push(e);
  }
  for (const g of groups.values()) g.sort((a, b) => (a.s < b.s ? -1 : 1));

  const linked = new Set(state.series.filter((s) => s.dx).map((s) => s.dx));
  const ids = (x) => [x.dx, ...(x.dxMore || [])];
  const groupOf = (x) => ids(x).flatMap((id) => groups.get(id) || []);
  const now = new Date();
  // Primeiro as séries já conhecidas; por último as novas (que podem ser continuação de uma antiga)
  const order = [...groups.keys()].sort((a, b) => {
    const ka = state.series.some((x) => ids(x).includes(a)) ? 0 : 1, kb = state.series.some((x) => ids(x).includes(b)) ? 0 : 1;
    return ka - kb || (groups.get(a)[0].s < groups.get(b)[0].s ? -1 : 1); // mais antigas primeiro
  });
  for (const sid of order) {
    const evs = groups.get(sid);
    const last = evs[evs.length - 1];
    let s = state.series.find((x) => ids(x).includes(sid));
    let cont = false;
    if (!s) s = matchManual(state, evs, from, to, linked);
    if (!s) { s = matchContinuation(state, evs, groupOf, now); if (s) { s.dxMore = [...(s.dxMore || []), sid]; cont = true; } }
    if (!s) {
      s = { id: uid(), source: 'daxiang', title: last.title, start: evs[0].s, durationMin: evs[0].m || 30,
        recur: { freq: 'dates', dates: [], exdates: [] }, lead: !!last.org && (last.people || []).length > 0, participants: [], macrotemaId: null, link: '',
        // compromissos só seus (almoço, terapia…) e bloqueios de dia inteiro (férias de alguém) entram ocultos
        hidden: !(last.people || []).length || (last.m || 0) >= 480 };
      state.series.push(s);
    }
    if (!s.dx) { // série criada à mão: vira série do Daxiang preservando o histórico
      s.dx = sid; linked.add(sid);
      if (s.recur?.freq !== 'dates') {
        const seedFrom = new Date(Math.max(+new Date(s.start), +from - MAX_PAST_SEED * 864e5));
        const past = expand(s, seedFrom, to).map((o) => ({ s: o.start.toISOString(), m: s.durationMin }));
        s.recur = { freq: 'dates', dates: past, exdates: s.recur?.exdates || [] };
      }
    }
    // Só séries criadas pelo Daxiang seguem o nome de lá; as que você cadastrou mantêm o seu nome
    if (!cont && sid === s.dx && s.source === 'daxiang') s.title = last.title || s.title;
    s.participants = last.people || s.participants;
    if (last.link) s.link = last.link;
    setDates(state, s, groupOf(s).map((e) => ({ s: e.s, m: e.m })), inWin);
    s.start = s.recur.dates[0].s;
    s.durationMin = last.m || s.durationMin;
  }

  // Séries do Daxiang que sumiram da janela: ocorrências canceladas
  for (const s of state.series) {
    if (!s.dx || ids(s).some((id) => groups.has(id))) continue;
    setDates(state, s, [], inWin);
  }
  state.series = state.series.filter((s) => {
    if (!s.dx || (s.recur.dates || []).length) return true;
    return Object.keys(state.occ).some((k) => k.startsWith(`${s.id}|`)); // mantém se tem pauta/notas
  });
  return snap() !== before;
}

// Troca as datas da janela pelas do Daxiang. Ocorrência cancelada que tinha pauta:
// a pauta vai para a próxima ocorrência; se não houver próxima, a data fica (para nada se perder).
function setDates(state, s, fresh, inWin) {
  const old = s.recur.dates || [];
  const freshDays = new Set(fresh.map((x) => dayKey(new Date(x.s))));
  const keep = old.filter((x) => !inWin(x.s));
  let all = [...keep, ...fresh].sort((a, b) => (a.s < b.s ? -1 : 1));
  for (const x of old.filter((y) => inWin(y.s))) {
    const dk = dayKey(new Date(x.s));
    if (freshDays.has(dk)) continue; // continua existindo
    const key = `${s.id}|${dk}`; const rec = state.occ[key];
    const pending = (rec?.agenda || []).filter((a) => (a.text || '').trim() && !a.discussed && !a.carriedTo);
    if (!rec || (!pending.length && !(rec.notes || '').trim())) continue; // nada a preservar
    const next = all.find((y) => y.s > x.s && new Date(y.s) > new Date());
    if (next && !(rec.notes || '').trim()) {
      const nkey = `${s.id}|${dayKey(new Date(next.s))}`;
      if (!state.occ[nkey]) state.occ[nkey] = { agenda: [], notes: '', closed: false, carried: false };
      const nrec = state.occ[nkey];
      for (const a of pending) if (!nrec.agenda.some((b) => b.id === a.id || b.carriedId === a.id || (a.carriedId && b.carriedId === a.carriedId))) nrec.agenda.push(a);
      delete state.occ[key];
    } else {
      all.push(x); all.sort((a, b) => (a.s < b.s ? -1 : 1)); // mantém a data
    }
  }
  s.recur.dates = all;
}

// Série nova no Daxiang que substitui uma antiga (mesmo dia da semana e horário, começa depois que a antiga acabou)
function matchContinuation(state, evs, groupOf, now) {
  const f = new Date(evs[0].s);
  const slot = (d) => `${d.getDay()}-${d.getHours()}:${d.getMinutes()}`;
  const c = state.series.filter((s) => {
    if (!s.dx || s.hidden) return false;
    const mine = groupOf(s);
    if (mine.some((e) => new Date(e.s) > now && new Date(e.s) >= f)) return false; // a antiga ainda continua
    const last = (s.recur.dates || []).map((x) => new Date(x.s)).filter((d) => d < f).sort((a, b) => b - a)[0];
    return last && slot(last) === slot(f) && f - last <= 35 * 864e5;
  });
  return c.length === 1 ? c[0] : null;
}

// Liga uma série criada à mão à série do Daxiang: mesmo nome, ou mesmo horário exato de uma ocorrência.
function matchManual(state, evs, from, to, linked) {
  const free = state.series.filter((s) => !s.dx);
  const byTitle = free.filter((s) => norm(s.title) === norm(evs[evs.length - 1].title));
  if (byTitle.length === 1) return byTitle[0];
  const starts = new Set(evs.map((e) => +new Date(e.s)));
  const byTime = free.filter((s) => expand(s, from, to).some((o) => starts.has(+o.start)));
  return byTime.length === 1 ? byTime[0] : null;
}

export const dxDay = (iso) => dayKey(new Date(iso));
