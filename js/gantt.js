// Gantt Product Requirements: entregas dos PMs agrupadas por responsável, com linha do tempo.
import { html } from './lib.js';
import { S, U, setUI, macroName } from './store.js';
import { addDays, startOfWeek, dayKey, fmtDateTime, MO, WD } from './util.js';
import { Icon, Prio, Avatar, Seg, Empty, openItem, openNew, applyFilters } from './ui.js';

const STATUS_LBL = { todo: 'A fazer', doing: 'Em andamento', waiting: 'Aguardando', done: 'Concluído' };
const isPR = (st, id) => /product requirements/i.test(macroName(id) || '');

// Entra no Gantt: marcado "Mostrar no Gantt", ou macrotema de Product Requirements (a não ser que desmarcado)
export const inGantt = (i, st = S()) => !i.parentId && i.subtype !== 'inform' && (i.gantt === true || (i.gantt !== false && isPR(st, i.macrotemaId)));

const startOf = (i) => new Date(i.start || i.createdAt || Date.now());
const ownerKey = (i) => (i.owner === 'me' ? 'Eu' : (i.ownerName || '').trim() || 'A definir');
const byDue = (a, b) => (a.deadline ? +new Date(a.deadline) : Infinity) - (b.deadline ? +new Date(b.deadline) : Infinity) || a.priority - b.priority || a.title.localeCompare(b.title);
// Dentro de cada grupo: P0 no topo, depois P1, depois P2; empate pelo prazo mais próximo
const byPrio = (a, b) => (a.priority ?? 2) - (b.priority ?? 2) || byDue(a, b);
// Tickets abertos para o time de produto (bugs) não têm MRD nem PRD: mostram só o link do ticket
export const isTicket = (i) => /tickets to product team/i.test(macroName(i.macrotemaId) || '');
const ticketUrl = (i) => (isUrl(i.link) ? i.link : ((i.notes || '').match(/https?:\/\/\S+/) || [])[0]);
const isUrl = (u) => /^https?:\/\//.test(u || '');
// MRD (você escreve) e PRD (time de produto escreve): link quando existe; pendente tracejado quando não
function DocChip({ i, kind }) {
  const url = i[kind]; const lbl = kind.toUpperCase();
  if (isUrl(url)) return html`<a class=${`g-dc on ${kind}`} href=${url} target="_blank" rel="noopener" onClick=${(ev) => ev.stopPropagation()} title=${`Abrir ${lbl}`}>${lbl}</a>`;
  const tip = kind === 'mrd' ? 'MRD pendente · você escreve (clique para adicionar o link)' : 'PRD pendente · o time de produto escreve (clique para adicionar o link)';
  return html`<button class=${`g-dc off ${kind}`} title=${tip} onClick=${(ev) => { ev.stopPropagation(); openItem(i.id); }}>${lbl}</button>`;
}
const fmtD = (d) => { d = new Date(d); return `${d.getDate()} ${MO[d.getMonth()]}`; };

function windowFor(scale, offset, now) {
  if (scale === 'day') {
    const from = addDays(startOfWeek(now), offset * 7);
    return { from, to: addDays(from, 21), cols: [...Array(21)].map((_, k) => addDays(from, k)), unit: 'day' };
  }
  const from = addDays(startOfWeek(now), (offset * 4 - 1) * 7);
  return { from, to: addDays(from, 12 * 7), cols: [...Array(12)].map((_, k) => addDays(from, k * 7)), unit: 'week' };
}

