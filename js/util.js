export const M = 60e3, H = 60 * M, D = 24 * H;

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
export const pad = (n) => String(n).padStart(2, '0');

export const dayKey = (d) => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const parseDayKey = (k) => { const [y, m, dd] = k.split('-').map(Number); return new Date(y, m - 1, dd); };
export const startOfDay = (d) => { d = new Date(d); d.setHours(0, 0, 0, 0); return d; };
export const addDays = (d, n) => { d = new Date(d); d.setDate(d.getDate() + n); return d; };
export const startOfWeek = (d) => { d = startOfDay(d); return addDays(d, -((d.getDay() + 6) % 7)); }; // segunda
export const sameDay = (a, b) => dayKey(a) === dayKey(b);
export const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / D);

export const toInput = (iso) => { if (!iso) return ''; const d = new Date(iso); return `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const fromInput = (v) => (v ? new Date(v).toISOString() : null);

export const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const WDL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const MO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const MOL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export const fmtTime = (d) => { d = new Date(d); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const fmtDate = (d) => { d = new Date(d); return `${WD[d.getDay()]}, ${d.getDate()} ${MO[d.getMonth()]}`; };
export const fmtShort = (d) => { d = new Date(d); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };
export const fmtDateTime = (d) => `${fmtDate(d)} · ${fmtTime(d)}`;
export const fmtLong = (d) => { d = new Date(d); return `${WDL[d.getDay()]}, ${d.getDate()} de ${MOL[d.getMonth()]}`; };

export function fmtRel(iso, now = new Date()) {
  const d = new Date(iso); const diff = d - now;
  const dd = daysBetween(now, d);
  if (diff < 0) {
    const a = -diff;
    if (a < H) return `atrasado ${Math.max(1, Math.round(a / M))}min`;
    if (a < D) return `atrasado ${Math.round(a / H)}h`;
    return `atrasado ${Math.round(a / D)}d`;
  }
  if (dd === 0) return diff < H ? `em ${Math.max(1, Math.round(diff / M))}min` : `hoje ${fmtTime(d)}`;
  if (dd === 1) return `amanhã ${fmtTime(d)}`;
  if (dd < 7) return `${WD[d.getDay()]} ${fmtTime(d)}`;
  return `${d.getDate()} ${MO[d.getMonth()]}`;
}

export function fmtAgo(iso, now = new Date()) {
  const a = now - new Date(iso);
  if (a < H) return `há ${Math.max(1, Math.round(a / M))}min`;
  if (a < D) return `há ${Math.round(a / H)}h`;
  return `há ${Math.round(a / D)}d`;
}

// ---------- Silêncio (22h–8h por padrão) ----------
export function inQuiet(d, s) {
  const h = new Date(d).getHours();
  return s.quietStart > s.quietEnd ? (h >= s.quietStart || h < s.quietEnd) : (h >= s.quietStart && h < s.quietEnd);
}
// Regra única: alerta que cairia no silêncio é antecipado para 1h antes dele (21h).
export function anticipate(t, s) {
  const d = new Date(t);
  if (!inQuiet(d, s)) return d;
  if (d.getHours() < s.quietEnd) d.setDate(d.getDate() - 1);
  d.setHours((s.quietStart + 23) % 24, 0, 0, 0);
  return d;
}

export const normName =(s) => (s || '').trim().replace(/\s+/g, ' ');
export const nameKey = (s) => normName(s).toLowerCase();
export const initials = (s) => normName(s).split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const squash = (s) => fold(s).replace(/[^a-z0-9]/g, '');
const acronym = (s) => fold(s).split(/[\s&/_-]+/).filter(Boolean).map((w) => w[0]).join('');

export function matchMacro(tag, macros) {
  const t = squash(tag); if (!t) return null;
  return macros.find((m) => acronym(m.name) === t)
    || macros.find((m) => squash(m.name) === t)
    || macros.find((m) => squash(m.name).startsWith(t))
    || macros.find((m) => fold(m.name).split(/[\s&]+/).some((w) => squash(w).startsWith(t)))
    || null;
}

const WDMAP = { dom: 0, domingo: 0, seg: 1, segunda: 1, ter: 2, terca: 2, qua: 3, quarta: 3, qui: 4, quinta: 4, sex: 5, sexta: 5, sab: 6, sabado: 6 };

// Criação rápida: "Revisar spec sex 18h #pr !p1 @Lucas"
export function parseQuick(text, macros, defaultTime = '18:00', now = new Date()) {
  let t = ` ${text} `;
  const out = { macrotemaId: null, priority: null, ownerName: null, deadline: null, kind: 'task', tokens: [] };
  t = t.replace(/\s!p([0-3])(?=\s)/i, (_, p) => { out.priority = +p; out.tokens.push(`P${p}`); return ' '; });
  t = t.replace(/\s!marco(?=\s)/i, () => { out.kind = 'marco'; out.tokens.push('Marco'); return ' '; });
  t = t.replace(/\s@([\p{L}\p{N}_.-]+)(?=\s)/u, (_, n) => { out.ownerName = n.replace(/_/g, ' '); out.tokens.push(`@${out.ownerName}`); return ' '; });
  t = t.replace(/\s#([\p{L}\p{N}_&-]+)(?=\s)/u, (_, tag) => { const m = matchMacro(tag, macros); if (m) { out.macrotemaId = m.id; out.tokens.push(m.name); } return ' '; });

  let day = null; let time = null;
  t = t.replace(/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s)/, (_, d, m, y) => {
    let yy = y ? +y : now.getFullYear(); if (yy < 100) yy += 2000;
    day = new Date(yy, +m - 1, +d);
    if (!y && day < startOfDay(now)) day = new Date(yy + 1, +m - 1, +d);
    return ' ';
  });
  if (!day) t = t.replace(/\s(hoje|amanh[ãa])(?=\s)/i, (_, w) => { day = addDays(startOfDay(now), /hoje/i.test(w) ? 0 : 1); return ' '; });
  if (!day) t = t.replace(/\s(dom(?:ingo)?|seg(?:unda)?|ter(?:[çc]a)?|qua(?:rta)?|qui(?:nta)?|sex(?:ta)?|s[áa]b(?:ado)?)(?=\s)/i, (_, w) => {
    const target = WDMAP[fold(w)] ?? WDMAP[fold(w).slice(0, 3)];
    if (target === undefined) return _;
    day = addDays(startOfDay(now), (target - now.getDay() + 7) % 7); return ' ';
  });
  t = t.replace(/\s(\d{1,2})(?:h(\d{2})?|:(\d{2}))(?=\s)/i, (_, h, m1, m2) => { time = [+h, +(m1 || m2 || 0)]; return ' '; });
  if (day || time) {
    const d = day ? new Date(day) : startOfDay(now);
    const [dh, dm] = time || defaultTime.split(':').map(Number);
    d.setHours(dh, dm, 0, 0);
    if (!day && d < now) d.setDate(d.getDate() + 1);
    out.deadline = d.toISOString();
    out.tokens.push(fmtDateTime(d));
  }
  out.title = t.replace(/\s+/g, ' ').trim();
  return out;
}

export function download(name, text, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}
