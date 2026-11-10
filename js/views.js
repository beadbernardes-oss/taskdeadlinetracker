import { html, useState } from './lib.js';
import { S, U, setUI, mutate, updateItem, logFollowUp, answerYes, markDone, toast, people, macroName, weekStartFor } from './store.js';
import { questions, followUp, risk, isOpen, isMine, leadToday, hasAgenda, agendaCheckDue } from './engine.js';
import { checkAgenda } from './store.js';
import { occurrencesBetween, recurText, hasPerson } from './meetings.js';
import { addDays, startOfDay, dayKey, fmtRel, fmtTime, fmtDate, fmtShort, fmtLong, fmtDateTime, fmtAgo, WD, MO, nameKey, H, copy, download } from './util.js';
import { Icon, Card, Prio, MacroPill, Avatar, Empty, Section, Seg, openItem, openOcc, openNew, openModal, applyFilters } from './ui.js';

const byDeadline = (a, b) => (a.deadline ? new Date(a.deadline) : Infinity) - (b.deadline ? new Date(b.deadline) : Infinity) || a.priority - b.priority;

// ---------------- HOJE ----------------
function QuestionRow({ q, now }) {
  const i = q.item;
  return html`<div class="qrow">
    <div class="qrow-main" onClick=${() => openItem(i.id)}>
      <div class="qrow-title"><${Prio} p=${i.priority} /> ${i.title}</div>
      <div class="qrow-sub">${q.type === 'ask' ? 'Vou conseguir entregar no prazo?' : 'O prazo passou. Você entregou?'} · <b class=${q.type === 'overdue' ? 'late' : ''}>${fmtRel(i.deadline, now)}</b></div>
    </div>
    <div class="qrow-act">
      ${q.type === 'ask'
        ? html`<button class="btn btn-sm btn-yes" onClick=${() => { answerYes(i.id); toast('Combinado. O card fica onde está.'); }}>Sim</button>`
        : html`<button class="btn btn-sm btn-yes" onClick=${() => { markDone(i.id); toast('Marcado como entregue.'); }}>Entreguei</button>`}
      <button class="btn btn-sm btn-no" onClick=${() => openModal({ type: 'postpone', id: i.id, mine: true })}>Não</button>
    </div>
  </div>`;
}

function OccRow({ o, now, compact }) {
  const n = (o.rec?.agenda || []).filter((a) => (a.text || '').trim()).length;
  const live = o.start <= now && o.end > now;
  return html`<button class=${`occ ${o.series.lead ? 'is-lead' : 'is-muted'} ${compact ? 'compact' : ''}`} onClick=${() => openOcc(o.key)}>
    <span class="occ-time">${fmtTime(o.start)}${live ? html`<em>agora</em>` : ''}</span>
    <span class="occ-title">${o.series.title}</span>
    ${o.series.lead
      ? (n ? html`<span class="badge ok"><${Icon} n="list" s=${12} />${n} pauta${n > 1 ? 's' : ''}</span>` : html`<span class="badge danger"><${Icon} n="alert" s=${12} />Sem pauta</span>`)
      : html`<span class="badge">Participante</span>`}
  </button>`;
}

