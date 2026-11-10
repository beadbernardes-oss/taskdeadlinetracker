import { html, useState, useEffect, useRef } from './lib.js';
import {
  S, U, setUI, mutate, toast, addItem, updateItem, deleteItem, postpone, answerYes, markDone, logFollowUp,
  addAgendaItem, updateAgenda, removeAgenda, updateOcc, people, newItem, PALETTE, informMessage, clearDemo, hasDemo, replaceState, DEFAULT_SETTINGS,
} from './store.js';
import { questions, followUp, risk, isOpen, isMine, alertTime } from './engine.js';
import { enablePush, disablePush, sendTest, pushSupport, pushEnabledHere, pushDiagnose } from './push.js';
import { setPassword } from './cloud.js';
import { occurrenceByKey, occurrencesBetween, recurText, nextOccurrence, ensureOcc, parseICS, isFutureRelevant, hasPerson } from './meetings.js';
import { uid, toInput, fromInput, fmtDateTime, fmtRel, fmtAgo, fmtShort, fmtDate, fmtTime, addDays, startOfDay, dayKey, nameKey, H, copy, download, WD } from './util.js';
import { Icon, Prio, MacroPill, Avatar, Card, PeopleInput, AutoText, Seg, PrioPicker, MacroSelect, openItem, openOcc, closeModal, openModal, Empty } from './ui.js';

const STATUS = [{ value: 'todo', label: 'A fazer' }, { value: 'doing', label: 'Em andamento' }, { value: 'waiting', label: 'Aguardando' }, { value: 'done', label: 'Concluído' }];
const closeDrawer = () => setUI({ drawer: null });

function Field({ label, children, hint }) {
  return html`<label class="field"><span class="field-l">${label}</span>${children}${hint && html`<span class="field-h">${hint}</span>`}</label>`;
}

