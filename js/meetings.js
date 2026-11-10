import { M, D, addDays, startOfDay, dayKey, parseDayKey, WD, fmtTime, nameKey } from './util.js';

// ---------- Recorrência ----------
// recur: { freq: 'none'|'daily'|'weekly'|'monthly', interval, byDay:[0-6], until, count, exdates:[dayKey] }

export function expand(series, from, to) {
  const out = [];
  const start = new Date(series.start);
  const dur = (series.durationMin || 30) * M;
  const r = series.recur || { freq: 'none' };
  const ex = new Set(r.exdates || []);
  const until = r.until ? new Date(r.until) : null;
  const max = r.count || Infinity;
  let count = 0;
  const atTime = (day) => { const d = new Date(day); d.setHours(start.getHours(), start.getMinutes(), 0, 0); return d; };
  const push = (d) => {
    count++;
    if (d >= from && d < to && !ex.has(dayKey(d))) out.push({ key: `${series.id}|${dayKey(d)}`, start: d, end: new Date(+d + dur), series });
  };
  if (!r.freq || r.freq === 'none') { push(start); return out; }
  const iv = Math.max(1, r.interval || 1);
  let guard = 0;
  if (r.freq === 'daily') {
    for (let d = new Date(start); guard++ < 5000; d = atTime(addDays(d, iv))) {
      if (d >= to || (until && d > until) || count >= max) break;
      push(d);
    }
  } else if (r.freq === 'weekly') {
    const days = (r.byDay && r.byDay.length ? r.byDay : [start.getDay()]).slice().sort((a, b) => a - b);
    const ws = addDays(startOfDay(start), -start.getDay());
    outer: for (let w = 0; guard++ < 2000; w += iv) {
      for (const wd of days) {
        const d = atTime(addDays(ws, w * 7 + wd));
        if (d < start) continue;
        if (d >= to || (until && d > until) || count >= max) break outer;
        push(d);
      }
    }
  } else if (r.freq === 'monthly') {
    for (let m = 0; guard++ < 1000; m += iv) {
      const d = new Date(start.getFullYear(), start.getMonth() + m, 1, start.getHours(), start.getMinutes());
      const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      if (start.getDate() > dim) continue;
      d.setDate(start.getDate());
      if (d >= to || (until && d > until) || count >= max) break;
      push(d);
    }
  }
  return out;
}

export function occurrencesBetween(state, from, to, { leadOnly = false } = {}) {
  return state.series
    .filter((s) => !leadOnly || s.lead)
    .flatMap((s) => expand(s, from, to))
    .map((o) => ({ ...o, rec: state.occ[o.key] }))
    .sort((a, b) => a.start - b.start);
}

export function occurrenceByKey(state, key) {
  const [sid, dk] = key.split('|');
  const s = state.series.find((x) => x.id === sid);
  if (!s) return null;
  const day = parseDayKey(dk);
  const o = expand(s, day, addDays(day, 1))[0];
  return o ? { ...o, rec: state.occ[o.key] } : null;
}

export function nextOccurrence(series, after) {
  return expand(series, new Date(+new Date(after) + 1), addDays(after, 400))[0] || null;
}

export function ensureOcc(state, key) {
  if (!state.occ[key]) state.occ[key] = { agenda: [], notes: '', closed: false, carried: false };
  return state.occ[key];
}

export function recurText(s) {
  const r = s.recur || {};
  const t = fmtTime(s.start);
  if (!r.freq || r.freq === 'none') return `Única · ${t}`;
  const iv = r.interval || 1;
  if (r.freq === 'daily') return `${iv > 1 ? `A cada ${iv} dias` : 'Diária'} · ${t}`;
  if (r.freq === 'weekly') {
    const days = (r.byDay && r.byDay.length ? r.byDay : [new Date(s.start).getDay()]).slice().sort();
    const ds = days.join(',') === '1,2,3,4,5' ? 'dias úteis' : days.map((d) => WD[d]).join(', ');
    return `${iv === 2 ? 'Quinzenal' : iv > 1 ? `A cada ${iv} semanas` : 'Semanal'} (${ds}) · ${t}`;
  }
  if (r.freq === 'monthly') return `Mensal, dia ${new Date(s.start).getDate()} · ${t}`;
  return t;
}

export const hasPerson = (series, name) => (series.participants || []).some((p) => nameKey(p) === nameKey(name));

// ---------- Importação .ics ----------
const WIN_TZ = {
  'China Standard Time': 'Asia/Shanghai', 'E. South America Standard Time': 'America/Sao_Paulo',
  'SA Eastern Standard Time': 'America/Fortaleza', 'Singapore Standard Time': 'Asia/Singapore',
  'Tokyo Standard Time': 'Asia/Tokyo', 'UTC': 'UTC', 'GMT Standard Time': 'Europe/London',
  'Eastern Standard Time': 'America/New_York', 'Pacific Standard Time': 'America/Los_Angeles',
};

function tzOffsetMs(utcMs, tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - utcMs;
}