function AgendaCheck({ now }) {
  const st = S();
  if (!st.settings.agendaCheck) return null;
  const due = agendaCheckDue(st, now);
  const doneAt = (st.agendaChecks || {})[dayKey(now)];
  const t0 = startOfDay(now);
  const today = occurrencesBetween(st, t0, addDays(t0, 1));
  const tomorrow = occurrencesBetween(st, addDays(t0, 1), addDays(t0, 2));
  if (!due) {
    if (!doneAt) return null;
    return html`<div class="agcheck done"><${Icon} n="check" s=${16} /><span>Agenda conferida hoje às ${fmtTime(doneAt)}</span>
      <div class="grow"></div><button class="btn btn-ghost btn-xs" onClick=${() => mutate((s) => { delete s.agendaChecks[dayKey(now)]; })}>Refazer</button></div>`;
  }
  const list = (arr) => (arr.length ? arr.map((o) => html`<li class=${o.series.lead ? 'lead' : ''}><b>${fmtTime(o.start)}</b> ${o.series.title}${o.series.lead ? html` <span class="badge">Lead</span>` : ''}</li>`) : html`<li class="muted">Nenhuma cadastrada</li>`);
  return html`<div class="agcheck">
    <div class="agcheck-h"><${Icon} n="calendar" s=${18} /><div><b>Check de agenda (obrigatório)</b>
      <span>Compare com o Daxiang: todas as reuniões de hoje e de amanhã estão aqui? Cadastre as que faltarem e marque as que você lidera. Amanhã entra no check porque o alerta de pauta de reuniões cedo dispara às 21h da véspera.</span></div></div>
    <div class="agcheck-cols">
      <div><h4>Hoje · ${fmtDate(now)}</h4><ul>${list(today)}</ul></div>
      <div><h4>Amanhã · ${fmtDate(addDays(now, 1))}</h4><ul>${list(tomorrow)}</ul></div>
    </div>
    <div class="row wrap">
      <button class="btn btn-sm" onClick=${() => openModal({ type: 'series', id: null })}><${Icon} n="plus" s=${15} />Cadastrar reunião</button>
      <div class="grow"></div>
      <button class="btn btn-sm btn-primary" onClick=${() => { checkAgenda(); toast('Agenda conferida.'); }}><${Icon} n="check" s=${15} />Agenda conferida</button>
    </div>
  </div>`;
}

