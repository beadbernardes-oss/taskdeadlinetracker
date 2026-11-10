import { html, useState, useRef, useEffect } from './lib.js';
import { S, U, setUI } from './store.js';
import { fmtRel, initials, nameKey, normName } from './util.js';
import { followUp, risk, isOpen } from './engine.js';

const P = {
  plus: 'M5 12h14M12 5v14', x: 'M18 6 6 18M6 6l12 12', check: 'M20 6 9 17l-5-5',
  left: 'm15 18-6-6 6-6', right: 'm9 18 6-6-6-6', down: 'm6 9 6 6 6-6',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  board: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 3v18M15 3v18',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  doc: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  alert: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  trash: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  repeat: 'M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  msg: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  diamond: 'M12 2 22 12 12 22 2 12z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  filter: 'M22 3H2l8 9.46V19l4 2v-8.54z',
  arrow: 'M5 12h14M12 5l7 7-7 7',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  play: 'M5 3l14 9-14 9z',
};
export const Icon = ({ n, s = 18, cls = '' }) => html`<svg class=${`ic ${cls}`} width=${s} height=${s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${P[n]} /></svg>`;

export const PRIO_LABEL = ['P0', 'P1', 'P2', 'P3'];
export const Prio = ({ p }) => html`<span class=${`prio prio-${p}`}>P${p}</span>`;

export function MacroPill({ id }) {
  const m = S().macrotemas.find((x) => x.id === id);
  if (!m) return null;
  return html`<span class="macro" style=${`--mc:${m.color}`}><i></i>${m.name}</span>`;
}

export function Avatar({ name, size = 22 }) {
  return html`<span class="avatar" style=${`width:${size}px;height:${size}px;font-size:${size * 0.42}px`} title=${name}>${initials(name)}</span>`;
}

export const openItem = (id) => setUI({ drawer: { type: 'item', id } });
export const openOcc = (key) => setUI({ drawer: { type: 'occ', key } });
export const openNew = (preset = {}) => setUI({ drawer: { type: 'new', preset } });
export const openModal = (modal) => setUI({ modal });
export const closeModal = () => setUI({ modal: null });

export function Card({ item, now = new Date(), showOwner = true }) {
  const st = S();
  const overdue = item.deadline && isOpen(item) && new Date(item.deadline) < now;
  const r = risk(item, st, now);
  const fu = followUp(item, st.settings, now);
  const subs = st.items.filter((x) => x.parentId === item.id);
  const parent = item.parentId && st.items.find((x) => x.id === item.parentId);
  const pp = (item.postponements || []).length;
  return html`<div class=${`card pb-${item.priority} ${item.status === 'done' ? 'is-done' : ''}`} draggable="true"
      onDragStart=${(e) => { e.dataTransfer.setData('text/plain', item.id); e.dataTransfer.effectAllowed = 'move'; e.currentTarget.classList.add('dragging'); }}
      onDragEnd=${(e) => e.currentTarget.classList.remove('dragging')}
      onClick=${() => openItem(item.id)} role="button" tabindex="0"
      onKeyDown=${(e) => { if (e.key === 'Enter') openItem(item.id); }}>
    ${parent && html`<div class="card-parent">↳ ${parent.title}</div>`}
    <div class="card-title">
      ${item.kind === 'marco' && html`<span class="marco-ic" title="Marco"><${Icon} n="diamond" s=${12} /></span>`}
      ${item.subtype === 'inform' && html`<span class="marco-ic inform" title="Avisar stakeholders"><${Icon} n="msg" s=${12} /></span>`}
      <span>${item.title || 'Sem título'}</span>
    </div>
    <div class="card-meta">
      <${Prio} p=${item.priority} />
      <${MacroPill} id=${item.macrotemaId} />
      ${item.deadline && html`<span class=${`due ${overdue ? 'late' : ''}`}><${Icon} n="clock" s=${12} />${fmtRel(item.deadline, now)}</span>`}
      ${showOwner && item.owner === 'other' && html`<span class="owner"><${Avatar} name=${item.ownerName} size=${18} />${item.ownerName}</span>`}
    </div>
    ${(pp || r.length || fu?.needs || subs.length) ? html`<div class="card-flags">
      ${pp > 0 && html`<span class="flag warn">Adiado ${pp}x</span>`}
      ${r.length > 0 && html`<span class="flag danger" title=${r.join('\n')}>Em risco</span>`}
      ${fu?.needs && html`<span class="flag info">Follow-up</span>`}
      ${subs.length > 0 && html`<span class="flag">${subs.filter((x) => x.status === 'done').length}/${subs.length} sub-tasks</span>`}
    </div>` : null}
  </div>`;
}