export function Gantt() {
  const st = S(); const u = U(); const now = new Date();
  const scale = u.ganttScale || 'week'; const offset = u.ganttOffset || 0; const group = u.ganttGroup || 'owner';
  const showDone = !!u.ganttDone; const collapsed = u.ganttCollapsed || {};
  const w = windowFor(scale, offset, now);
  const pct = (d) => ((+new Date(d) - +w.from) / (+w.to - +w.from)) * 100;

  const all = applyFilters(st.items).filter((i) => inGantt(i, st));
  const items = all.filter((i) => showDone || i.status !== 'done');
  const open = all.filter((i) => i.status !== 'done');
  const overdue = open.filter((i) => i.deadline && new Date(i.deadline) < now).sort(byDue);
  const invalid = open.filter((i) => i.deadline && i.start && new Date(i.start) > new Date(i.deadline));
  const tbd = open.filter((i) => !i.deadline);
  const soon = open.filter((i) => i.deadline && new Date(i.deadline) >= now && new Date(i.deadline) < addDays(now, 14)).sort(byDue);

  const groups = new Map();
  for (const i of items.sort(byPrio)) {
    const k = group === 'owner' ? ownerKey(i) : (macroName(i.macrotemaId) || 'Sem macrotema');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(i);
  }
  const gkeys = [...groups.keys()].sort((a, b) => (a === 'A definir') - (b === 'A definir') || (a === 'Eu') - (b === 'Eu') || a.localeCompare(b));
  const toggle = (k) => setUI({ ganttCollapsed: { ...collapsed, [k]: !collapsed[k] } });
  const newIn = (k) => openNew(group === 'owner'
    ? (k === 'Eu' ? { gantt: true } : { owner: 'other', ownerName: k === 'A definir' ? '' : k, status: 'doing', gantt: true, macrotemaId: st.macrotemas.find((m) => /^product requirements$/i.test(m.name))?.id || null })
    : { gantt: true, macrotemaId: st.macrotemas.find((m) => m.name === k)?.id || null });
  const todayIn = now >= w.from && now < w.to;
  const label = scale === 'day' ? `${fmtD(w.from)} – ${fmtD(addDays(w.to, -1))}` : `${fmtD(w.from)} – ${fmtD(addDays(w.to, -1))} ${w.to.getFullYear()}`;

  return html`<div class="view gantt">
    <div class="toolbar">
      <div class="nav-btns">
        <button class="btn btn-icon" aria-label="Período anterior" onClick=${() => setUI({ ganttOffset: offset - 1 })}><${Icon} n="left" /></button>
        <button class="btn btn-sm" onClick=${() => setUI({ ganttOffset: 0 })}>Hoje</button>
        <button class="btn btn-icon" aria-label="Próximo período" onClick=${() => setUI({ ganttOffset: offset + 1 })}><${Icon} n="right" /></button>
      </div>
      <h2 class="range">${label}</h2>
      <div class="grow"></div>
      <${Seg} small value=${scale} onChange=${(v) => setUI({ ganttScale: v, ganttOffset: 0 })} options=${[{ value: 'week', label: 'Semanas' }, { value: 'day', label: 'Dias' }]} />
      <${Seg} small value=${group} onChange=${(v) => setUI({ ganttGroup: v })} options=${[{ value: 'owner', label: 'Por PM' }, { value: 'macro', label: 'Por macrotema' }]} />
      <label class="check small"><input type="checkbox" checked=${showDone} onChange=${(e) => setUI({ ganttDone: e.target.checked })} />Concluídas</label>
      <button class="btn btn-sm btn-primary" onClick=${() => newIn(group === 'owner' ? 'A definir' : 'Product Requirements')}><${Icon} n="plus" s=${15} />Entrega</button>
    </div>

    <div class="g-attn">
      <div class="g-attn-col">
        <h3>Precisa de atenção <span class="count">${overdue.length + invalid.length + (tbd.length ? 1 : 0)}</span></h3>
        ${overdue.map((i) => html`<button class="g-attn-row" onClick=${() => openItem(i.id)}>
          <${Avatar} name=${ownerKey(i)} size=${20} /><b>${i.title}</b><span class="muted">${ownerKey(i)}</span><span class="grow"></span>
          <span class="g-tag danger"><${Icon} n="diamond" s=${11} />Vencido · ${fmtD(i.deadline)}${i.progress ? ` · ${i.progress}%` : ''}</span></button>`)}
        ${invalid.map((i) => html`<button class="g-attn-row" onClick=${() => openItem(i.id)}>
          <${Avatar} name=${ownerKey(i)} size=${20} /><b>${i.title}</b><span class="muted">${ownerKey(i)}</span><span class="grow"></span>
          <span class="g-tag warn">Datas inválidas · ${fmtD(i.start)} – ${fmtD(i.deadline)} <u>Corrigir</u></span></button>`)}
        ${tbd.length > 0 && html`<div class="g-attn-row static"><${Icon} n="clock" s=${16} /><b>${tbd.length} entrega${tbd.length > 1 ? 's' : ''} sem prazo (TBD)</b><span class="grow"></span><span class="muted small">Cobre a data na weekly com o PM</span></div>`}
        ${!overdue.length && !invalid.length && !tbd.length && html`<p class="muted small">Nada pendente.</p>`}
      </div>
      <div class="g-attn-col">
        <h3>Vencem em 14 dias <span class="count">${soon.length}</span></h3>
        ${soon.slice(0, 6).map((i) => html`<button class="g-attn-row" onClick=${() => openItem(i.id)}>
          <${Avatar} name=${ownerKey(i)} size=${20} /><b>${i.title}</b><span class="muted">${ownerKey(i)}</span><span class="grow"></span>
          <span class="muted">Prazo <b class="ink">${fmtD(i.deadline)}</b></span></button>`)}
        ${!soon.length && html`<p class="muted small">Nenhum prazo nos próximos 14 dias.</p>`}
      </div>
    </div>

    ${!all.length ? html`<${Empty} text="Nenhuma entrega no Gantt. Tasks com macrotema Product Requirements (ou marcadas “Mostrar no Gantt”) aparecem aqui." icon="list" />` : html`
    <div class="g-wrap">
      <div class=${`g-table g-${scale}`} style=${`--cols:${w.cols.length}`}>
        <div class="g-row g-head">
          <div class="g-left"><span class="g-c-task">Entrega</span><span class="g-c-st">Status</span><span class="g-c-pr">Progr.</span><span class="g-c-dt">Datas</span></div>
          <div class="g-tl">
            <div class="g-month">${scale === 'day' ? `${MO[w.from.getMonth()]} ${w.from.getFullYear()}` : 'Semanas (início na segunda)'}</div>
            <div class="g-cols">${w.cols.map((c) => { const cur = scale === 'day' ? dayKey(c) === dayKey(now) : now >= c && now < addDays(c, 7);
              return html`<span class=${`${cur ? 'cur' : ''} ${scale === 'day' && c.getDay() % 6 === 0 ? 'we' : ''}`}>${scale === 'day' ? html`<em>${WD[c.getDay()]}</em>${c.getDate()}` : html`<em>${c.getDate()}</em>${MO[c.getMonth()]}`}</span>`; })}</div>
          </div>
        </div>
        ${gkeys.map((k) => { const list = groups.get(k); const done = all.filter((i) => (group === 'owner' ? ownerKey(i) : (macroName(i.macrotemaId) || 'Sem macrotema')) === k);
          const nd = done.filter((i) => i.status === 'done').length; const next = list.filter((i) => i.deadline && i.status !== 'done').sort(byDue)[0];
          return html`
          <div class="g-row g-group" onClick=${() => toggle(k)}>
            <div class="g-left">
              <span class=${`g-chev ${collapsed[k] ? 'closed' : ''}`}><${Icon} n="down" s=${15} /></span>
              ${group === 'owner' && html`<${Avatar} name=${k} size=${28} />`}<b class="g-gname">${k}</b>
              <span class="muted small">${list.length} entrega${list.length > 1 ? 's' : ''}</span>
            </div>
            <div class="g-tl g-gmeta">
              ${next && html`<span class="muted">Próximo prazo <b class="ink">${fmtD(next.deadline)}</b></span>`}
              <span class="g-mini"><i style=${`width:${done.length ? (nd / done.length) * 100 : 0}%`}></i></span><span class="muted small">${nd}/${done.length} concluídas</span>
              <button class="btn btn-icon btn-xs" aria-label=${`Nova entrega em ${k}`} onClick=${(e) => { e.stopPropagation(); newIn(k); }}><${Icon} n="plus" s=${14} /></button>
            </div>
          </div>
          ${!collapsed[k] && list.map((i) => html`<${GRow} i=${i} w=${w} pct=${pct} now=${now} todayIn=${todayIn} scale=${scale} />`)}`; })}
      </div>
    </div>`}
  </div>`;
}

