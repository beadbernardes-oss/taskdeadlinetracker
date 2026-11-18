// OKR3 Q4: painel (em inglês) com os números da aba Summary da planilha do piloto de PDV.
// Os números ficam nos dados da usuária (S().okr3), não no código do site, que é público.
// Cores semânticas: verde = integrado (bom), vermelho = gap (problema), âmbar = sem resposta (ação),
// cinza = sem PDV (status conhecido, nada a integrar), contorno vazio = ainda não pesquisado.
import { html, render } from './lib.js';
import { S, U, setUI } from './store.js';
import { Seg, Icon, Empty } from './ui.js';

const CITIES = ['Total', 'X', 'Y', 'F'];
const cityName = (x) => (x === 'Total' ? 'All cities' : x);
const nf = new Intl.NumberFormat('en-US');
const n0 = (v) => nf.format(Math.round(v));
const n1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nOrd = (v) => n1.format(v); // pedidos estimados: sempre 1 casa decimal
const p1 = (v) => `${(Math.round(v * 10) / 10).toFixed(1)}%`;
const pct = (a, b) => (b ? (a / b) * 100 : 0);
const fmtDay = (iso) => new Date(`${iso}T12:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
const WILL = { willing: 'Willing', unwilling: 'Unwilling', 'self built': 'Self-built', '': 'No answer' };

// Situações, sempre com a mesma cor e o mesmo nome em todo o painel
const ST = {
  good: { label: 'On an integrated POS', cls: 'v-good' },
  bad: { label: 'On a POS not integrated (gap)', cls: 'v-bad' },
  na: { label: 'No POS (printer, ordering tool, self-built)', cls: 'v-na' },
  wait: { label: 'Unresolved (no response, pending KAM)', cls: 'v-wait' },
  todo: { label: 'Not researched yet', cls: 'v-empty' },
};

// Dica flutuante: um único elemento fora do painel, atualizado direto (o painel não é redesenhado a cada movimento do mouse)
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
// Fecha ao rolar, ao tocar fora de uma barra, com Esc e ao trocar de aba
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
// `split` = índice do primeiro segmento "desconhecido" (abre um respiro visual entre conhecido e não conhecido).
function Bar({ id, label, parts, total, split, target, labelFirst = true }) {
  const shown = parts.map((p, i) => ({ ...p, i, w: pct(p.v, total) })).filter((p) => p.v > 0);
  const summary = `${label}: ${shown.map((p) => `${p.label}, ${p.text}`).join('; ')}`;
  const all = html`<b>${label}</b>${shown.map((p) => html`<span class="tip-row"><i class=${p.cls}></i>${p.label}<span class="ink">${p.text}</span></span>`)}`;
  return html`<div class="ok-track">
    <div class="ok-sbar" role="img" tabindex="0" aria-label=${summary}
      onFocus=${(ev) => { const r = ev.currentTarget.getBoundingClientRect(); showTip(r.left, r.bottom - 6, `${id}|all`, all); }} onBlur=${hideTip}>
      ${shown.map((p) => html`<span class=${`ok-seg ${p.cls} ${split != null && p.i === split ? 'split' : ''}`} style=${`flex:${p.w} 1 0`}
        ...${segTip(`${id}|${p.i}`, html`<b>${label}</b><span>${p.label}</span><span class="ink">${p.text}</span>`)}>
        ${labelFirst && p.i === 0 && p.w >= 9 ? html`<em>${Math.round(p.w)}%</em>` : ''}</span>`)}
    </div>
    ${target != null && html`<span class="ok-target" style=${`left:${target}%`} aria-hidden="true"></span>`}
  </div>`;
}

function Status({ ok, children }) {
  return html`<span class=${`ok-status-pill ${ok ? 'is-ok' : 'is-bad'}`}><${Icon} n=${ok ? 'check' : 'alert'} s=${13} />${children}</span>`;
}

function Signal({ tone, icon, label, value, unit, sub }) {
  return html`<div class=${`ok-signal t-${tone}`}>
    <span class="sg-icon"><${Icon} n=${icon} s=${16} /></span>
    <span class="sg-label">${label}</span>
    <span class="sg-value"><b>${value}</b>${unit && html`<small>${unit}</small>`}</span>
    <span class="sg-sub">${sub}</span>
  </div>`;
}

export function Okr() {
  const d = S().okr3; const u = U();
  if (!d) return html`<div class="view okr"><${Empty} text="No OKR3 data yet." icon="list" /></div>`;
  const e = d.exec; const kr = d.kr;
  const c = CITIES.indexOf(u.okrCity || 'Total'); const city = CITIES[c];
  const scope = c === 0 ? 'all cities' : `city ${city}`;

  // Pedidos estimados por situação, por cidade (base da KR)
  const orders = (i) => {
    const tot = e.orders[i]; const good = tot * e.ordersIntegratedPct[i] / 100; const bad = tot * e.ordersGapPct[i] / 100;
    const known = kr ? kr.known[i] : good + bad; const covered = kr ? kr.covered[i] : known;
    return { tot, good, bad, na: Math.max(0, known - good - bad), wait: Math.max(0, covered - known), todo: Math.max(0, tot - covered), known, knownPct: pct(known, tot) };
  };
  const O = CITIES.map((_, i) => orders(i));
  const target = kr ? kr.target : null;
  const avg3 = (O[1].knownPct + O[2].knownPct + O[3].knownPct) / 3;
  const below = kr ? [1, 2, 3].filter((i) => O[i].knownPct < target) : [];

  // Lojas por situação
  const merch = (i) => {
    const na = e.printer[i] + e.excluded[i];
    return { good: e.integrated[i], bad: e.gap[i], na, wait: e.covered[i] - e.pos[i] - na, todo: e.merchants[i] - e.covered[i] };
  };

  // Lista de gaps no recorte escolhido (Total = X + Y + F)
  const gm = (g) => (c === 0 ? g.m.reduce((a, b) => a + b, 0) : g.m[c - 1]);
  const go = (g) => (c === 0 ? g.o.reduce((a, b) => a + b, 0) : g.o[c - 1]);
  const will = u.okrWill || 'all';
  const gapAll = d.gap.filter((g) => gm(g) > 0).sort((a, b) => go(b) - go(a));
  const gapRows = gapAll.filter((g) => will === 'all' || (g.will || '') === will);
  const maxO = Math.max(1, ...gapAll.map(go));
  const willCount = (w) => gapAll.filter((g) => (g.will || '') === w).length;
  const T = (label, key, fmt = n0) => html`<tr><th scope="row">${label}</th>${CITIES.map((_, i) => html`<td class=${i === c ? 'on' : ''}>${fmt(e[key][i])}</td>`)}</tr>`;

  const orderParts = (o) => ['good', 'bad', 'na', 'wait', 'todo'].map((k) => ({ v: o[k], cls: ST[k].cls, label: ST[k].label, text: `${p1(pct(o[k], o.tot))} · ≈ ${n0(o[k])} orders/day` }));
  const krOrder = [1, 2, 3, 0];

  return html`<div class="view okr">
    <div class="toolbar">
      <div class="ok-head"><h2>Epicenters POS coverage</h2><span class="muted small">Data as of ${fmtDay(d.asOf)} · ${scope}</span></div>
      <div class="grow"></div>
      <${Seg} small value=${city} onChange=${(v) => setUI({ okrCity: v })} options=${CITIES.map((x) => ({ value: x, label: cityName(x) }))} />
      ${d.source && html`<a class="btn btn-sm" href=${d.source} target="_blank" rel="noopener"><${Icon} n="link" s=${14} />Summary sheet</a>`}
    </div>

    ${kr && html`<section class="ok-card ok-kr">
      <div class="kr-head">
        <div class="kr-title">
          <h3>Est. orders with a known POS status</h3>
          <p class="muted small">Key result: ${target}% on average across the ${kr.citiesTotal} KR cities. This sheet has ${3} of them (X, Y, F).</p>
        </div>
        <div class="kr-score">
          <span class=${`kr-num ${avg3 >= target ? 'is-ok' : 'is-bad'}`}>${p1(avg3)}</span>
          <span class="kr-meta"><${Status} ok=${avg3 >= target}>${avg3 >= target ? 'Above target' : 'Below target'}<//><span class="muted small">Average of X, Y, F · target ${target}%</span></span>
        </div>
      </div>
      <p class=${`kr-call ${below.length ? 'is-bad' : 'is-ok'}`}><${Icon} n=${below.length ? 'alert' : 'check'} s=${15} />
        ${below.length
          ? below.map((i) => html`<span><b>${CITIES[i]}</b> is ${(target - O[i].knownPct).toFixed(1)} pts below target: ≈ ${n0(target * O[i].tot / 100 - O[i].known)} more est. orders/day need a known POS status. </span>`)
          : html`<span>All 3 cities are above the ${target}% target.</span>`}
      </p>
      <${Legend} groups=${[{ title: 'Status known', items: [ST.good, ST.bad, ST.na] }, { title: 'Status unknown', items: [ST.wait, ST.todo] }]} />
      <div class="kr-rows">
        <div class="kr-scale" aria-hidden="true"><span></span><span class="kr-ticks"><i style="left:0">0%</i><i class="t" style=${`left:${target}%`}>Target ${target}%</i><i style="left:100%">100%</i></span><span></span></div>
        ${krOrder.map((i) => { const o = O[i]; const ok = o.knownPct >= target;
          return html`<div class=${`kr-row ${i === c ? 'on' : ''} ${i === 0 ? 'total' : ''}`}>
            <span class="ok-slabel"><b>${cityName(CITIES[i])}</b><small>${n0(o.tot)} orders/day</small></span>
            <${Bar} id=${`k${i}`} label=${cityName(CITIES[i])} parts=${orderParts(o)} total=${o.tot} split=${3} target=${target} />
            <span class="kr-val"><b>${p1(o.knownPct)}</b><${Status} ok=${ok}>${ok ? 'On track' : `${(target - o.knownPct).toFixed(1)} pts short`}<//></span>
          </div>`; })}
      </div>
    </section>`}

    <div class="ok-signals">
      <${Signal} tone="good" icon="check" label="On an integrated POS" value=${p1(e.ordersIntegratedPct[c])} unit="of est. orders"
        sub=${`${n0(e.integrated[c])} merchants · ${p1(e.posIntegratedPct[c])} of merchants with a POS`} />
      <${Signal} tone="bad" icon="alert" label="In the gap (POS not integrated)" value=${p1(e.ordersGapPct[c])} unit="of est. orders"
        sub=${`${n0(e.gap[c])} merchants · ${e.vendorsGap[c]} vendors to integrate`} />
      <${Signal} tone="wait" icon="clock" label="No response from merchant" value=${p1(e.noResponsePct[c])} unit="of covered merchants"
        sub=${`${n0(e.noResponse[c])} merchants waiting on the next ladder step`} />
      <${Signal} tone="good" icon="users" label="National chains (SKA)" value=${p1(e.skaOrdersPct[c])} unit="of SKA orders integrated"
        sub=${`${e.brandsIntegrated[c]} of ${e.brands[c]} brands integrated · ${e.brandsGap[c]} in the gap · ${e.brandsUnknown[c]} POS unknown`} />
    </div>

    <section class="ok-card">
      <h3>Where the merchant list stands</h3>
      <p class="muted small">Every merchant in the list, by research result. Same colors as the key result above.</p>
      <${Legend} groups=${[{ items: [ST.good, ST.bad, ST.na, ST.wait, ST.todo] }]} />
      ${CITIES.map((x, i) => { const m = merch(i);
        return html`<div class=${`kr-row ${i === c ? 'on' : ''}`}>
          <span class="ok-slabel"><b>${cityName(x)}</b><small>${n0(e.merchants[i])} merchants</small></span>
          <${Bar} id=${`m${i}`} label=${cityName(x)} total=${e.merchants[i]} split=${3}
            parts=${['good', 'bad', 'na', 'wait', 'todo'].map((k) => ({ v: m[k], cls: ST[k].cls, label: ST[k].label, text: `${n0(m[k])} merchants · ${p1(pct(m[k], e.merchants[i]))}` }))} />
          <span class="kr-val"><b>${p1(pct(e.covered[i], e.merchants[i]))}</b><small class="muted">covered</small></span>
        </div>`; })}
    </section>

    <section class="ok-card">
      <div class="ok-card-h"><h3><span class="ok-dot v-bad"></span>Gap list: POS vendors not integrated with Keeta</h3><div class="grow"></div>
        <${Seg} small value=${will} onChange=${(v) => setUI({ okrWill: v })} options=${[{ value: 'all', label: `All ${gapAll.length}` }, ...['willing', 'unwilling', 'self built', ''].map((w) => ({ value: w, label: `${WILL[w]} ${willCount(w)}` }))]} />
      </div>
      <p class="muted small">${n0(e.gap[c])} merchants · ${nOrd(gapAll.reduce((a, g) => a + go(g), 0))} est. orders/day (${p1(e.ordersGapPct[c])} of all est. orders) · ${scope}, sorted by est. orders.</p>
      <div class="ok-tablewrap"><table class="ok-table ok-gap">
        <thead><tr><th scope="col">POS vendor</th><th scope="col">Willingness</th><th scope="col">TIMs status</th><th scope="col" class="num">Merchants</th><th scope="col" class="num">Est. orders/day</th><th scope="col" class="num">% of all orders</th><th scope="col">Segment</th></tr></thead>
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
    </section>

    <section class="ok-card">
      <h3>All numbers by city</h3>
      <div class="ok-tablewrap"><table class="ok-table ok-num">
        <thead><tr><td></td>${CITIES.map((x, i) => html`<th scope="col" class=${`num ${i === c ? 'on' : ''}`}>${cityName(x)}</th>`)}</tr></thead>
        <tbody>
          ${kr && html`<tr class="grp"><th colspan="5">Key result</th></tr>
          <tr><th scope="row">% of est. orders with a known POS status</th>${CITIES.map((_, i) => html`<td class=${`${i === c ? 'on' : ''} ${O[i].knownPct >= target ? 'ok-txt-good' : 'ok-txt-bad'}`}>${p1(O[i].knownPct)}</td>`)}</tr>`}
          <tr class="grp"><th colspan="5">List</th></tr>
          ${T('Merchants in list', 'merchants')}${T('Estimated orders/day', 'orders')}
          <tr class="grp"><th colspan="5">Discovery</th></tr>
          ${T('Merchants covered by discovery', 'covered')}
          <tr><th scope="row">Discovery coverage</th>${CITIES.map((_, i) => html`<td class=${i === c ? 'on' : ''}>${p1(pct(e.covered[i], e.merchants[i]))}</td>`)}</tr>
          ${T('Merchants with a POS found', 'pos')}${T('…on an integrated POS', 'integrated')}${T('…on a POS not integrated (gap)', 'gap')}
          ${T('Merchants on a printer (no POS)', 'printer')}${T('Excluded from gap (ordering tool / self-built)', 'excluded')}
          ${T('Merchants with no response', 'noResponse')}${T('% of covered with no response', 'noResponsePct', p1)}
          <tr class="grp"><th colspan="5">Coverage</th></tr>
          ${T('% of POS merchants on an integrated POS', 'posIntegratedPct', p1)}${T('% of est. orders on an integrated POS', 'ordersIntegratedPct', p1)}${T('% of est. orders in the gap', 'ordersGapPct', p1)}
          <tr class="grp"><th colspan="5">POS vendors</th></tr>
          ${T('POS vendors found', 'vendors')}${T('…integrated with Keeta', 'vendorsIntegrated')}${T('…not integrated (gap list)', 'vendorsGap')}
          <tr class="grp"><th colspan="5">National chains (SKA), by brand</th></tr>
          ${T('Brands', 'brands')}${T('…on an integrated POS', 'brandsIntegrated')}${T('…on a POS not integrated (gap)', 'brandsGap')}${T('…POS unknown', 'brandsUnknown')}
          ${T('SKA orders covered', 'skaOrdersPct', p1)}
        </tbody>
      </table></div>
      <p class="muted small">Known POS status = researched merchants (POS found, printer, ordering tool or self-built), weighted by est. orders/day, from the Tracker tab. "% of all est. orders" is the share of the list's total estimated orders. Covered by discovery = researched + no response + KAM. Merchants are stores; brands are distinct brand names. Vendor and brand totals are not the sum of the cities (the same name counts once). Cities X, Y and F as in the source sheet.${d.started ? ` Project started ${fmtDay(d.started)}.` : ''}</p>
    </section>
  </div>`;
}