// Textarea que cresce com o conteúdo
export function AutoText({ value, onInput, cls = '', placeholder = '' }) {
  const ref = useRef();
  const fit = () => { const el = ref.current; if (!el) return; el.style.height = 'auto'; if (el.scrollHeight) el.style.height = `${el.scrollHeight}px`; };
  useEffect(() => { fit(); const r = requestAnimationFrame(fit); const t = setTimeout(fit, 260); return () => { cancelAnimationFrame(r); clearTimeout(t); }; }, [value]);
  return html`<textarea ref=${ref} rows="1" class=${cls} placeholder=${placeholder} value=${value} onInput=${(e) => { onInput(e); fit(); }}></textarea>`;
}

export function Empty({ text, icon = 'check' }) {
  return html`<div class="empty"><${Icon} n=${icon} s=${16} /><span>${text}</span></div>`;
}

// Campo de nomes (stakeholders, participantes) com sugestões
export function PeopleInput({ value = [], onChange, placeholder = 'Adicionar nome e Enter', suggestions = [] }) {
  const [t, setT] = useState('');
  const add = (n) => {
    n = normName(n); if (!n) return;
    if (!value.some((v) => nameKey(v) === nameKey(n))) onChange([...value, n]);
    setT('');
  };
  const [listId] = useState(() => `pl-${Math.random().toString(36).slice(2, 7)}`);
  return html`<div class="chips-input">
    ${value.map((v) => html`<span class="chip"><${Avatar} name=${v} size=${16} />${v}<button type="button" class="chip-x" aria-label=${`Remover ${v}`} onClick=${() => onChange(value.filter((x) => x !== v))}><${Icon} n="x" s=${12} /></button></span>`)}
    <input value=${t} list=${listId} placeholder=${value.length ? '' : placeholder}
      onInput=${(e) => setT(e.target.value)}
      onKeyDown=${(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(t); } else if (e.key === 'Backspace' && !t && value.length) onChange(value.slice(0, -1)); }}
      onBlur=${() => add(t)} />
    <datalist id=${listId}>${suggestions.filter((s) => !value.some((v) => nameKey(v) === nameKey(s))).map((s) => html`<option value=${s} />`)}</datalist>
  </div>`;
}

export function Seg({ value, options, onChange, small }) {
  return html`<div class=${`seg ${small ? 'seg-sm' : ''}`} role="radiogroup">
    ${options.map((o) => html`<button type="button" role="radio" aria-checked=${value === o.value} class=${`${value === o.value ? 'on' : ''} ${o.cls || ''}`} onClick=${() => onChange(o.value)}>${o.label}</button>`)}
  </div>`;
}

export function PrioPicker({ value, onChange }) {
  return html`<${Seg} value=${value} onChange=${onChange} options=${[0, 1, 2, 3].map((p) => ({ value: p, label: `P${p}`, cls: `pp-${p}` }))} />`;
}

export function MacroSelect({ value, onChange, allowEmpty = true }) {
  return html`<select value=${value || ''} onChange=${(e) => onChange(e.target.value || null)}>
    ${allowEmpty && html`<option value="">Sem macrotema</option>`}
    ${S().macrotemas.map((m) => html`<option value=${m.id}>${m.name}</option>`)}
  </select>`;
}

export function Section({ title, count, icon, children, action, tone }) {
  return html`<section class=${`sect ${tone ? `tone-${tone}` : ''}`}>
    <header class="sect-h">
      ${icon && html`<${Icon} n=${icon} s=${16} />`}
      <h3>${title}</h3>${count != null && html`<span class="count">${count}</span>`}
      <div class="grow"></div>${action}
    </header>
    <div class="sect-b">${children}</div>
  </section>`;
}

export function applyFilters(items) {
  const f = U().filters;
  const q = f.q.trim().toLowerCase();
  return items.filter((i) => (f.owner === 'all' || i.owner === f.owner)
    && (!f.prios.length || f.prios.includes(i.priority))
    && (!f.macros.length || f.macros.includes(i.macrotemaId))
    && (!q || `${i.title} ${i.ownerName} ${i.notes} ${(i.stakeholders || []).join(' ')}`.toLowerCase().includes(q)));
}