// ===================== ITEM =====================
export function ItemDrawer({ id, preset }) {
  const st = S();
  const isNew = !id;
  const [draft, setDraft] = useState(() => newItem({ deadline: null, ...preset }));
  const item = isNew ? draft : st.items.find((x) => x.id === id);
  if (!item) return null;
  const now = new Date();
  const ppl = people();

  const set = (patch) => {
    if (isNew) { setDraft((d) => ({ ...d, ...patch })); return; }
    updateItem(id, patch);
  };
  const setDeadline = (v) => {
    const iso = fromInput(v);
    if (!isNew && iso && item.deadline && new Date(iso) > new Date(item.deadline) && isOpen(item) && item.subtype !== 'inform') {
      openModal({ type: 'postpone', id, mine: isMine(item), proposed: iso });
      return;
    }
    set({ deadline: iso });
  };
  const create = () => {
    if (!draft.title.trim()) { toast('Dê um título para a task.'); return; }
    if (draft.owner === 'other' && !draft.ownerName.trim()) { toast('Informe o nome do responsável.'); return; }
    if (isMine(draft) && draft.kind === 'task' && !draft.deadline && !draft.parentId) {
      if (!confirm('Task sem prazo não recebe o alerta de entrega. Criar mesmo assim?')) return;
    }
    const it = addItem({ ...draft, title: draft.title.trim() });
    toast('Criado.'); setUI({ drawer: { type: 'item', id: it.id } });
  };

  const subs = st.items.filter((x) => x.parentId === item.id);
  const parent = item.parentId && st.items.find((x) => x.id === item.parentId);
  const deps = (item.dependsOn || []).map((d) => st.items.find((x) => x.id === d)).filter(Boolean);
  const depOptions = st.items.filter((x) => x.id !== item.id && isOpen(x) && !item.dependsOn?.includes(x.id) && x.parentId !== item.id && x.subtype !== 'inform');
  const r = isNew ? [] : risk(item, st, now);
  const fu = isNew ? null : followUp(item, st.settings, now);
  const occ = item.fromOcc && occurrenceByKey(st, item.fromOcc);
  const q = !isNew && questions(st, now).find((x) => x.item.id === item.id);
  const at = item.deadline && isMine(item) && item.subtype !== 'inform' ? alertTime(item.deadline, st.settings) : null;

  return html`<div class="drawer-in">
    <header class="drawer-h">
      <span class="drawer-kicker">${isNew ? 'Novo item' : item.subtype === 'inform' ? 'Sub-task de aviso' : item.kind === 'marco' ? 'Marco' : 'Task'}</span>
      <div class="grow"></div>
      ${!isNew && html`<button class="btn btn-icon" aria-label="Excluir" onClick=${() => { if (confirm('Excluir este item e suas sub-tasks?')) { deleteItem(id); closeDrawer(); toast('Excluído.'); } }}><${Icon} n="trash" s=${17} /></button>`}
      <button class="btn btn-icon" aria-label="Fechar" onClick=${closeDrawer}><${Icon} n="x" /></button>
    </header>
    <div class="drawer-b">
      ${parent && html`<button class="link-back" onClick=${() => openItem(parent.id)}>↳ ${parent.title}</button>`}
      <${AutoText} cls="title-input" placeholder="Título" value=${item.title} onInput=${(e) => set({ title: e.target.value })} />

      ${q && html`<div class="callout hot">
        <div><b>${q.type === 'ask' ? 'Vou conseguir entregar no prazo?' : 'O prazo passou. Você entregou?'}</b><span>${fmtDateTime(item.deadline)}</span></div>
        <div class="row">
          ${q.type === 'ask' ? html`<button class="btn btn-sm btn-yes" onClick=${() => answerYes(item.id)}>Sim</button>` : html`<button class="btn btn-sm btn-yes" onClick=${() => markDone(item.id)}>Entreguei</button>`}
          <button class="btn btn-sm btn-no" onClick=${() => openModal({ type: 'postpone', id: item.id, mine: true })}>Não</button>
        </div>
      </div>`}
      ${r.length > 0 && html`<div class="callout danger"><${Icon} n="alert" s=${16} /><div><b>Em risco</b>${r.map((x) => html`<span>${x}</span>`)}</div></div>`}

      <div class="grid2">
        <${Field} label="Tipo"><${Seg} small value=${item.kind} onChange=${(v) => set({ kind: v })} options=${[{ value: 'task', label: 'Task' }, { value: 'marco', label: 'Marco' }]} /><//>
        <${Field} label="Dono"><${Seg} small value=${item.owner} onChange=${(v) => set({ owner: v, status: v === 'other' && item.status === 'todo' ? 'waiting' : item.status })} options=${[{ value: 'me', label: 'Eu' }, { value: 'other', label: 'Terceiro' }]} /><//>
      </div>
      ${item.owner === 'other' && html`<${Field} label="Nome do responsável">
        <input list="ppl-all" value=${item.ownerName} placeholder="Ex.: Lucas" onInput=${(e) => set({ ownerName: e.target.value })} />
        <datalist id="ppl-all">${ppl.map((p) => html`<option value=${p} />`)}</datalist><//>`}
      <div class="grid2">
        <${Field} label="Prazo" hint=${at && isOpen(item) ? `Pergunta de entrega: ${fmtDateTime(at)}` : item.owner === 'other' && item.deadline ? `Follow-up ${st.settings.followUpDaysBefore} dias antes e no dia` : ''}>
          <input type="datetime-local" value=${toInput(item.deadline)} onChange=${(e) => setDeadline(e.target.value)} /><//>
        <${Field} label="Status"><select value=${item.status} onChange=${(e) => set({ status: e.target.value })}>${STATUS.map((s) => html`<option value=${s.value}>${s.label}</option>`)}</select><//>
      </div>
      <div class="grid2">
        <${Field} label="Prioridade"><${PrioPicker} value=${item.priority} onChange=${(v) => set({ priority: v })} /><//>
        <${Field} label="Macrotema"><${MacroSelect} value=${item.macrotemaId} onChange=${(v) => set({ macrotemaId: v })} /><//>
      </div>
      <${Field} label="Stakeholders" hint="Quem precisa saber se o prazo mudar"><${PeopleInput} value=${item.stakeholders} suggestions=${ppl} onChange=${(v) => set({ stakeholders: v })} /><//>
      <${Field} label="Notas"><textarea rows="3" value=${item.notes} placeholder="Contexto, links, critérios de aceite…" onInput=${(e) => set({ notes: e.target.value })}></textarea><//>

      ${item.subtype === 'inform' && html`<div class="block">
        <div class="block-h"><${Icon} n="msg" s=${16} /><b>Mensagem para os stakeholders</b></div>
        <textarea rows="6" value=${item.message} onInput=${(e) => set({ message: e.target.value })}></textarea>
        <div class="row">
          <button class="btn btn-sm" onClick=${async () => { await copy(item.message); toast('Mensagem copiada.'); }}><${Icon} n="copy" s=${15} />Copiar</button>
          <button class="btn btn-sm btn-primary" onClick=${() => { set({ status: 'done' }); toast('Stakeholders avisados.'); }}><${Icon} n="check" s=${15} />Já avisei</button>
        </div>
      </div>`}

      ${!isNew && item.owner === 'other' && html`<div class="block">
        <div class="block-h"><${Icon} n="users" s=${16} /><b>Follow-up</b><div class="grow"></div>
          <button class="btn btn-sm" onClick=${() => { logFollowUp(item.id); toast('Follow-up registrado.'); }}><${Icon} n="check" s=${14} />Cobrei hoje</button></div>
        <p class="muted">${fu?.needs ? html`<b class="late">${fu.label}: precisa de follow-up.</b> ` : ''}${item.lastFollowUp ? `Último: ${fmtDateTime(item.lastFollowUp)} (${fmtAgo(item.lastFollowUp, now)})` : 'Ainda não cobrado.'}</p>
        ${(item.followUps || []).length > 0 && html`<ul class="hist">${item.followUps.slice().reverse().map((f) => html`<li>${fmtDateTime(f.at)}${f.note ? ` · ${f.note}` : ''}</li>`)}</ul>`}
      </div>`}

      ${!isNew && !item.parentId && html`<div class="block">
        <div class="block-h"><${Icon} n="list" s=${16} /><b>Sub-tasks</b><span class="count">${subs.length}</span></div>
        ${subs.map((s) => html`<div class="sub">
          <input type="checkbox" checked=${s.status === 'done'} onChange=${(e) => updateItem(s.id, { status: e.target.checked ? 'done' : 'todo' })} aria-label="Concluir sub-task" />
          <button class="sub-t" onClick=${() => openItem(s.id)}>${s.subtype === 'inform' && html`<${Icon} n="msg" s=${13} />`} ${s.title}</button>
          ${s.deadline && html`<span class=${`due ${isOpen(s) && new Date(s.deadline) < now ? 'late' : ''}`}>${fmtRel(s.deadline, now)}</span>`}
        </div>`)}
        <input class="sub-add" placeholder="+ Adicionar sub-task e Enter" onKeyDown=${(e) => {
          if (e.key === 'Enter' && e.target.value.trim()) { addItem({ title: e.target.value.trim(), parentId: item.id, macrotemaId: item.macrotemaId, priority: item.priority, owner: 'me' }); e.target.value = ''; }
        }} />
      </div>`}

      ${!isNew && html`<div class="block">
        <div class="block-h"><${Icon} n="link" s=${16} /><b>Depende de</b></div>
        ${deps.map((d) => html`<div class="dep">
          <button class="sub-t" onClick=${() => openItem(d.id)}>${d.owner === 'other' && html`<${Avatar} name=${d.ownerName} size=${18} />`} ${d.title}</button>
          ${d.deadline && html`<span class=${`due ${isOpen(d) && new Date(d.deadline) < now ? 'late' : ''}`}>${isOpen(d) ? fmtRel(d.deadline, now) : 'concluído'}</span>`}
          <button class="btn btn-icon btn-xs" aria-label="Remover dependência" onClick=${() => set({ dependsOn: item.dependsOn.filter((x) => x !== d.id) })}><${Icon} n="x" s=${13} /></button>
        </div>`)}
        <select value="" onChange=${(e) => { if (e.target.value) set({ dependsOn: [...(item.dependsOn || []), e.target.value] }); }}>
          <option value="">+ Adicionar dependência…</option>
          ${depOptions.map((d) => html`<option value=${d.id}>${d.owner === 'other' ? `${d.ownerName}: ` : ''}${d.title}</option>`)}
        </select>
      </div>`}

      ${(item.postponements || []).length > 0 && html`<div class="block">
        <div class="block-h"><${Icon} n="clock" s=${16} /><b>Histórico de prazo</b><span class="count">${item.postponements.length}</span></div>
        <p class="muted">Prazo original: ${fmtDateTime(item.originalDeadline)}</p>
        <ul class="hist">${item.postponements.slice().reverse().map((p) => html`<li><b>${fmtShort(p.from)} → ${fmtShort(p.to)}</b> · ${p.reason || 'sem motivo'} <span class="muted">(${fmtShort(p.at)})</span></li>`)}</ul>
      </div>`}

      ${occ && html`<p class="muted small">Criado na reunião <button class="linkish" onClick=${() => openOcc(occ.key)}>${occ.series.title} · ${fmtDate(occ.start)}</button></p>`}
    </div>
    ${isNew && html`<footer class="drawer-f"><button class="btn" onClick=${closeDrawer}>Cancelar</button><button class="btn btn-primary" onClick=${create}>Criar</button></footer>`}
  </div>`;
}

// ===================== REUNIÃO (ocorrência) =====================
function AgendaRow({ k, a }) {
  const [adding, setAdding] = useState(false);
  const [lbl, setLbl] = useState(''); const [url, setUrl] = useState('');
  const addLink = () => {
    if (!url.trim()) return;
    const u = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    updateAgenda(k, a.id, { links: [...(a.links || []), { label: lbl.trim() || u.replace(/^https?:\/\//, '').slice(0, 40), url: u }] });
    setLbl(''); setUrl(''); setAdding(false);
  };
  return html`<div class=${`agenda pb-${a.priority} ${a.discussed ? 'is-done' : ''}`}>
    <div class="agenda-top">
      <input type="checkbox" checked=${a.discussed} onChange=${(e) => updateAgenda(k, a.id, { discussed: e.target.checked })} title="Discutido" aria-label="Marcar como discutido" />
      <${AutoText} placeholder="Pauta…" value=${a.text} onInput=${(e) => updateAgenda(k, a.id, { text: e.target.value })} />
      <button class="btn btn-icon btn-xs" aria-label="Remover pauta" onClick=${() => removeAgenda(k, a.id)}><${Icon} n="x" s=${14} /></button>
    </div>
    <div class="agenda-meta">
      <select class="mini" value=${a.priority} onChange=${(e) => updateAgenda(k, a.id, { priority: +e.target.value })}>${[0, 1, 2, 3].map((p) => html`<option value=${p}>P${p}</option>`)}</select>
      <select class="mini" value=${a.macrotemaId || ''} onChange=${(e) => updateAgenda(k, a.id, { macrotemaId: e.target.value || null })}>
        <option value="">Sem macrotema</option>${S().macrotemas.map((m) => html`<option value=${m.id}>${m.name}</option>`)}
      </select>
      ${a.carriedFrom && html`<span class="flag warn">Veio de ${fmtShort(a.carriedFrom + 'T12:00')}</span>`}
      ${a.carriedTo && !a.discussed && html`<span class="flag">Passou para ${fmtShort(a.carriedTo.split('|')[1] + 'T12:00')}</span>`}
      ${(a.links || []).map((l, i) => html`<span class="doclink"><a href=${l.url} target="_blank" rel="noopener"><${Icon} n="link" s=${12} />${l.label}</a>
        <button aria-label="Remover link" onClick=${() => updateAgenda(k, a.id, { links: a.links.filter((_, j) => j !== i) })}><${Icon} n="x" s=${11} /></button></span>`)}
      ${!adding && html`<button class="btn btn-ghost btn-xs" onClick=${() => setAdding(true)}><${Icon} n="link" s=${12} />Link de documento</button>`}
    </div>
    ${adding && html`<div class="linkform">
      <input placeholder="Nome (opcional)" value=${lbl} onInput=${(e) => setLbl(e.target.value)} />
      <input placeholder="https://…" value=${url} onInput=${(e) => setUrl(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && addLink()} />
      <button class="btn btn-sm btn-primary" onClick=${addLink}>Adicionar</button>
      <button class="btn btn-sm btn-ghost" onClick=${() => setAdding(false)}>Cancelar</button>
    </div>`}
  </div>`;
}

function ActionForm({ k, series }) {
  const st = S();
  const [t, setT] = useState(''); const [owner, setOwner] = useState('me'); const [name, setName] = useState('');
  const [dl, setDl] = useState(''); const [p, setP] = useState(2);
  const add = () => {
    if (!t.trim()) return;
    if (owner === 'other' && !name.trim()) { toast('Informe o responsável.'); return; }
    let deadline = fromInput(dl);
    addItem({ title: t.trim(), owner, ownerName: owner === 'other' ? name : '', deadline, priority: p, macrotemaId: series.macrotemaId, fromOcc: k, status: owner === 'other' ? 'waiting' : 'todo', stakeholders: [] });
    setT(''); setName(''); setDl(''); toast('Encaminhamento virou task.');
  };
  return html`<div class="actform">
    <input placeholder="Encaminhamento (vira task)…" value=${t} onInput=${(e) => setT(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && add()} />
    <div class="row wrap">
      <${Seg} small value=${owner} onChange=${setOwner} options=${[{ value: 'me', label: 'Eu' }, { value: 'other', label: 'Terceiro' }]} />
      ${owner === 'other' && html`<input class="w-name" list="ppl-occ" placeholder="Responsável" value=${name} onInput=${(e) => setName(e.target.value)} />
        <datalist id="ppl-occ">${[...new Set([...(series.participants || []), ...people()])].map((x) => html`<option value=${x} />`)}</datalist>`}
      <input type="datetime-local" class="w-date" value=${dl} onInput=${(e) => setDl(e.target.value)} aria-label="Prazo" />
      <select class="mini" value=${p} onChange=${(e) => setP(+e.target.value)}>${[0, 1, 2, 3].map((x) => html`<option value=${x}>P${x}</option>`)}</select>
      <button class="btn btn-sm btn-primary" onClick=${add}>Criar</button>
    </div>
  </div>`;
}

export function OccDrawer({ k }) {
  const st = S(); const now = new Date();
  const o = occurrenceByKey(st, k);
  if (!o) return html`<div class="drawer-in"><header class="drawer-h"><div class="grow"></div><button class="btn btn-icon" onClick=${closeDrawer}><${Icon} n="x" /></button></header><div class="drawer-b"><${Empty} text="Reunião não encontrada." /></div></div>`;
  const rec = o.rec || { agenda: [], notes: '' };
  const s = o.series;
  const actions = st.items.filter((i) => i.fromOcc === k);
  const minsTo = Math.round((o.start - now) / 60000);
  const empty = !rec.agenda.some((a) => (a.text || '').trim());
  const nx = s.recur?.freq && s.recur.freq !== 'none' ? nextOccurrence(s, o.end) : null;
  const pendingCount = rec.agenda.filter((a) => !a.discussed && (a.text || '').trim()).length;
  return html`<div class="drawer-in">
    <header class="drawer-h">
      <span class="drawer-kicker">${s.lead ? 'Reunião que você lidera' : 'Reunião'}</span>
      <div class="grow"></div>
      <button class="btn btn-icon" aria-label="Editar série" title="Editar reunião/série" onClick=${() => openModal({ type: 'series', id: s.id })}><${Icon} n="sliders" s=${17} /></button>
      <button class="btn btn-icon" aria-label="Fechar" onClick=${closeDrawer}><${Icon} n="x" /></button>
    </header>
    <div class="drawer-b">
      <h2 class="occ-h">${s.title}</h2>
      <p class="muted">${fmtDate(o.start)} · ${fmtTime(o.start)}–${fmtTime(o.end)} · ${recurText(s)}</p>
      ${s.link && html`<p class="small"><a href=${/^https?:/.test(s.link) ? s.link : '#'} target="_blank" rel="noopener">${s.link}</a></p>`}
      ${(s.participants || []).length > 0 && html`<div class="ppl-row">${s.participants.map((p) => html`<span class="chip"><${Avatar} name=${p} size=${16} />${p}</span>`)}</div>`}
      ${s.lead && empty && o.end > now && html`<div class="callout danger"><${Icon} n="alert" s=${16} /><div><b>Sem pauta</b><span>${minsTo > 0 ? `Começa ${fmtRel(o.start, now)}. ` : ''}Adicione os pontos que você vai abordar.</span></div></div>`}
      ${!s.lead && html`<div class="callout"><div><b>Você não está marcada como lead</b><span>Alertas de pauta só valem para reuniões que você lidera.</span></div>
        <button class="btn btn-sm" onClick=${() => mutate((x) => { x.series.find((y) => y.id === s.id).lead = true; })}>Eu lidero esta reunião</button></div>`}

      <div class="block">
        <div class="block-h"><${Icon} n="list" s=${16} /><b>Pauta</b><span class="count">${rec.agenda.length}</span></div>
        ${rec.agenda.map((a) => html`<${AgendaRow} k=${k} a=${a} key=${a.id} />`)}
        <button class="btn btn-ghost btn-sm add-row" onClick=${() => addAgendaItem(k, { macrotemaId: s.macrotemaId })}><${Icon} n="plus" s=${15} />Adicionar pauta</button>
      </div>

      <div class="block">
        <div class="block-h"><${Icon} n="doc" s=${16} /><b>Notas e decisões</b></div>
        <textarea rows="4" placeholder="O que foi decidido…" value=${rec.notes} onInput=${(e) => updateOcc(k, { notes: e.target.value })}></textarea>
      </div>

      <div class="block">
        <div class="block-h"><${Icon} n="arrow" s=${16} /><b>Encaminhamentos</b><span class="count">${actions.length}</span></div>
        ${actions.length > 0 && html`<div class="stack">${actions.map((i) => html`<${Card} item=${i} now=${now} />`)}</div>`}
        <${ActionForm} k=${k} series=${s} />
      </div>

      ${nx && html`<p class="muted small">Pautas não marcadas como discutidas passam automaticamente para a próxima: ${fmtDate(nx.start)}.</p>`}
    </div>
    ${s.lead && html`<footer class="drawer-f">
      ${rec.closed ? html`<span class="muted">Reunião encerrada.</span>` : html`<button class="btn btn-primary" onClick=${() => {
        updateOcc(k, { closed: true });
        toast(pendingCount && nx ? `${pendingCount} pauta${pendingCount > 1 ? 's' : ''} movida${pendingCount > 1 ? 's' : ''} para ${fmtShort(nx.start)}.` : 'Reunião encerrada.');
        import('./engine.js').then((m) => m.tick(new Date(), { force: k }));
      }}><${Icon} n="check" s=${16} />Encerrar reunião</button>`}
    </footer>`}
  </div>`;
}

// ===================== MODAIS =====================
function Modal({ title, children, footer, onClose = closeModal, size = '' }) {
  return html`<div class="modal-bg" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div class=${`modal ${size}`} role="dialog" aria-modal="true" aria-label=${title}>
      <header class="modal-h"><h3>${title}</h3><button class="btn btn-icon" aria-label="Fechar" onClick=${onClose}><${Icon} n="x" /></button></header>
      <div class="modal-b">${children}</div>
      ${footer && html`<footer class="modal-f">${footer}</footer>`}
    </div>
  </div>`;
}

// Pergunta de 24h (abre sozinha quando há perguntas pendentes)
export function AskModal() {
  const qs = questions(S(), new Date());
  const focus = U().askFocus;
  const q = qs.find((x) => x.item.id === focus) || qs[0];
  if (!q) return null;
  const i = q.item; const now = new Date();
  const snooze = () => setUI({ askSnoozeUntil: Date.now() + 30 * 60000, askFocus: null });
  return html`<${Modal} title=${q.type === 'ask' ? 'Vou conseguir entregar no prazo?' : 'O prazo passou. Você entregou?'} onClose=${snooze} size="sm">
    <div class="ask-card pb-${i.priority}">
      <div class="ask-title">${i.title}</div>
      <div class="card-meta"><${Prio} p=${i.priority} /><${MacroPill} id=${i.macrotemaId} /></div>
      <div class="ask-due ${q.type === 'overdue' ? 'late' : ''}"><${Icon} n="clock" s=${15} />${fmtDateTime(i.deadline)} · ${fmtRel(i.deadline, now)}</div>
    </div>
    <div class="ask-btns">
      ${q.type === 'ask'
        ? html`<button class="btn btn-lg btn-yes" onClick=${() => { answerYes(i.id); setUI({ askFocus: null }); toast('Combinado. O card fica onde está.'); }}><${Icon} n="check" />Sim, vou entregar</button>`
        : html`<button class="btn btn-lg btn-yes" onClick=${() => { markDone(i.id); setUI({ askFocus: null }); toast('Marcado como entregue.'); }}><${Icon} n="check" />Sim, entreguei</button>`}
      <button class="btn btn-lg btn-no" onClick=${() => setUI({ modal: { type: 'postpone', id: i.id, mine: true }, askFocus: null })}><${Icon} n="calendar" />Não, preciso de nova data</button>
    </div>
    <div class="ask-foot">${qs.length > 1 && html`<span class="muted">${qs.length - 1} outra${qs.length > 2 ? 's' : ''} pergunta${qs.length > 2 ? 's' : ''} na fila</span>`}<div class="grow"></div>
      <button class="btn btn-ghost btn-sm" onClick=${snooze}>Responder depois</button></div>
  <//>`;
}

export function PostponeModal({ id, mine, proposed }) {
  const st = S();
  const it = st.items.find((x) => x.id === id);
  const init = proposed || (it?.deadline ? addDays(it.deadline, 1).toISOString() : null);
  const [when, setWhen] = useState(toInput(init));
  const [reason, setReason] = useState('');
  const [stake, setStake] = useState(it?.stakeholders || []);
  const [inform, setInform] = useState(mine);
  if (!it) return null;
  const newISO = fromInput(when);
  const now = new Date();
  const errs = [];
  if (!newISO) errs.push('Escolha a nova data.');
  else if (new Date(newISO) <= now) errs.push('A nova data precisa ser no futuro.');
  if (mine && !reason.trim()) errs.push('O motivo é obrigatório.');
  const preview = newISO ? informMessage({ ...it, stakeholders: stake }, it.deadline, newISO, reason.trim() || '…') : '';
  const confirm = () => {
    if (errs.length) return;
    if (stake.join() !== it.stakeholders.join()) updateItem(id, { stakeholders: stake });
    const informId = postpone(id, newISO, reason.trim(), { createInform: inform });
    toast(inform ? 'Prazo atualizado e sub-task de aviso criada.' : 'Prazo atualizado.');
    const sugg = occurrencesBetween(S(), new Date(), addDays(new Date(), 21), { leadOnly: true })
      .filter((o) => stake.some((p) => hasPerson(o.series, p)));
    if (inform && sugg.length) setUI({ modal: { type: 'pauta', id, informId, reason: reason.trim() } });
    else closeModal();
  };
  return html`<${Modal} title=${mine ? 'Nova data de entrega' : `Registrar novo prazo de ${it.ownerName || 'terceiro'}`} footer=${html`
      <button class="btn" onClick=${closeModal}>Cancelar</button>
      <button class="btn btn-primary" disabled=${errs.length > 0} onClick=${confirm}>Mover para nova data</button>`}>
    <p class="muted">${it.title}<br />Prazo atual: <b>${fmtDateTime(it.deadline)}</b></p>
    <${Field} label="Nova data e hora"><input type="datetime-local" value=${when} onInput=${(e) => setWhen(e.target.value)} /><//>
    <${Field} label=${mine ? 'Motivo (obrigatório)' : 'Motivo (opcional)'}><textarea rows="2" placeholder="Ex.: aguardando retorno do time de Produto sobre o rate limit" value=${reason} onInput=${(e) => setReason(e.target.value)}></textarea><//>
    <${Field} label="Stakeholders a informar"><${PeopleInput} value=${stake} suggestions=${people()} onChange=${setStake} /><//>
    <label class="check"><input type="checkbox" checked=${inform} onChange=${(e) => setInform(e.target.checked)} />Criar sub-task "Informar stakeholders" (prazo: ${st.settings.informWithinHours}h)</label>
    ${inform && newISO && html`<div class="preview"><span class="field-l">Mensagem sugerida</span><pre>${preview}</pre></div>`}
    ${inform && !stake.length && html`<p class="warn-txt">Sem stakeholders cadastrados: a mensagem fica genérica.</p>`}
    ${errs.length > 0 && when && html`<p class="warn-txt">${errs[0]}</p>`}
  <//>`;
}

// Depois do adiamento: sugere levar o assunto para a próxima reunião com os stakeholders
export function PautaModal({ id, informId, reason }) {
  const st = S(); const it = st.items.find((x) => x.id === id);
  const [done, setDone] = useState([]);
  if (!it) return null;
  const sugg = occurrencesBetween(st, new Date(), addDays(new Date(), 21), { leadOnly: true })
    .filter((o) => (it.stakeholders || []).some((p) => hasPerson(o.series, p)))
    .filter((o, i, arr) => arr.findIndex((x) => x.series.id === o.series.id) === i).slice(0, 5);
  const last = it.postponements[it.postponements.length - 1];
  const add = (o) => {
    addAgendaItem(o.key, { text: `Comunicar novo prazo de "${it.title}": ${fmtShort(last.from)} → ${fmtShort(last.to)}. Motivo: ${reason}`, macrotemaId: it.macrotemaId, priority: it.priority });
    setDone([...done, o.key]); toast('Pauta adicionada.');
  };
  return html`<${Modal} title="Levar para uma reunião?" size="sm" footer=${html`<button class="btn" onClick=${() => { closeModal(); if (informId) openItem(informId); }}>Ver mensagem de aviso</button><button class="btn btn-primary" onClick=${closeModal}>Concluir</button>`}>
    <p class="muted">Você tem reuniões com esses stakeholders em breve. Quer incluir a mudança de prazo como pauta?</p>
    <div class="occ-list">${sugg.map((o) => html`<div class="sugg">
      <div><b>${o.series.title}</b><span>${fmtDate(o.start)} · ${fmtTime(o.start)}</span></div>
      ${done.includes(o.key) ? html`<span class="badge ok"><${Icon} n="check" s=${12} />Adicionada</span>` : html`<button class="btn btn-sm" onClick=${() => add(o)}>Adicionar pauta</button>`}
    </div>`)}</div>
  <//>`;
}

export function SeriesModal({ id }) {
  const st = S();
  const ex = id && st.series.find((x) => x.id === id);
  const base = ex || (() => { const d = new Date(Date.now() + H); d.setMinutes(0, 0, 0); return { title: '', start: d.toISOString(), durationMin: 30, recur: { freq: 'weekly', interval: 1, byDay: [d.getDay()], exdates: [] }, lead: true, participants: [], macrotemaId: null, link: '' }; })();
  const freqOf = (r) => (!r || r.freq === 'none' ? 'none' : r.freq === 'weekly' && r.interval === 2 ? 'biweekly' : r.freq === 'weekly' && (r.byDay || []).join() === '1,2,3,4,5' ? 'weekdays' : r.freq);
  const [f, setF] = useState({ ...base, freq: freqOf(base.recur), byDay: base.recur?.byDay?.length ? base.recur.byDay : [new Date(base.start).getDay()], until: base.recur?.until || '' });
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const save = () => {
    if (!f.title.trim()) { toast('Dê um nome para a reunião.'); return; }
    const recur = f.freq === 'none' ? { freq: 'none', exdates: [] }
      : f.freq === 'weekdays' ? { freq: 'weekly', interval: 1, byDay: [1, 2, 3, 4, 5] }
      : f.freq === 'biweekly' ? { freq: 'weekly', interval: 2, byDay: f.byDay }
      : f.freq === 'weekly' ? { freq: 'weekly', interval: 1, byDay: f.byDay }
      : { freq: f.freq, interval: 1 };
    recur.exdates = ex?.recur?.exdates || [];
    recur.until = f.until ? new Date(`${f.until.slice(0, 10)}T23:59`).toISOString() : null;
    const data = { title: f.title.trim(), start: f.start, durationMin: +f.durationMin || 30, recur, lead: f.lead, participants: f.participants, macrotemaId: f.macrotemaId, link: f.link };
    mutate((s) => {
      if (ex) Object.assign(s.series.find((x) => x.id === id), data);
      else s.series.push({ id: uid(), source: 'manual', ...data });
    });
    toast(ex ? 'Reunião atualizada.' : 'Reunião criada.'); closeModal();
  };
  const del = () => {
    if (!confirm('Excluir esta reunião/série e as pautas dela?')) return;
    mutate((s) => { s.series = s.series.filter((x) => x.id !== id); for (const k of Object.keys(s.occ)) if (k.startsWith(`${id}|`)) delete s.occ[k]; });
    setUI({ modal: null, drawer: null }); toast('Reunião excluída.');
  };
  return html`<${Modal} title=${ex ? 'Editar reunião' : 'Nova reunião'} footer=${html`
      ${ex && html`<button class="btn btn-ghost danger-txt" onClick=${del}><${Icon} n="trash" s=${15} />Excluir</button>`}<div class="grow"></div>
      <button class="btn" onClick=${closeModal}>Cancelar</button><button class="btn btn-primary" onClick=${save}>Salvar</button>`}>
    <${Field} label="Nome"><input value=${f.title} placeholder="Ex.: Weekly Integrações de API" onInput=${(e) => set({ title: e.target.value })} /><//>
    <div class="grid2">
      <${Field} label=${f.freq === 'none' ? 'Data e hora' : 'Primeira ocorrência'}><input type="datetime-local" value=${toInput(f.start)} onChange=${(e) => { const v = fromInput(e.target.value); if (v) set({ start: v, byDay: f.freq === 'weekly' || f.freq === 'biweekly' ? [...new Set([...f.byDay.filter((d) => d !== new Date(f.start).getDay()), new Date(v).getDay()])] : f.byDay }); }} /><//>
      <${Field} label="Duração"><select value=${f.durationMin} onChange=${(e) => set({ durationMin: +e.target.value })}>${[15, 30, 45, 60, 90, 120].map((m) => html`<option value=${m}>${m} min</option>`)}</select><//>
    </div>
    <${Field} label="Repetição"><select value=${f.freq} onChange=${(e) => set({ freq: e.target.value })}>
      <option value="none">Não repete</option><option value="daily">Diária</option><option value="weekdays">Dias úteis</option>
      <option value="weekly">Semanal</option><option value="biweekly">Quinzenal</option><option value="monthly">Mensal</option></select><//>
    ${(f.freq === 'weekly' || f.freq === 'biweekly') && html`<div class="days">${[1, 2, 3, 4, 5, 6, 0].map((d) => html`<button type="button" class=${f.byDay.includes(d) ? 'on' : ''} onClick=${() => set({ byDay: f.byDay.includes(d) ? (f.byDay.length > 1 ? f.byDay.filter((x) => x !== d) : f.byDay) : [...f.byDay, d] })}>${WD[d]}</button>`)}</div>`}
    ${f.freq !== 'none' && html`<${Field} label="Termina em (opcional)"><input type="date" value=${f.until ? dayKey(f.until) : ''} onInput=${(e) => set({ until: e.target.value })} /><//>`}
    <label class="check strong"><input type="checkbox" checked=${f.lead} onChange=${(e) => set({ lead: e.target.checked })} />Eu lidero esta reunião (vale para todas as ocorrências)</label>
    <${Field} label="Participantes"><${PeopleInput} value=${f.participants} suggestions=${people()} onChange=${(v) => set({ participants: v })} /><//>
    <div class="grid2">
      <${Field} label="Macrotema padrão"><${MacroSelect} value=${f.macrotemaId} onChange=${(v) => set({ macrotemaId: v })} /><//>
      <${Field} label="Link / sala"><input value=${f.link} placeholder="Link da chamada" onInput=${(e) => set({ link: e.target.value })} /><//>
    </div>
  <//>`;
}

export function IcsModal() {
  const st = S();
  const [events, setEvents] = useState(null);
  const [sel, setSel] = useState({});
  const [email, setEmail] = useState(st.settings.myEmail || '');
  const read = (text) => {
    try {
      const evs = parseICS(text).filter((e) => isFutureRelevant(e));
      const s = {};
      evs.forEach((e) => {
        const existing = st.series.find((x) => x.uid === e.uid);
        const mineOrg = email && e.organizer === email.trim().toLowerCase();
        s[e.uid] = { import: true, lead: existing ? existing.lead : !!mineOrg };
      });
      setEvents(evs); setSel(s);
      if (!evs.length) toast('Nenhum evento futuro encontrado no arquivo.');
    } catch (err) { toast('Não consegui ler este arquivo .ics.'); }
  };
  const doImport = () => {
    let n = 0;
    mutate((s) => {
      s.settings.myEmail = email.trim();
      for (const e of events) {
        const c = sel[e.uid]; if (!c?.import) continue;
        const data = { title: e.title, start: e.start, durationMin: e.durationMin, recur: e.recur, participants: e.participants.slice(0, 20), link: e.link, uid: e.uid, organizer: e.organizer, source: 'ics', lead: c.lead };
        const ex = s.series.find((x) => x.uid === e.uid);
        if (ex) Object.assign(ex, data); else s.series.push({ id: uid(), macrotemaId: null, ...data });
        n++;
        for (const ov of e.overrides || []) {
          const ouid = `${ov.uid}#${dayKey(ov.start)}`;
          const od = { title: ov.title, start: ov.start, durationMin: ov.durationMin, recur: { freq: 'none', exdates: [] }, participants: ov.participants.slice(0, 20), link: ov.link, uid: ouid, source: 'ics', lead: c.lead };
          const oe = s.series.find((x) => x.uid === ouid);
          if (oe) Object.assign(oe, od); else s.series.push({ id: uid(), macrotemaId: null, ...od });
        }
      }
    });
    toast(`${n} reunião(ões) importada(s).`); closeModal();
  };
  return html`<${Modal} title="Importar reuniões (.ics)" size="lg" footer=${events && html`<button class="btn" onClick=${() => setEvents(null)}>Voltar</button><button class="btn btn-primary" onClick=${doImport}>Importar selecionadas</button>`}>
    ${!events ? html`
      <p class="muted">Exporte a agenda (ou uma reunião) do Daxiang como arquivo <b>.ics</b> e selecione aqui. Reimportar o mesmo arquivo atualiza as reuniões sem perder pautas nem a marcação de lead.</p>
      <${Field} label="Seu e-mail na agenda (opcional)" hint="Reuniões em que você é organizadora já vêm marcadas como lead."><input type="email" value=${email} placeholder="voce@empresa.com" onInput=${(e) => setEmail(e.target.value)} /><//>
      <label class="dropfile"><${Icon} n="upload" s=${22} /><b>Escolher arquivo .ics</b><span>ou arraste aqui</span>
        <input type="file" accept=".ics,text/calendar" onChange=${async (e) => { const f = e.target.files[0]; if (f) read(await f.text()); }} /></label>
      <details class="small"><summary>Colar conteúdo .ics</summary><textarea rows="5" placeholder="BEGIN:VCALENDAR…" onChange=${(e) => e.target.value.trim() && read(e.target.value)}></textarea></details>`
    : html`
      <p class="muted">${events.length} reunião(ões) com ocorrências futuras. Marque quais importar e quais você lidera.</p>
      <div class="ics-list">
        <div class="ics-row head"><span>Importar</span><span>Reunião</span><span>Lead</span></div>
        ${events.map((e) => html`<div class="ics-row">
          <input type="checkbox" checked=${sel[e.uid]?.import} onChange=${(ev) => setSel({ ...sel, [e.uid]: { ...sel[e.uid], import: ev.target.checked } })} aria-label="Importar" />
          <div><b>${e.title}</b><span>${recurText({ ...e })} · ${fmtDate(e.start)}${e.organizerName ? ` · org.: ${e.organizerName}` : ''}</span></div>
          <label class="switch"><input type="checkbox" checked=${sel[e.uid]?.lead} onChange=${(ev) => setSel({ ...sel, [e.uid]: { ...sel[e.uid], lead: ev.target.checked } })} /><span></span></label>
        </div>`)}
      </div>`}
  <//>`;
}

function PasswordBox() {
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [busy, setBusy] = useState(false);
  const err = pw && pw.length < 8 ? 'Mínimo de 8 caracteres.' : pw2 && pw !== pw2 ? 'As senhas não conferem.' : '';
  const save = async () => {
    setBusy(true);
    try { await setPassword(pw); setPw(''); setPw2(''); toast('Senha definida. Use-a para entrar no app do iPhone.'); } catch (e) { toast(e.message); }
    setBusy(false);
  };
  return html`<div class="set-sec">
    <h4>Conta</h4>
    <p class="muted small">Defina uma senha para entrar no app instalado do iPhone (lá o link do e-mail não funciona).</p>
    <div class="grid2">
      <${Field} label="Nova senha"><input type="password" autocomplete="new-password" value=${pw} onInput=${(e) => setPw(e.target.value)} /><//>
      <${Field} label="Repita a senha"><input type="password" autocomplete="new-password" value=${pw2} onInput=${(e) => setPw2(e.target.value)} /><//>
    </div>
    ${err && html`<p class="warn-txt">${err}</p>`}
    <button class="btn btn-sm btn-primary" disabled=${busy || !pw || !!err || pw !== pw2} onClick=${save}>Salvar senha</button>
  </div>`;
}

function PushBox() {
  const [on, setOn] = useState(pushEnabledHere());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text } — fica visível, não some como o aviso rápido
  const [diag, setDiag] = useState(null);
  const sup = pushSupport();
  const refresh = () => pushDiagnose().then(setDiag).catch(() => {});
  useEffect(() => { refresh(); }, []);
  const run = async (fn, ok) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); setOn(pushEnabledHere()); } catch (e) { setMsg({ ok: false, text: e.message || String(e) }); }
    setBusy(false); refresh();
  };
  return html`<div class="push-box">
    <div class="notif-perm">
      <div><b>Alertas neste aparelho</b><span class="muted">${!sup.ok ? sup.reason
        : on ? 'Ativados. Chegam mesmo com o app fechado, inclusive no fim de semana (respeitando o silêncio).'
        : 'Ative em cada aparelho onde quer receber: iPhone e computador.'}</span></div>
      ${sup.ok && (on
        ? html`<div class="row"><button class="btn btn-sm" disabled=${busy} onClick=${() => run(sendTest, 'Teste enviado. Deve chegar em até 1 minuto (pode bloquear a tela para ver).')}>Enviar teste</button>
            <button class="btn btn-sm btn-ghost" disabled=${busy} onClick=${() => run(disablePush, 'Alertas desativados neste aparelho.')}>Desativar</button></div>`
        : html`<button class="btn btn-sm btn-primary" disabled=${busy} onClick=${() => run(enablePush, 'Alertas ativados neste aparelho.')}>${busy ? 'Ativando…' : 'Ativar'}</button>`)}
    </div>
    ${msg && html`<p class=${msg.ok ? 'ok-txt' : 'warn-txt'}>${msg.text}</p>`}
    ${diag && html`<details class="push-diag"><summary>Diagnóstico</summary>
      <table>${diag.map(([k, v]) => html`<tr><td>${k}</td><td><b>${v}</b></td></tr>`)}</table></details>`}
  </div>`;
}

