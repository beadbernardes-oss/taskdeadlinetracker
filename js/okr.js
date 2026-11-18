// OKR3 Q4: painel (em inglês) com os números da aba Summary da planilha do piloto de PDV.
// Os números ficam nos dados da usuária (S().okr3), não no código do site, que é público.
// Duas seções, como na Summary: 1) lojas e pedidos (com a KR de 50%); 2) PDVs e pedidos pendentes (+ lista de gaps).
// Cores semânticas: verde = integrado/bom, vermelho = pendente de integração/problema,
// âmbar hachurado = aguardando resposta, contorno vazio = sem resposta ou despriorizado.
import { html, render } from './lib.js';
import { S, U, setUI } from './store.js';
import { Seg, Icon, Empty } from './ui.js';

const CITIES = ['Total', 'X', 'Y', 'F'];
const cityName = (x) => (x === 'Total' ? 'All cities' : x);
const nf = new Intl.NumberFormat('en-US');
const n0 = (v) => nf.format(Math.round(v));
const n1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nOrd = (v) => n1.format(v);
const p1 = (v) => `${(Math.round(v * 10) / 10).toFixed(1)}%`;
const pct = (a, b) => (b ? (a / b) * 100 : 0);
const fmtDay = (iso) => new Date(`${iso}T12:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
const WILL = { willing: 'Willing', unwilling: 'Unwilling', 'self built': 'Self-built', '': 'No answer' };

// Situações da seção 1, sempre com a mesma cor e o mesmo nome
const ST = {
  integrated: { label: 'Already integrated with Keeta', cls: 'v-good' },
  gap: { label: 'Pending integration', cls: 'v-bad' },
  pending: { label: 'Pending answer', cls: 'v-wait' },
  noAnswer: { label: 'Without answer or deprioritized', cls: 'v-empty' },
};

// Dica flutuante: um único elemento fora do painel, atualizado direto
let tipEl = null; let tipKey = null;
function showTip(x, y, key, content) {
  if (!tipEl) {
    tipEl = document.createElement('div'); tipEl.className = 'ok-tip'; tipEl.setAttribute('role', 'tooltip'); tipEl.hidden = true;
    document.body.appendChild(tipEl);
  }
  if (key !== tipKey) { render(content, tipEl); tipKey = key; }
  tipEl.hidden = false;
  const w = tipEl.offsetWidth; const h = tipEl.offsetHeight;
  tipEl.style.left = `${Math.max(8, Math.min(x + 12, window.innerWidth - w - 8))}px`;
  tipEl.style.top = `${y + 12 + h > window.innerHeight - 8 ? y - h - 12 : y + 12}px`;
}
function hideTip() { if (tipEl && !tipEl.hidden) { tipEl.hidden = true; tipKey = null; } }
addEventListener('scroll', hideTip, { capture: true, passive: true });
addEventListener('pointerdown', (ev) => { if (!ev.target.closest?.('.ok-seg')) hideTip(); }, { capture: true });
addEventListener('keydown', (ev) => { if (ev.key === 'Escape') hideTip(); });
addEventListener('hashchange', hideTip);

const segTip = (key, content) => ({
  onPointerMove: (ev) => { if (ev.pointerType === 'mouse') showTip(ev.clientX, ev.clientY, key, content); },
  onPointerLeave: (ev) => { if (ev.pointerType === 'mouse') hideTip(); },
  onClick: (ev) => showTip(ev.clientX, ev.clientY, key, content),
});

function Legend({ groups }) {
  return html`<div class="ok-legend">${groups.map((g) => html`<span class="lg-group">${g.title && html`<b>${g.title}</b>`}
    ${g.items.map((s) => html`<span><i class=${s.cls}></i>${s.label}</span>`)}</span>`)}</div>`;
}

// Barra empilhada: segmentos proporcionais, focável pelo teclado, com resumo para leitor de tela.
// `split` = índice do primeiro segmento do segundo grupo (abre um respiro visual entre os grupos).
function Bar({ id, label, parts, total, split, target, labelFirst = true }) {
  const shown = parts.map((p, i) => ({ ...p, i, w: pct(p.v, total) })).filter((p) => p.v > 0);
  const summary = `${label}: ${shown.map((p) => `${p.label}, ${p.text}`).join('; ')}`;
  const all = html`<b>${label}</b>${shown.map((p) => html`<span class="tip-row"><i class=${p.cls}></i>${p.label}<span class="ink">${p.text}</span></span>`)}`;
  return html`<div class="ok-track">
    <div class="ok-sbar" role="img" tabindex="0" aria-label=${summary}
      onFocus=${(ev) => { const r = ev.currentTarget.getBoundingClientRect(); showTip(r.left, r.bottom - 6, `${id}|all`, all); }} onBlur=${hideTip}>
      ${shown.map((p) => html`<span class=${`ok-seg ${p.cls} ${split != null && p.i === split ? 'split' : ''}`} style=${`flex:${p.w} 1 0`}
        ...${segTip(`${id}|${p.i}`, html`<b>${label}</b><span>${p.label}</span><span class="ink">${p.text}</span>`)}>
        ${labelFirst && p.i === 0 && p.w >= 9 ? html`<em>${p.short || `${Math.round(p.w)}%`}</em>` : ''}</span>`)}
    </div>
    ${target != null && html`<span class="ok-target" style=${`left:${target}%`} aria-hidden="true"></span>`}
  </div>`;
}

function Status({ ok, children }) {
  return html`<span class=${`ok-status-pill ${ok ? 'is-ok' : 'is-bad'}`}><${Icon} n=${ok ? 'check' : 'alert'} s=${13} />${children}</span>`;
}

// ---------- Seção 1: lojas e pedidos ----------
function StoresSection({ s1, kr }) {
  const target = kr?.target ?? 50;
  const knownO = (i) => s1.known.o[i];
  const avg3 = (knownO(1) + knownO(2) + knownO(3)) / 3;
  const below = [1, 2, 3].filter((i) => knownO(i) < target);
  const ordersParts = (i) => ['integrated', 'gap', 'pending', 'noAnswer'].map((k) => {
    const v = s1[k].o[i];
    return { v, cls: ST[k].cls, label: ST[k].label, text: `${p1(v)} of est. orders · ≈ ${n0(s1.orders[i] * v / 100)} orders/day` };
  });
  const rows = [
    { k: 'noAnswer', label: 'Merchants without answer or deprioritized', note: true },
    { k: 'pending', label: 'Merchants pending answer' },
    { k: 'known', label: 'Merchants with PDV known by us', kr: true },
    { k: 'integrated', label: 'Already integrated with Keeta', sub: true, tone: 'good' },
    { k: 'gap', label: 'Pending integration', sub: true, tone: 'bad' },
  ];
  return html`<section class="ok-sec">
    <header class="ok-sec-h"><span class="ok-sec-n">1</span><h2>Stores and orders</h2></header>

    <div class="ok-card ok-kr">
      <div class="kr-head">
        <div class="kr-title">
          <h3>Est. orders with PDV known by us</h3>
          <p class="muted small">Key result: ${target}% of est. orders, on average across the ${kr?.citiesTotal || 5} KR cities. The sheet has 3 of them (X, Y, F).</p>
        </div>
        <div class="kr-score">
          <span class=${`kr-num ${avg3 >= target ? 'is-ok' : 'is-bad'}`}>${p1(avg3)}</span>
          <span class="kr-meta"><${Status} ok=${avg3 >= target}>${avg3 >= target ? 'Above target' : `${(target - avg3).toFixed(1)} pts below target`}<//><span class="muted small">Average of X, Y, F · target ${target}%</span></span>
        </div>
      </div>
      <p class=${`kr-call ${below.length ? 'is-bad' : 'is-ok'}`}><${Icon} n=${below.length ? 'alert' : 'check'} s=${15} />
        <span>${below.length
          ? html`To reach ${target}%, more est. orders/day need a known PDV: ${below.map((i, j) => html`${j ? ' · ' : ''}<b>${CITIES[i]}</b> ≈ ${n0((target - knownO(i)) * s1.orders[i] / 100)}`)}`
          : `All 3 cities are at or above the ${target}% target.`}</span>
      </p>
      <${Legend} groups=${[{ title: 'PDV known', items: [ST.integrated, ST.gap] }, { title: 'PDV not known', items: [ST.pending, ST.noAnswer] }]} />
      <div class="kr-rows">
        <div class="kr-scale" aria-hidden="true"><span></span><span class="kr-ticks"><i style="left:0">0%</i><i class="t" style=${`left:${target}%`}>Target ${target}%</i><i style="left:100%">100%</i></span><span></span></div>
        ${[1, 2, 3, 0].map((i) => { const ok = knownO(i) >= target;
          return html`<div class=${`kr-row ${i === 0 ? 'total' : ''}`}>
            <span class="ok-slabel"><b>${cityName(CITIES[i])}</b><small>${n0(s1.orders[i])} orders/day</small></span>
            <${Bar} id=${`k${i}`} label=${cityName(CITIES[i])} parts=${ordersParts(i)} total=${ordersParts(i).reduce((a, p) => a + p.v, 0)} split=${2} target=${target} />
            <span class="kr-val"><b>${p1(knownO(i))}</b><${Status} ok=${ok}>${ok ? 'On track' : `${(target - knownO(i)).toFixed(1)} pts short`}<//></span>
          </div>`; })}
      </div>
    </div>

    <div class="ok-card">
      <div class="ok-tablewrap"><table class="ok-table ok-mt">
        <thead>
          <tr class="grp-h"><td></td>${CITIES.map((x) => html`<th scope="colgroup" colspan="2">${x === 'Total' ? 'Total (X + Y + F)' : `City ${x}`}</th>`)}</tr>
          <tr><th scope="col">Metric</th>${CITIES.map((x) => html`<th scope="col" class="num">${x} – Stores</th><th scope="col" class="num">${x} – Orders</th>`)}</tr>
        </thead>
        <tbody>
          <tr><th scope="row">Merchant list (100%)</th>${CITIES.map((_, i) => html`<td class="num">${n0(s1.stores[i])}</td><td class="num">${n0(s1.orders[i])}</td>`)}</tr>
          ${rows.map((r) => html`<tr class=${`${r.tone ? `row-${r.tone}` : ''} ${r.kr ? 'row-kr' : ''}`}>
            <th scope="row" class=${r.sub ? 'sub' : ''}>${r.sub ? '↳ ' : ''}${r.label}${r.note ? html`<sup>*</sup>` : ''}${r.kr ? html` <span class="ok-krtag">KR · ${target}% of orders</span>` : ''}</th>
            ${CITIES.map((_, i) => html`<td class=${`num ${i === 0 && r.tone ? 'b' : ''}`}>${p1(s1[r.k].s[i])}</td>
              <td class=${`num ${i === 0 && r.tone ? 'b' : ''} ${r.kr ? (s1[r.k].o[i] >= target ? 'ok-txt-good' : 'ok-txt-bad') : ''}`}>${p1(s1[r.k].o[i])}</td>`)}
          </tr>`)}
        </tbody>
      </table></div>
      <p class="muted small ok-note"><sup>*</sup> Merchants without answer or deprioritized = no answer in the cold call, printer, long tail (cut from research) and ordering tool or self-built system.</p>
    </div>
  </section>`;
}

// ---------- Seção 2: PDVs e pedidos pendentes ----------
function PdvSection({ s2, d, e, u }) {
  const c = CITIES.indexOf(u.okrCity || 'Total'); const city = CITIES[c];
  const scope = c === 0 ? 'all cities' : `city ${city}`;
  const gm = (g) => (c === 0 ? g.m.reduce((a, b) => a + b, 0) : g.m[c - 1]);
  const go = (g) => (c === 0 ? g.o.reduce((a, b) => a + b, 0) : g.o[c - 1]);
  const will = u.okrWill || 'all';
  const gapAll = d.gap.filter((g) => gm(g) > 0).sort((a, b) => go(b) - go(a));
  const gapRows = gapAll.filter((g) => will === 'all' || (g.will || '') === will);
  const maxO = Math.max(1, ...gapAll.map(go));
  const willCount = (w) => gapAll.filter((g) => (g.will || '') === w).length;
  const cnt = (key) => CITIES.map((_, i) => html`<td class="num">${s2[key][i]}</td>`);
  const withPct = (o) => CITIES.map((_, i) => html`<td class="num">${o.n[i]} <span class="muted">(${p1(o.p[i])})</span></td>`);
  const PDV = { integrated: { label: 'Integrated with Keeta', cls: 'v-good' }, pending: { label: 'Pending integration', cls: 'v-bad' } };
  const WL = { willing: { label: 'Willing to cooperate now', cls: 'v-good' }, unwilling: { label: 'Unwilling to cooperate', cls: 'v-bad' } };

  return html`<section class="ok-sec">
    <header class="ok-sec-h"><span class="ok-sec-n">2</span><h2>PDVs and pending orders</h2></header>

    <div class="ok-two">
      <div class="ok-card">
        <h3>Mapped PDVs by integration status</h3>
        <p class="muted small">Distinct PDV vendors found in each city.</p>
        <${Legend} groups=${[{ items: [PDV.integrated, PDV.pending] }]} />
        ${[1, 2, 3, 0].map((i) => html`<div class=${`kr-row compact ${i === 0 ? 'total' : ''}`}>
          <span class="ok-slabel"><b>${cityName(CITIES[i])}</b><small>${s2.mapped[i]} PDVs</small></span>
          <${Bar} id=${`p${i}`} label=${cityName(CITIES[i])} total=${s2.mapped[i]} labelFirst=${true}
            parts=${[{ v: s2.integrated[i], cls: 'v-good', label: PDV.integrated.label, short: `${s2.integrated[i]}`, text: `${s2.integrated[i]} PDVs · ${p1(pct(s2.integrated[i], s2.mapped[i]))}` },
              { v: s2.pending[i], cls: 'v-bad', label: PDV.pending.label, text: `${s2.pending[i]} PDVs · ${p1(pct(s2.pending[i], s2.mapped[i]))}` }]} />
          <span class="kr-val"><b class="ok-txt-bad">${s2.pending[i]}</b><small class="muted">pending</small></span>
        </div>`)}
      </div>
      <div class="ok-card">
        <h3>Pending orders by willingness to cooperate</h3>
        <p class="muted small">Share of pending orders (orders in stores on a non-integrated PDV).</p>
        <${Legend} groups=${[{ items: [WL.willing, WL.unwilling] }]} />
        ${[1, 2, 3, 0].map((i) => html`<div class=${`kr-row compact ${i === 0 ? 'total' : ''}`}>
          <span class="ok-slabel"><b>${cityName(CITIES[i])}</b><small>${s2.pending[i]} pending PDVs</small></span>
          <${Bar} id=${`w${i}`} label=${cityName(CITIES[i])} total=${100}
            parts=${[{ v: s2.willing.p[i], cls: 'v-good', label: WL.willing.label, text: `${s2.willing.n[i]} PDVs · ${p1(s2.willing.p[i])} of pending orders` },
              { v: s2.unwilling.p[i], cls: 'v-bad', label: WL.unwilling.label, text: `${s2.unwilling.n[i]} PDVs · ${p1(s2.unwilling.p[i])} of pending orders` }]} />
          <span class="kr-val"><b class="ok-txt-bad">${p1(s2.unwilling.p[i])}</b><small class="muted">unwilling</small></span>
        </div>`)}
      </div>
    </div>

    <div class="ok-card">
      <div class="ok-tablewrap"><table class="ok-table ok-mt ok-pdv">
        <thead><tr><th scope="col">Metric</th>${CITIES.map((x) => html`<th scope="col" class="num">${x}</th>`)}</tr></thead>
        <tbody>
          <tr><th scope="row">Total mapped PDVs</th>${cnt('mapped')}</tr>
          <tr class="row-good"><th scope="row">Integrated with Keeta</th>${cnt('integrated')}</tr>
          <tr class="row-bad-soft"><th scope="row">Pending integration</th>${cnt('pending')}</tr>
          <tr><th scope="row">PDVs covering 80% of pending orders</th>${cnt('top80')}</tr>
          <tr class="row-good"><th scope="row" class="sub">↳ Willing to cooperate now</th>${withPct(s2.willing)}</tr>
          <tr class="row-bad"><th scope="row" class="sub">↳ Unwilling to cooperate</th>${withPct(s2.unwilling)}</tr>
        </tbody>
      </table></div>
      <p class="muted small ok-note">% = share of pending orders (orders in stores on a non-integrated PDV), not share of total orders. PDV totals are not the sum of the cities (the same vendor counts once).</p>
    </div>

    <div class="ok-card">
      <div class="ok-card-h"><h3><span class="ok-dot v-bad"></span>Gap list: PDV vendors not integrated with Keeta</h3><div class="grow"></div>
        <${Seg} small value=${city} onChange=${(v) => setUI({ okrCity: v })} options=${CITIES.map((x) => ({ value: x, label: cityName(x) }))} />
      </div>
      <div class="ok-card-h ok-filters">
        <${Seg} small value=${will} onChange=${(v) => setUI({ okrWill: v })} options=${[{ value: 'all', label: `All ${gapAll.length}` }, ...['willing', 'unwilling', 'self built', ''].map((w) => ({ value: w, label: `${WILL[w]} ${willCount(w)}` }))]} />
      </div>
      <p class="muted small">${n0(e.gap[c])} merchants · ${nOrd(gapAll.reduce((a, g) => a + go(g), 0))} est. orders/day (${p1(e.ordersGapPct[c])} of all est. orders) · ${scope}, sorted by est. orders. In the PDV table above, self-built and no answer count as unwilling.</p>
      <div class="ok-tablewrap"><table class="ok-table ok-gap">
        <thead><tr><th scope="col">PDV vendor</th><th scope="col">Willingness</th><th scope="col">TIMs status</th><th scope="col" class="num">Merchants</th><th scope="col" class="num">Est. orders/day</th><th scope="col" class="num">% of all orders</th><th scope="col">Segment</th></tr></thead>
        <tbody>${gapRows.map((g) => html`<tr>
          <th scope="row"><b>${g.vendor}</b>${g.other && html` <span class="ok-tag" title=${`Also mapped in project ${g.other}`}>${g.other}</span>`}</th>
          <td><span class=${`ok-will w-${(g.will || 'none').replace(' ', '-')}`}>${WILL[g.will || '']}</span></td>
          <td class="ok-status">${g.status || '—'}</td>
          <td class="num">${gm(g)}</td>
          <td class="num ok-barcell"><span class="ok-ibar" aria-hidden="true" style=${`width:${pct(go(g), maxO)}%`}></span><span>${nOrd(go(g))}</span></td>
          <td class="num">${p1(pct(go(g), e.orders[c]))}</td>
          <td>${g.seg}</td></tr>`)}
          ${!gapRows.length && html`<tr><td colspan="7" class="muted">No vendors in this group.</td></tr>`}
        </tbody>
      </table></div>
    </div>
  </section>`;
}

export function Okr() {
  const d = S().okr3; const u = U();
  if (!d || !d.s1 || !d.s2) return html`<div class="view okr"><${Empty} text="No OKR3 data yet." icon="list" /></div>`;
  return html`<div class="view okr">
    <div class="toolbar">
      <div class="ok-head"><h2>Epicenters PDV coverage</h2><span class="muted small">Data as of ${fmtDay(d.asOf)} · source: Summary tab${d.started ? ` · project started ${fmtDay(d.started)}` : ''}</span></div>
      <div class="grow"></div>
      ${d.source && html`<a class="btn btn-sm" href=${d.source} target="_blank" rel="noopener"><${Icon} n="link" s=${14} />Summary sheet</a>`}
    </div>
    <${StoresSection} s1=${d.s1} kr=${d.kr} />
    <${PdvSection} s2=${d.s2} d=${d} e=${d.exec} u=${u} />
  </div>`;
}