export function Today() {
  const st = S(); const now = new Date();
  const items = applyFilters(st.items);
  const qs = questions(st, now).filter((q) => items.includes(q.item));
  const qIds = new Set(qs.map((q) => q.item.id));
  const mine = items.filter((i) => isMine(i) && isOpen(i) && i.deadline && !qIds.has(i.id));
  const today0 = startOfDay(now); const tomorrow0 = addDays(today0, 1);
  const overdue = mine.filter((i) => new Date(i.deadline) < now).sort(byDeadline);
  const dueToday = mine.filter((i) => new Date(i.deadline) >= now && new Date(i.deadline) < tomorrow0).sort(byDeadline);
  const next7 = mine.filter((i) => new Date(i.deadline) >= tomorrow0 && new Date(i.deadline) < addDays(today0, 8) && i.subtype !== 'inform').sort(byDeadline);
  const informs = items.filter((i) => i.subtype === 'inform' && isOpen(i)).sort(byDeadline);
  const third = items.filter((i) => i.owner === 'other' && isOpen(i));
  const fus = third.filter((i) => followUp(i, st.settings, now)?.needs).sort(byDeadline);
  const thirdNext = third.filter((i) => !fus.includes(i) && i.deadline && new Date(i.deadline) < addDays(today0, 8)).sort(byDeadline);
  const meetings = occurrencesBetween(st, today0, tomorrow0);
  const lead = meetings.filter((o) => o.series.lead);
  const noAgenda = lead.filter((o) => !hasAgenda(o) && o.end > now).length;
  const greet = now.getHours() < 12 ? 'Bom dia' : now.getHours() < 18 ? 'Boa tarde' : 'Boa noite';

  return html`<div class="view today">
    <div class="hello"><div><h2>${greet}</h2><p>${fmtLong(now)}</p></div></div>
    <${AgendaCheck} now=${now} />
    <div class="stats">
      <div class=${`stat ${qs.length ? 'hot' : ''}`}><b>${qs.length}</b><span>precisam da sua resposta</span></div>
      <div class=${`stat ${overdue.length ? 'bad' : ''}`}><b>${overdue.length + qs.filter((q) => q.type === 'overdue').length}</b><span>atrasadas</span></div>
      <div class="stat"><b>${dueToday.length + qs.filter((q) => q.type === 'ask' && new Date(q.item.deadline) < tomorrow0).length}</b><span>vencem hoje</span></div>
      <div class=${`stat ${fus.length ? 'info' : ''}`}><b>${fus.length}</b><span>follow-ups</span></div>
      <div class=${`stat ${noAgenda ? 'bad' : ''}`}><b>${lead.length}</b><span>reuniões que você lidera${noAgenda ? ` · ${noAgenda} sem pauta` : ''}</span></div>
    </div>
    <div class="cols">
      <div class="col">
        ${qs.length > 0 && html`<${Section} title="Precisa da sua resposta" count=${qs.length} icon="alert" tone="hot">
          ${qs.map((q) => html`<${QuestionRow} q=${q} now=${now} />`)}
        <//>`}
        ${overdue.length > 0 && html`<${Section} title="Atrasadas" count=${overdue.length} icon="clock" tone="bad">
          <div class="stack">${overdue.map((i) => html`<${Card} item=${i} now=${now} />`)}</div><//>`}
        <${Section} title="Vencem hoje" count=${dueToday.length} icon="sun">
          ${dueToday.length ? html`<div class="stack">${dueToday.map((i) => html`<${Card} item=${i} now=${now} />`)}</div>` : html`<${Empty} text="Nada vence hoje." />`}
        <//>
        <${Section} title="Próximos 7 dias" count=${next7.length} icon="calendar">
          ${next7.length ? html`<div class="stack">${next7.map((i) => html`<${Card} item=${i} now=${now} />`)}</div>` : html`<${Empty} text="Semana livre de entregas suas." />`}
        <//>
      </div>
      <div class="col">
        <${Section} title="Reuniões de hoje" count=${meetings.length} icon="calendar"
          action=${html`<button class="btn btn-ghost btn-sm" onClick=${() => { location.hash = '#/reunioes'; }}>Ver agenda</button>`}>
          ${meetings.length ? html`<div class="occ-list">${meetings.map((o) => html`<${OccRow} o=${o} now=${now} />`)}</div>` : html`<${Empty} text="Sem reuniões hoje." />`}
        <//>
        ${informs.length > 0 && html`<${Section} title="Avisar stakeholders" count=${informs.length} icon="msg" tone="warn">
          <div class="stack">${informs.map((i) => html`<${Card} item=${i} now=${now} />`)}</div><//>`}
        <${Section} title="Follow-ups com terceiros" count=${fus.length} icon="users" tone=${fus.length ? 'info' : ''}>
          ${fus.length ? fus.map((i) => html`<${FollowRow} i=${i} now=${now} />`) : html`<${Empty} text="Nenhum follow-up pendente." />`}
        <//>
        ${thirdNext.length > 0 && html`<${Section} title="Terceiros: próximos prazos" count=${thirdNext.length} icon="user">
          <div class="stack">${thirdNext.map((i) => html`<${Card} item=${i} now=${now} />`)}</div><//>`}
      </div>
    </div>
  </div>`;
}

function FollowRow({ i, now }) {
  const f = followUp(i, S().settings, now);
  return html`<div class="frow">
    <${Avatar} name=${i.ownerName} size=${30} />
    <div class="frow-main" onClick=${() => openItem(i.id)}>
      <div class="frow-title">${i.title}</div>
      <div class="frow-sub"><b>${i.ownerName}</b> · ${f?.label} · prazo ${fmtRel(i.deadline, now)}${i.lastFollowUp ? ` · último follow-up ${fmtAgo(i.lastFollowUp, now)}` : ' · nunca cobrado'}</div>
    </div>
    <button class="btn btn-sm" onClick=${() => { logFollowUp(i.id); toast(`Follow-up com ${i.ownerName} registrado.`); }}><${Icon} n="check" s=${14} />Cobrei hoje</button>
  </div>`;
}

// ---------------- SEMANA ----------------
function dropToDay(id, day) {
  const it = S().items.find((x) => x.id === id); if (!it) return;
  const base = it.deadline ? new Date(it.deadline) : null;
  const d = new Date(day);
  if (base) d.setHours(base.getHours(), base.getMinutes(), 0, 0);
  else { const [h, m] = S().settings.defaultTime.split(':').map(Number); d.setHours(h, m, 0, 0); }
  if (base && +d === +base) return;
  if (base && d > base && isOpen(it) && it.subtype !== 'inform') {
    openModal({ type: 'postpone', id, mine: isMine(it), proposed: d.toISOString() });
  } else {
    updateItem(id, { deadline: d.toISOString() });
    toast(`Prazo: ${fmtDateTime(d)}`);
  }
}

function DropZone({ onDrop, cls, children }) {
  const [over, setOver] = useState(false);
  return html`<div class=${`${cls} ${over ? 'over' : ''}`}
    onDragOver=${(e) => { e.preventDefault(); setOver(true); }} onDragLeave=${() => setOver(false)}
    onDrop=${(e) => { e.preventDefault(); setOver(false); const id = e.dataTransfer.getData('text/plain'); if (id) onDrop(id); }}>${children}</div>`;
}

export function Week() {
  const st = S(); const u = U(); const now = new Date();
  const ws = weekStartFor(u.weekOffset);
  const days = [...Array(7)].map((_, i) => addDays(ws, i));
  const items = applyFilters(st.items).filter((i) => i.status !== 'done' || (i.doneAt && new Date(i.doneAt) >= ws));
  const occs = occurrencesBetween(st, ws, addDays(ws, 7), { leadOnly: true });
  const noDate = items.filter((i) => !i.deadline && isOpen(i));
  const lateBefore = items.filter((i) => isOpen(i) && i.deadline && new Date(i.deadline) < ws).length;
  const end = addDays(ws, 6);
  return html`<div class="view week">
    <div class="toolbar">
      <div class="nav-btns">
        <button class="btn btn-icon" aria-label="Semana anterior" onClick=${() => setUI({ weekOffset: u.weekOffset - 1 })}><${Icon} n="left" /></button>
        <button class="btn btn-sm" onClick=${() => setUI({ weekOffset: 0 })}>Hoje</button>
        <button class="btn btn-icon" aria-label="Próxima semana" onClick=${() => setUI({ weekOffset: u.weekOffset + 1 })}><${Icon} n="right" /></button>
      </div>
      <h2 class="range">${ws.getDate()} ${MO[ws.getMonth()]} – ${end.getDate()} ${MO[end.getMonth()]}</h2>
      <div class="grow"></div>
      ${lateBefore > 0 && u.weekOffset >= 0 && html`<button class="flag danger as-btn" onClick=${() => { location.hash = '#/hoje'; }}>${lateBefore} atrasada${lateBefore > 1 ? 's' : ''} antes desta semana</button>`}
      <span class="hint">Arraste um card para outro dia para mudar o prazo</span>
    </div>
    <div class="week-grid">
      ${days.map((d) => {
        const dk = dayKey(d);
        const its = items.filter((i) => i.deadline && dayKey(i.deadline) === dk).sort(byDeadline);
        const os = occs.filter((o) => dayKey(o.start) === dk);
        const isToday = dk === dayKey(now);
        return html`<${DropZone} cls=${`day ${isToday ? 'is-today' : ''} ${d.getDay() % 6 === 0 ? 'is-weekend' : ''}`} onDrop=${(id) => dropToDay(id, d)}>
          <div class="day-h"><span>${WD[d.getDay()]}</span><b>${d.getDate()}</b>
            <button class="btn btn-icon btn-xs" aria-label="Nova task neste dia" onClick=${() => { const x = new Date(d); const [h, m] = st.settings.defaultTime.split(':'); x.setHours(+h, +m, 0, 0); openNew({ deadline: x.toISOString() }); }}><${Icon} n="plus" s=${14} /></button>
          </div>
          ${os.length > 0 && html`<div class="day-occ">${os.map((o) => html`<${OccRow} o=${o} now=${now} compact />`)}</div>`}
          <div class="day-cards">${its.map((i) => html`<${Card} item=${i} now=${now} />`)}</div>
        <//>`;
      })}
    </div>
    ${noDate.length > 0 && html`<${Section} title="Sem prazo" count=${noDate.length} icon="clock">
      <div class="nodate">${noDate.map((i) => html`<${Card} item=${i} now=${now} />`)}</div><//>`}
  </div>`;
}

// ---------------- KANBAN ----------------
const COLS = [
  { id: 'todo', label: 'A fazer' }, { id: 'doing', label: 'Em andamento' },
  { id: 'waiting', label: 'Aguardando terceiro' }, { id: 'done', label: 'Concluído' },
];
export function Kanban() {
  const st = S(); const now = new Date();
  const items = applyFilters(st.items);
  const cutoff = addDays(now, -14);
  return html`<div class="view kanban">
    <div class="toolbar"><span class="hint">Arraste entre colunas para mudar o status. Concluídos dos últimos 14 dias.</span></div>
    <div class="kb">
      ${COLS.map((c) => {
        let its = items.filter((i) => (i.status || 'todo') === c.id);
        if (c.id === 'done') its = its.filter((i) => !i.doneAt || new Date(i.doneAt) >= cutoff).sort((a, b) => new Date(b.doneAt) - new Date(a.doneAt));
        else its.sort(byDeadline);
        return html`<${DropZone} cls=${`kb-col col-${c.id}`} onDrop=${(id) => { updateItem(id, { status: c.id }); }}>
          <div class="kb-h"><span class=${`dot dot-${c.id}`}></span>${c.label}<span class="count">${its.length}</span>
            ${c.id !== 'done' && html`<button class="btn btn-icon btn-xs" aria-label=${`Nova em ${c.label}`} onClick=${() => openNew({ status: c.id })}><${Icon} n="plus" s=${14} /></button>`}
          </div>
          <div class="kb-cards">${its.map((i) => html`<${Card} item=${i} now=${now} />`)}</div>
        <//>`;
      })}
    </div>
  </div>`;
}

// ---------------- REUNIÕES ----------------
function SeriesRow({ s }) {
  return html`<div class="series-row">
    <div class="series-main" onClick=${() => openModal({ type: 'series', id: s.id })}>
      <b>${s.title}</b><span>${recurText(s)}</span>
    </div>
    <label class="switch" title="Eu lidero esta reunião">
      <input type="checkbox" checked=${s.lead} onChange=${(e) => { const v = e.target.checked; mutate((x) => { x.series.find((y) => y.id === s.id).lead = v; }); }} />
      <span></span><em>Lead</em>
    </label>
  </div>`;
}

export function Meetings() {
  const st = S(); const u = U(); const now = new Date();
  const from = startOfDay(now);
  const occs = occurrencesBetween(st, from, addDays(from, 14), { leadOnly: u.leadOnly });
  const groups = [];
  for (const o of occs) {
    const dk = dayKey(o.start);
    let g = groups.find((x) => x.dk === dk);
    if (!g) { g = { dk, day: o.start, list: [] }; groups.push(g); }
    g.list.push(o);
  }
  const sorted = st.series.slice().sort((a, b) => b.lead - a.lead || a.title.localeCompare(b.title));
  const visible = sorted.filter((s) => !s.hidden); const hidden = sorted.filter((s) => s.hidden);
  return html`<div class="view meetings">
    <div class="toolbar">
      <${Seg} small value=${u.leadOnly} onChange=${(v) => setUI({ leadOnly: v })} options=${[{ value: true, label: 'Que eu lidero' }, { value: false, label: 'Todas' }]} />
      <div class="grow"></div>
      ${u.dxSyncedAt && html`<span class=${`dx-sync ${now - new Date(u.dxSyncedAt) > 6 * H ? 'old' : ''}`} title="Agenda importada do Daxiang pelo seu computador">Daxiang · ${fmtAgo(u.dxSyncedAt)}</span>`}
      <button class="btn btn-sm" onClick=${() => openModal({ type: 'ics' })}><${Icon} n="upload" s=${15} />Importar .ics</button>
      <button class="btn btn-sm btn-primary" onClick=${() => openModal({ type: 'series', id: null })}><${Icon} n="plus" s=${15} />Nova reunião</button>
    </div>
    <div class="cols">
      <div class="col wide">
        ${groups.length ? groups.map((g) => html`<${Section} title=${dayKey(g.day) === dayKey(now) ? `Hoje · ${fmtDate(g.day)}` : fmtDate(g.day)} count=${g.list.length}>
          <div class="occ-list">${g.list.map((o) => html`<${OccRow} o=${o} now=${now} />`)}</div><//>`)
          : html`<${Empty} text="Nenhuma reunião nos próximos 14 dias. Crie uma ou importe da agenda." icon="calendar" />`}
      </div>
      <div class="col narrow">
        <${Section} title="Séries" count=${visible.length} icon="repeat">
          ${visible.length ? visible.map((s) => html`<${SeriesRow} s=${s} />`) : html`<${Empty} text="Sem séries." />`}
          ${hidden.length > 0 && html`<details class="hidden-series"><summary>Ocultas do Tracker (${hidden.length})</summary>
            <p class="muted small">Compromissos só seus (almoço, deslocamento…) entram aqui. Toque em "Acompanhar" para trazer de volta.</p>
            ${hidden.map((s) => html`<div class="series-row dim"><div class="series-main" onClick=${() => openModal({ type: 'series', id: s.id })}><b>${s.title}</b><span>${recurText(s)}</span></div>
              <button class="btn btn-xs" onClick=${() => mutate((x) => { x.series.find((y) => y.id === s.id).hidden = false; })}>Acompanhar</button></div>`)}
          </details>`}
        <//>
      </div>
    </div>
  </div>`;
}

// ---------------- PESSOAS ----------------
export function People() {
  const st = S(); const u = U(); const now = new Date();
  const list = people();
  const sel = u.person && list.find((p) => nameKey(p) === nameKey(u.person)) ? u.person : list[0];
  const k = nameKey(sel || '');
  const stat = (p) => {
    const pk = nameKey(p);
    const owes = st.items.filter((i) => i.owner === 'other' && nameKey(i.ownerName) === pk && isOpen(i));
    return { owes: owes.length, late: owes.filter((i) => i.deadline && new Date(i.deadline) < now).length };
  };
  const owes = st.items.filter((i) => i.owner === 'other' && nameKey(i.ownerName) === k && isOpen(i)).sort(byDeadline);
  const stake = st.items.filter((i) => isOpen(i) && (i.stakeholders || []).some((s) => nameKey(s) === k) && i.subtype !== 'inform').sort(byDeadline);
  const informs = st.items.filter((i) => isOpen(i) && i.subtype === 'inform' && (i.stakeholders || []).some((s) => nameKey(s) === k));
  const occs = sel ? occurrencesBetween(st, startOfDay(now), addDays(now, 21)).filter((o) => hasPerson(o.series, sel)).slice(0, 6) : [];
  return html`<div class="view people">
    ${!list.length ? html`<${Empty} text="As pessoas aparecem aqui quando você cadastra donos, stakeholders ou participantes." icon="users" />` : html`
    <div class="people-grid">
      <div class="plist">
        ${list.map((p) => { const s = stat(p); return html`<button class=${`pitem ${nameKey(p) === k ? 'on' : ''}`} onClick=${() => setUI({ person: p })}>
          <${Avatar} name=${p} size=${28} /><span class="pname">${p}</span>
          ${s.late > 0 && html`<span class="badge danger">${s.late}</span>`}${s.owes > 0 && html`<span class="badge">${s.owes}</span>`}
        </button>`; })}
      </div>
      <div class="pdetail">
        <div class="phead"><${Avatar} name=${sel} size=${44} /><div><h2>${sel}</h2><p>${owes.length} pendência${owes.length !== 1 ? 's' : ''} com você · stakeholder em ${stake.length} item${stake.length !== 1 ? 's' : ''}</p></div>
          <div class="grow"></div><button class="btn btn-sm" onClick=${() => openNew({ owner: 'other', ownerName: sel })}><${Icon} n="plus" s=${15} />Task para ${sel}</button></div>
        ${informs.length > 0 && html`<${Section} title="Avisos de mudança de prazo pendentes" count=${informs.length} icon="msg" tone="warn"><div class="stack">${informs.map((i) => html`<${Card} item=${i} now=${now} />`)}</div><//>`}
        <${Section} title=${`O que ${sel} te deve`} count=${owes.length} icon="user">
          ${owes.length ? owes.map((i) => html`<${FollowRow} i=${i} now=${now} />`) : html`<${Empty} text="Nada pendente." />`}<//>
        <${Section} title="Onde é stakeholder" count=${stake.length} icon="users">
          ${stake.length ? html`<div class="stack">${stake.map((i) => html`<${Card} item=${i} now=${now} />`)}</div>` : html`<${Empty} text="Nenhum item." />`}<//>
        <${Section} title="Próximas reuniões juntos" count=${occs.length} icon="calendar">
          ${occs.length ? html`<div class="occ-list">${occs.map((o) => html`<div class="occ-day">${fmtDate(o.start)}</div><${OccRow} o=${o} now=${now} />`)}</div>` : html`<${Empty} text="Nenhuma nas próximas 3 semanas." />`}<//>
      </div>
    </div>`}
  </div>`;
}

// ---------------- RESUMO ----------------
export function buildSummary(offset = 0) {
  const st = S(); const now = new Date();
  const ws = weekStartFor(offset); const we = addDays(ws, 7);
  const inW = (iso) => iso && new Date(iso) >= ws && new Date(iso) < we;
  const tag = (i) => `[${macroName(i.macrotemaId)}] P${i.priority}`;
  const L = [];
  L.push(`# Status semanal · ${fmtShort(ws)} a ${fmtShort(addDays(ws, 6))}`, '');
  const done = st.items.filter((i) => i.status === 'done' && inW(i.doneAt) && i.subtype !== 'inform');
  L.push('## Entregue', ...(done.length ? done.map((i) => `- ${tag(i)} ${i.title}${i.owner === 'other' ? ` (${i.ownerName})` : ''}`) : ['- Nada concluído no período']), '');
  const moves = st.items.flatMap((i) => (i.postponements || []).filter((p) => inW(p.at)).map((p) => ({ i, p })));
  L.push('## Mudanças de prazo', ...(moves.length ? moves.map(({ i, p }) => `- ${tag(i)} ${i.title}${i.owner === 'other' ? ` (${i.ownerName})` : ''}: ${fmtShort(p.from)} → ${fmtShort(p.to)}. Motivo: ${p.reason || 'não informado'}`) : ['- Nenhuma']), '');
  const risks = st.items.filter((i) => isOpen(i) && (risk(i, st, now).length || (i.deadline && new Date(i.deadline) < now)));
  L.push('## Riscos e atrasos', ...(risks.length ? risks.map((i) => `- ${tag(i)} ${i.title}${i.owner === 'other' ? ` (${i.ownerName})` : ''}: ${i.deadline && new Date(i.deadline) < now ? `atrasado desde ${fmtShort(i.deadline)}` : risk(i, st, now).join('; ')}`) : ['- Nenhum']), '');
  const third = st.items.filter((i) => i.owner === 'other' && isOpen(i)).sort(byDeadline);
  L.push('## Dependências de terceiros', ...(third.length ? third.map((i) => `- ${i.ownerName}: ${i.title} · prazo ${i.deadline ? fmtShort(i.deadline) : 'sem prazo'}${i.lastFollowUp ? ` · último follow-up ${fmtShort(i.lastFollowUp)}` : ''}`) : ['- Nenhuma']), '');
  const next = st.items.filter((i) => isOpen(i) && isMine(i) && i.subtype !== 'inform' && i.deadline && new Date(i.deadline) >= now && new Date(i.deadline) < addDays(now, 14)).sort(byDeadline);
  L.push('## Próximas entregas (14 dias)', ...(next.length ? next.map((i) => `- ${fmtShort(i.deadline)} · ${tag(i)} ${i.title}${i.kind === 'marco' ? ' (marco)' : ''}`) : ['- Nenhuma']), '');
  const occs = occurrencesBetween(st, ws, we, { leadOnly: true }).filter((o) => o.rec && (o.rec.notes || '').trim());
  if (occs.length) L.push('## Decisões das reuniões', ...occs.map((o) => `- ${o.series.title} (${fmtShort(o.start)}): ${o.rec.notes.trim().replace(/\n+/g, ' / ')}`), '');
  return L.join('\n');
}

export function Summary() {
  const u = U();
  const md = buildSummary(u.summaryWeek);
  const ws = weekStartFor(u.summaryWeek);
  return html`<div class="view summary">
    <div class="toolbar">
      <${Seg} small value=${u.summaryWeek} onChange=${(v) => setUI({ summaryWeek: v })} options=${[{ value: -1, label: 'Semana passada' }, { value: 0, label: 'Esta semana' }]} />
      <div class="grow"></div>
      <button class="btn btn-sm" onClick=${async () => { await copy(md); toast('Resumo copiado.'); }}><${Icon} n="copy" s=${15} />Copiar</button>
      <button class="btn btn-sm" onClick=${() => download(`status-${dayKey(ws)}.md`, md, 'text/markdown')}><${Icon} n="download" s=${15} />Baixar .md</button>
    </div>
    <article class="md">${md.split('\n').map((l) => l.startsWith('# ') ? html`<h1>${l.slice(2)}</h1>` : l.startsWith('## ') ? html`<h2>${l.slice(3)}</h2>` : l.startsWith('- ') ? html`<p class="li">${l.slice(2)}</p>` : l ? html`<p>${l}</p>` : null)}</article>
  </div>`;
}