export function SettingsModal() {
  const st = S(); const s = st.settings;
  const setS = (p) => mutate((x) => { Object.assign(x.settings, p); });
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const [, re] = useState(0);
  const fileRef = useRef();
  const hours = [...Array(24)].map((_, h) => h);
  return html`<${Modal} title="Configurações" size="lg">
    <${PasswordBox} />
    <div class="set-sec">
      <h4>Macrotemas</h4>
      <div class="macro-edit">
        ${st.macrotemas.map((m) => html`<div class="macro-row">
          <div class="swatches">${PALETTE.map((c) => html`<button type="button" class=${c === m.color ? 'on' : ''} style=${`background:${c}`} aria-label=${`Cor ${c}`} onClick=${() => mutate((x) => { x.macrotemas.find((y) => y.id === m.id).color = c; })}></button>`)}</div>
          <input value=${m.name} onInput=${(e) => mutate((x) => { x.macrotemas.find((y) => y.id === m.id).name = e.target.value; })} />
          <button class="btn btn-icon btn-xs" aria-label="Excluir macrotema" onClick=${() => {
            const used = st.items.filter((i) => i.macrotemaId === m.id).length;
            if (used && !confirm(`${used} item(ns) usam "${m.name}". Eles ficarão sem macrotema. Excluir?`)) return;
            mutate((x) => { x.macrotemas = x.macrotemas.filter((y) => y.id !== m.id); x.items.forEach((i) => { if (i.macrotemaId === m.id) i.macrotemaId = null; }); });
          }}><${Icon} n="trash" s=${14} /></button>
        </div>`)}
        <button class="btn btn-ghost btn-sm add-row" onClick=${() => mutate((x) => { x.macrotemas.push({ id: uid(), name: 'Novo macrotema', color: PALETTE[x.macrotemas.length % PALETTE.length] }); })}><${Icon} n="plus" s=${15} />Adicionar macrotema</button>
      </div>
    </div>
    <div class="set-sec">
      <h4>Alertas</h4>
      <div class="grid2">
        <${Field} label="Perguntar sobre minhas entregas" hint="Antes do prazo"><select value=${s.alertLeadHours} onChange=${(e) => setS({ alertLeadHours: +e.target.value })}>${[12, 24, 36, 48].map((h) => html`<option value=${h}>${h}h antes</option>`)}</select><//>
        <${Field} label="Repetir se eu não responder"><select value=${s.repeatHours} onChange=${(e) => setS({ repeatHours: +e.target.value })}>${[2, 4, 6, 12].map((h) => html`<option value=${h}>a cada ${h}h</option>`)}</select><//>
        <${Field} label="Silêncio: início" hint="Alertas que cairiam aqui são antecipados para 1h antes"><select value=${s.quietStart} onChange=${(e) => setS({ quietStart: +e.target.value })}>${hours.map((h) => html`<option value=${h}>${h}h</option>`)}</select><//>
        <${Field} label="Silêncio: fim"><select value=${s.quietEnd} onChange=${(e) => setS({ quietEnd: +e.target.value })}>${hours.map((h) => html`<option value=${h}>${h}h</option>`)}</select><//>
        <${Field} label="Follow-up de terceiros"><select value=${s.followUpDaysBefore} onChange=${(e) => setS({ followUpDaysBefore: +e.target.value })}>${[1, 2, 3, 5].map((d) => html`<option value=${d}>${d} dia(s) antes + no dia</option>`)}</select><//>
        <${Field} label="Checagem de pauta"><select value=${s.preMeetingMinutes} onChange=${(e) => setS({ preMeetingMinutes: +e.target.value })}>${[30, 60, 90, 120].map((m) => html`<option value=${m}>${m} min antes</option>`)}</select><//>
        <${Field} label="Resumo do dia"><select value=${s.digestHour} onChange=${(e) => setS({ digestHour: +e.target.value })}>${[6, 7, 8, 9, 10].map((h) => html`<option value=${h}>às ${h}h</option>`)}</select><//>
        <${Field} label="Horário padrão de prazo"><input type="time" value=${s.defaultTime} onChange=${(e) => setS({ defaultTime: e.target.value || '18:00' })} /><//>
        <${Field} label="Check diário de agenda" hint="Lembrete repete até você marcar como conferida"><select value=${!s.agendaCheck ? 'off' : s.agendaCheckDays} onChange=${(e) => setS(e.target.value === 'off' ? { agendaCheck: false } : { agendaCheck: true, agendaCheckDays: e.target.value })}>
          <option value="all">Todos os dias</option><option value="weekdays">Só dias úteis</option><option value="off">Desligado</option></select><//>
        <${Field} label="Prazo para avisar stakeholders"><select value=${s.informWithinHours} onChange=${(e) => setS({ informWithinHours: +e.target.value })}>${[1, 2, 4, 8, 24].map((h) => html`<option value=${h}>${h}h após o "Não"</option>`)}</select><//>
      </div>
      <${PushBox} />
    </div>
    <div class="set-sec">
      <h4>Testar fluxos</h4>
      <div class="row wrap">
        <button class="btn btn-sm" onClick=${() => {
          const it = st.items.find((i) => isMine(i) && isOpen(i) && i.deadline && i.subtype !== 'inform' && new Date(i.deadline) > new Date());
          if (!it) { toast('Crie uma task sua com prazo futuro para testar.'); return; }
          mutate((x) => { const y = x.items.find((z) => z.id === it.id); y.ans = null; y.deadline = new Date(Date.now() + 10 * H).toISOString(); });
          setUI({ modal: null, askSnoozeUntil: 0, askFocus: it.id });
        }}><${Icon} n="play" s=${14} />Simular pergunta de 24h</button>
        <button class="btn btn-sm" onClick=${() => { import('./engine.js').then((m) => m.tick()); toast('Alertas verificados.'); }}>Verificar alertas agora</button>
      </div>
    </div>
    <div class="set-sec">
      <h4>Dados</h4>
      <p class="muted small">Nesta versão os dados ficam só neste navegador. Na fase 2 eles vão para o Supabase e sincronizam com o iPhone.</p>
      <div class="row wrap">
        <button class="btn btn-sm" onClick=${() => download(`tracker-backup-${dayKey(new Date())}.json`, JSON.stringify(S(), null, 2), 'application/json')}><${Icon} n="download" s=${15} />Exportar backup</button>
        <button class="btn btn-sm" onClick=${() => fileRef.current.click()}><${Icon} n="upload" s=${15} />Restaurar backup</button>
        <input type="file" accept="application/json" ref=${fileRef} hidden onChange=${async (e) => { const f = e.target.files[0]; if (!f) return; try { const d = JSON.parse(await f.text()); if (!d.items || !d.series) throw 0; if (confirm('Substituir todos os dados atuais por este backup?')) { replaceState(d); toast('Backup restaurado.'); } } catch { toast('Arquivo de backup inválido.'); } }} />
        ${hasDemo() && html`<button class="btn btn-sm danger-txt" onClick=${() => { if (confirm('Remover todos os dados de exemplo?')) { clearDemo(); toast('Exemplos removidos.'); } }}><${Icon} n="trash" s=${15} />Remover dados de exemplo</button>`}
      </div>
    </div>
  <//>`;
}