function parseIcsDate(val, params = {}) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(val.trim());
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0', s = '0', z] = m;
  const wallDay = new Date(+y, +mo - 1, +d).getDay();
  if (!m[4]) return { date: new Date(+y, +mo - 1, +d, 9, 0), wallDay, allDay: true };
  const guess = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  if (z) return { date: new Date(guess), wallDay };
  const tzid = params.TZID && (WIN_TZ[params.TZID.replace(/"/g, '')] || params.TZID.replace(/"/g, ''));
  if (tzid) {
    try {
      const off = tzOffsetMs(guess, tzid); let t = guess - off;
      const off2 = tzOffsetMs(t, tzid); if (off2 !== off) t = guess - off2;
      return { date: new Date(t), wallDay };
    } catch { /* fuso desconhecido: usa horário local */ }
  }
  return { date: new Date(+y, +mo - 1, +d, +h, +mi, +s), wallDay };
}

const unesc = (s) => (s || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
const DAYCODE = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

export function parseICS(text) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const raw = []; let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = { EXDATE: [], ATTENDEE: [] }; continue; }
    if (line === 'END:VEVENT') { if (cur) raw.push(cur); cur = null; continue; }
    if (!cur) continue;
    const i = line.indexOf(':'); if (i < 0) continue;
    const [name, ...ps] = line.slice(0, i).split(';');
    const params = Object.fromEntries(ps.map((p) => { const j = p.indexOf('='); return [p.slice(0, j).toUpperCase(), p.slice(j + 1)]; }));
    const val = line.slice(i + 1);
    const key = name.toUpperCase();
    if (key === 'EXDATE') cur.EXDATE.push({ val, params });
    else if (key === 'ATTENDEE') cur.ATTENDEE.push({ val, params });
    else cur[key] = { val, params };
  }
  const events = [];
  for (const e of raw) {
    if (!e.DTSTART) continue;
    if ((e.STATUS?.val || '').toUpperCase() === 'CANCELLED') continue;
    const st = parseIcsDate(e.DTSTART.val, e.DTSTART.params); if (!st) continue;
    const en = e.DTEND ? parseIcsDate(e.DTEND.val, e.DTEND.params) : null;
    const durationMin = en ? Math.max(15, Math.round((en.date - st.date) / M)) : 30;
    let recur = { freq: 'none' };
    if (e.RRULE) {
      const rr = Object.fromEntries(e.RRULE.val.split(';').map((kv) => kv.split('=')));
      const freq = (rr.FREQ || '').toLowerCase();
      if (['daily', 'weekly', 'monthly'].includes(freq)) {
        const shift = (st.date.getDay() - st.wallDay + 7) % 7; // dia muda ao converter fuso
        recur = {
          freq, interval: +rr.INTERVAL || 1,
          byDay: rr.BYDAY && freq === 'weekly' ? rr.BYDAY.split(',').map((c) => (DAYCODE[c.slice(-2)] + shift) % 7) : [],
          until: rr.UNTIL ? parseIcsDate(rr.UNTIL)?.date?.toISOString() : null,
          count: rr.COUNT ? +rr.COUNT : null,
          exdates: [],
        };
      }
    }
    recur.exdates = e.EXDATE.flatMap((x) => x.val.split(',').map((v) => parseIcsDate(v, x.params)).filter(Boolean).map((p) => dayKey(p.date)));
    const org = e.ORGANIZER ? e.ORGANIZER.val.replace(/^mailto:/i, '') : '';
    events.push({
      uid: e.UID?.val || `${e.SUMMARY?.val}-${e.DTSTART.val}`,
      recurrenceId: e['RECURRENCE-ID'] ? parseIcsDate(e['RECURRENCE-ID'].val, e['RECURRENCE-ID'].params)?.date : null,
      title: unesc(e.SUMMARY?.val) || '(sem título)',
      start: st.date.toISOString(), durationMin, recur,
      organizer: org.toLowerCase(),
      organizerName: e.ORGANIZER?.params?.CN?.replace(/"/g, '') || '',
      participants: e.ATTENDEE.map((a) => (a.params.CN || a.val.replace(/^mailto:/i, '')).replace(/"/g, '')).filter(Boolean),
      link: unesc(e.LOCATION?.val || e.URL?.val || ''),
    });
  }
  // Ocorrências alteradas viram exceção na série + reunião única
  const masters = events.filter((e) => !e.recurrenceId);
  for (const ov of events.filter((e) => e.recurrenceId)) {
    const m = masters.find((x) => x.uid === ov.uid);
    if (m) { m.recur.exdates.push(dayKey(ov.recurrenceId)); m.overrides = [...(m.overrides || []), ov]; }
    else masters.push({ ...ov, recurrenceId: null, uid: `${ov.uid}#${dayKey(ov.start)}` });
  }
  return masters;
}

export function isFutureRelevant(ev, now = new Date()) {
  const fake = { id: 'x', ...ev };
  return expand(fake, startOfDay(now), addDays(now, 120)).length > 0;
}

export const DAY_MS = D;