function GRow({ i, w, pct, now, todayIn, scale }) {
  const s = startOf(i); const e = i.deadline ? new Date(i.deadline) : null;
  const late = e && e < now && i.status !== 'done';
  const prog = i.status === 'done' ? 100 : (i.progress || 0);
  let tl;
  if (!e) tl = html`<span class="g-note"><button class="g-link" onClick=${(ev) => { ev.stopPropagation(); openItem(i.id); }}>Sem prazo · Definir data</button></span>`;
  else if (i.start && s > e) tl = html`<span class="g-note warn">Datas inválidas · <button class="g-link warn" onClick=${(ev) => { ev.stopPropagation(); openItem(i.id); }}>Corrigir</button></span>`;
  else if (e < w.from) tl = html`<span class="g-note">‹ ${i.status === 'done' ? `Concluído · prazo ${fmtD(e)}` : `Vencido · prazo ${fmtD(e)}`}</span>`;
  else if (s >= w.to) tl = html`<span class="g-note right">Começa ${fmtD(s)} ›</span>`;
  else {
    const l = Math.max(0, pct(s < w.from ? w.from : s)); const r = Math.min(100, pct(e));
    const width = Math.max(r - l, scale === 'day' ? 1.5 : 0.8);
    tl = html`<span class=${`g-bar pb-${i.priority} ${i.status === 'done' ? 'done' : ''} ${late ? 'late' : ''} ${s < w.from ? 'cut' : ''}`} style=${`left:${l}%;width:${width}%`} title=${`${i.title} · ${fmtD(s)} – ${fmtDateTime(e)} · ${prog}%`}>
        <i style=${`width:${prog}%`}></i></span>
      ${e <= w.to && html`<span class=${`g-dl ${late ? 'late' : ''} pb-${i.priority}`} style=${`left:${pct(e)}%`} title=${`Prazo ${fmtDateTime(e)}`}><${Icon} n="diamond" s=${11} /></span>`}`;
  }
  return html`<div class=${`g-row g-item ${i.status === 'done' ? 'is-done' : ''}`} onClick=${() => openItem(i.id)} role="button" tabindex="0" onKeyDown=${(ev) => { if (ev.key === 'Enter') openItem(i.id); }}>
    <div class="g-left">
      <span class="g-c-task"><span class="g-title"><${Prio} p=${i.priority} /><b>${i.title}</b>${late && html`<span class="g-x" title="Vencido"><${Icon} n="diamond" s=${11} /></span>`}
        <span class="g-docs">${isTicket(i)
          ? ticketUrl(i) && html`<a class="g-dc on tk" href=${ticketUrl(i)} target="_blank" rel="noopener" onClick=${(ev) => ev.stopPropagation()} title="Abrir ticket">TICKET</a>`
          : html`<${DocChip} i=${i} kind="mrd" /><${DocChip} i=${i} kind="prd" />`}</span></span>
        ${i.notes && html`<span class="g-sub">${i.notes.split('\n')[0]}</span>`}</span>
      <span class="g-c-st"><span class=${`g-status st-${i.status}`}>${STATUS_LBL[i.status] || i.status}</span></span>
      <span class=${`g-c-pr ${prog === 100 ? 'ok' : ''}`}>${prog}%</span>
      <span class="g-c-dt">${e ? `${i.start ? `${fmtD(s)} – ` : ''}${fmtD(e)}` : html`<span class="muted">TBD</span>`}</span>
    </div>
    <div class="g-tl">
      ${scale === 'day' && html`<span class="g-we">${w.cols.map((c) => html`<i class=${c.getDay() % 6 === 0 ? 'we' : ''}></i>`)}</span>`}
      ${todayIn && html`<span class="g-today" style=${`left:${pct(now)}%`}></span>`}
      ${tl}
    </div>
  </div>`;
}