export function NotifPanel() {
  const st = S(); const now = new Date();
  const go = (n) => {
    mutate((x) => { const y = x.notifs.find((z) => z.id === n.id); if (y) y.read = true; });
    const r = n.ref || {};
    if (r.type === 'ask') setUI({ modal: null, askSnoozeUntil: 0, askFocus: r.id, notifOpen: false });
    else if (r.type === 'item') setUI({ drawer: { type: 'item', id: r.id }, notifOpen: false });
    else if (r.type === 'occ') setUI({ drawer: { type: 'occ', key: r.key }, notifOpen: false });
    else { setUI({ notifOpen: false }); location.hash = '#/hoje'; }
  };
  return html`<div class="notif-bg" onClick=${(e) => { if (e.target === e.currentTarget) setUI({ notifOpen: false }); }}>
    <div class="notif-panel">
      <header><b>Notificações</b><div class="grow"></div>
        ${st.notifs.some((n) => !n.read) && html`<button class="btn btn-ghost btn-xs" onClick=${() => mutate((x) => { x.notifs.forEach((n) => { n.read = true; }); })}>Marcar todas como lidas</button>`}</header>
      ${st.notifs.length ? st.notifs.map((n) => html`<button class=${`notif ${n.read ? '' : 'unread'} k-${n.kind}`} onClick=${() => go(n)}>
        <span class="notif-dot"></span><div><b>${n.title}</b><span>${n.body}</span><em>${fmtAgo(n.at, now)}</em></div></button>`)
      : html`<${Empty} text="Nada por aqui." icon="bell" />`}
    </div>
  </div>`;
}
