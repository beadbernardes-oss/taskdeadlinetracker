// OKR3 Q4: painel (em inglês) com os números da aba Summary da planilha do piloto de PDV.
// Os números ficam nos dados da usuária (S().okr3), não no código do site, que é público.
import { html, render } from './lib.js';
import { S, U, setUI } from './store.js';
import { Seg, Icon, Empty } from './ui.js';

const CITIES = ['Total', 'X', 'Y', 'F'];
const nf = new Intl.NumberFormat('en-US');
const n0 = (v) => nf.format(Math.round(v));
const n1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nOrd = (v) => n1.format(v); // pedidos estimados: sempre 1 casa decimal
const p1 = (v) => `${(Math.round(v * 10) / 10).toFixed(1)}%`;
const pct = (a, b) => (b ? (a / b) * 100 : 0);
const fmtDay = (iso) => new Date(`${iso}T12:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
const WILL = { willing: 'Willing', unwilling: 'Unwilling', 'self built': 'Self-built', '': 'No answer' };

// Composição da lista de lojas. Cada situação tem sempre a mesma cor, em todas as barras.
const SEGS = [
  { k: 'int', label: 'On an integrated POS', cls: 's1' },
  { k: 'gap', label: 'On a non-integrated POS (gap)', cls: 's2' },
  { k: 'nopos', label: 'No POS (printer, ordering tool, self-built)', cls: 's3' },
  { k: 'open', label: 'Unresolved (no response, pending KAM)', cls: 'sn1' },
  { k: 'todo', label: 'Not researched yet', cls: 'sn2' },
];
// No gráfico de pedidos, o resto (sem PDV + sem resposta + não pesquisado) é hachurado: não é a mesma coisa que "not researched"
const REST = { label: 'Everything else (no POS, unresolved, not researched)', cls: 'rest' };
function comp(e, c) {
  const nopos = e.printer[c] + e.excluded[c];
  return { int: e.integrated[c], gap: e.gap[c], nopos, open: e.covered[c] - e.pos[c] - nopos, todo: e.merchants[c] - e.covered[c] };
}

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
// Fecha ao rolar, ao tocar fora de uma barra, com Esc e ao trocar de aba (no iPhone a dica ficava presa)
addEventListener('scroll', hideTip, { capture: true, passive: true });
addEventListener('pointerdown', (ev) => { if (!ev.target.closest?.('.ok-seg')) hideTip(); }, { capture: true });
addEventListener('keydown', (ev) => { if (ev.key === 'Escape') hideTip(); });
addEventListener('hashchange', hideTip);

const segTip = (key, content) => ({
  onPointerMove: (ev) => { if (ev.pointerType === 'mouse') showTip(ev.clientX, ev.clientY, key, content); },
  onPointerLeave: (ev) => { if (ev.pointerType === 'mouse') hideTip(); },
  onClick: (ev) => showTip(ev.clientX, ev.clientY, key, content),
});

function Legend({ items }) {
  return html`<div class="ok-legend">${items.map((s) => html`<span><i class=${s.cls}></i>${s.label}</span>`)}</div>`;
}

function StackRow({ id, label, sub, parts, total, on }) {
  const shown = parts.filter((p) => p.v > 0).map((p) => ({ ...p, w: pct(p.v, total), text: p.text || `${n0(p.v)} merchants · ${p1(pct(p.v, total))}` }));
  // Teclado e leitor de tela: a barra inteira é um item focável com o resumo de todas as partes
  const summary = `${label}: ${shown.map((p) => `${p.label}, ${p.text}`).join('; ')}`;
  const all = html`<b>${label}</b>${shown.map((p) => html`<span class="tip-row"><i class=${p.cls}></i>${p.label}<span class="ink">${p.text}</span></span>`)}`;
  return html`<div class=${`ok-srow ${on ? 'on' : ''}`}>
    <span class="ok-slabel" aria-hidden="true"><b>${label}</b>${sub && html`<small>${sub}</small>`}</span>
    <div class="ok-sbar" role="img" tabindex="0" aria-label=${summary}
      onFocus=${(ev) => { const r = ev.currentTarget.getBoundingClientRect(); showTip(r.left, r.bottom - 6, `${id}|all`, all); }} onBlur=${hideTip}>
      ${shown.map((p) => html`<span class=${`ok-seg ${p.cls}`} style=${`flex:${p.w} 1 0`}
        ...${segTip(`${id}|${p.cls}`, html`<b>${label}</b><span>${p.label}</span><span class="ink">${p.text}</span>`)}>
        ${p.cls === 's1' && p.w >= 8 ? html`<em>${Math.round(p.w)}%</em>` : ''}</span>`)}
    </div>
  </div>`;
}

function Tile({ label, value, sub, hero }) {
  return html`<div class=${`ok-tile ${hero ? 'hero' : ''}`}><span class="ok-tl">${label}</span><b>${value}</b><span class="ok-ts">${sub}</span></div>`;
}

export function Okr() {
  const d = S().okr3; const u = U();
  if (!d) return html`<div class="view okr"><${Empty} text="No OKR3 data yet." icon="list" /></div>`;
  const e = d.exec; const c = CITIES.indexOf(u.okrCity || 'Total'); const city = CITIES[c];
  const scope = c === 0 ? 'all cities' : `city ${city}`;
  const ordInt = e.orders[c] * e.ordersIntegratedPct[c] / 100;

  // Lista de gaps no recorte escolhido (Total = X + Y + F)
  const gm = (g) => (c === 0 ? g.m.reduce((a, b) => a + b, 0) : g.m[c - 1]);
  const go = (g) => (c === 0 ? g.o.reduce((a, b) => a + b, 0) : g.o[c - 1]);
  const will = u.okrWill || 'all';
  const gapAll = d.gap.filter((g) => gm(g) > 0).sort((a, b) => go(b) - go(a));
  const gapRows = gapAll.filter((g) => will === 'all' || (g.will || '') === will);
  const maxO = Math.max(1, ...gapAll.map(go));
  const willCount = (w) => gapAll.filter((g) => (g.will || '') === w).length;

  const rows = CITIES.map((name, i) => ({ name, i, cp: comp(e, i) }));
  const T = (label, key, fmt = n0) => html`<tr><th scope="row">${label}</th>${CITIES.map((_, i) => html`<td class=${i === c ? 'on' : ''}>${fmt(e[key][i])}</td>`)}</tr>`;

  return html`<div class="view okr">
    <div class="toolbar">
      <div class="ok-head"><h2>Epicenters POS coverage</h2><span class="muted small">Data as of ${fmtDay(d.asOf)} · ${scope}</span></div>
      <div class="grow"></div>
      <${Seg} small value=${city} onChange=${(v) => setUI({ okrCity: v })} options=${CITIES.map((x) => ({ value: x, label: x === 'Total' ? 'All cities' : x }))} />
      ${d.source && html`<a class="btn btn-sm" href=${d.source} target="_blank" rel="noopener"><${Icon} n="link" s=${14} />Summary sheet</a>`}
    </div>

    <div class="ok-tiles">
      <${Tile} hero label="Est. orders on an integrated POS" value=${p1(e.ordersIntegratedPct[c])} sub=${`≈ ${n0(ordInt)} of ${n0(e.orders[c])} est. orders/day`} />
      <${Tile} label="Discovery coverage" value=${p1(pct(e.covered[c], e.merchants[c]))} sub=${`${n0(e.covered[c])} of ${n0(e.merchants[c])} merchants researched`} />
      <${Tile} label="POS merchants on an integrated POS" value=${p1(e.posIntegratedPct[c])} sub=${`${n0(e.integrated[c])} of ${n0(e.pos[c])} merchants with a POS`} />
      <${Tile} label="Est. orders in the gap" value=${p1(e.ordersGapPct[c])} sub=${`${n0(e.gap[c])} merchants · ${e.vendorsGap[c]} vendors not integrated`} />
      <${Tile} label="National chain (SKA) orders covered" value=${p1(e.skaOrdersPct[c])} sub=${`${e.brandsIntegrated[c]} of ${e.brands[c]} brands on an integrated POS`} />
      <${Tile} label="Covered merchants with no response" value=${p1(e.noResponsePct[c])} sub=${`${n0(e.noResponse[c])} merchants waiting on the next step`} />
    </div>

    <div class="ok-grid">
      <section class="ok-card">
        <h3>Est. orders by POS status</h3>
        <p class="muted small">Share of each city's estimated orders/day.</p>
        <${Legend} items=${[SEGS[0], SEGS[1], REST]} />
        ${rows.map((r) => { const ip = e.ordersIntegratedPct[r.i], gp = e.ordersGapPct[r.i];
          return html`<${StackRow} id=${`o${r.i}`} label=${r.name === 'Total' ? 'All cities' : r.name} sub=${`${n0(e.orders[r.i])}/day`} total=${100} on=${r.i === c}
            parts=${[{ v: ip, cls: 's1', label: SEGS[0].label, text: `${p1(ip)} · ≈ ${n0(e.orders[r.i] * ip / 100)} orders/day` },
              { v: gp, cls: 's2', label: SEGS[1].label, text: `${p1(gp)} · ≈ ${n0(e.orders[r.i] * gp / 100)} orders/day` },
              { v: 100 - ip - gp, cls: 'rest', label: 'Everything else', text: `${p1(100 - ip - gp)} of est. orders` }]} />`; })}
      </section>

      <section class="ok-card">
        <h3>Where the merchant list stands</h3>
        <p class="muted small">Every merchant in the list, by research result.</p>
        <${Legend} items=${SEGS} />
        ${rows.map((r) => html`<${StackRow} id=${`m${r.i}`} label=${r.name === 'Total' ? 'All cities' : r.name} sub=${`${n0(e.merchants[r.i])} merchants`} total=${e.merchants[r.i]} on=${r.i === c}
          parts=${SEGS.map((s) => ({ v: r.cp[s.k], cls: s.cls, label: s.label }))} />`)}
      </section>
    </div>

    <section class="ok-card">
      <div class="ok-card-h"><h3>Gap list: POS vendors not integrated with Keeta</h3><div class="grow"></div>
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
        <thead><tr><td></td>${CITIES.map((x, i) => html`<th scope="col" class=${`num ${i === c ? 'on' : ''}`}>${x === 'Total' ? 'All cities' : x}</th>`)}</tr></thead>
        <tbody>
          <tr class="grp"><th colspan="5">List</th></tr>
          ${T('Merchants in list', 'merchants')}${T('Estimated orders/day', 'orders')}
          <tr class="grp"><th colspan="5">Discovery</th></tr>
          ${T('Merchants covered by discovery', 'covered')}
          <tr><th>Discovery coverage</th>${CITIES.map((_, i) => html`<td class=${i === c ? 'on' : ''}>${p1(pct(e.covered[i], e.merchants[i]))}</td>`)}</tr>
          ${T('Merchants with a POS found', 'pos')}${T('…on an integrated POS', 'integrated')}${T('…on a non-integrated POS (gap)', 'gap')}
          ${T('Merchants on a printer (no POS)', 'printer')}${T('Excluded from gap (ordering tool / self-built)', 'excluded')}
          ${T('Merchants with no response', 'noResponse')}${T('% of covered with no response', 'noResponsePct', p1)}
          <tr class="grp"><th colspan="5">Coverage</th></tr>
          ${T('% of POS merchants on an integrated POS', 'posIntegratedPct', p1)}${T('% of est. orders on an integrated POS', 'ordersIntegratedPct', p1)}${T('% of est. orders in the gap', 'ordersGapPct', p1)}
          <tr class="grp"><th colspan="5">POS vendors</th></tr>
          ${T('POS vendors found', 'vendors')}${T('…integrated with Keeta', 'vendorsIntegrated')}${T('…not integrated (gap list)', 'vendorsGap')}
          <tr class="grp"><th colspan="5">National chains (SKA), by brand</th></tr>
          ${T('Brands', 'brands')}${T('…on an integrated POS', 'brandsIntegrated')}${T('…on a non-integrated POS (gap)', 'brandsGap')}${T('…POS unknown', 'brandsUnknown')}
          ${T('SKA orders covered', 'skaOrdersPct', p1)}
        </tbody>
      </table></div>
      <p class="muted small">"% of all est. orders" is the share of the list's total estimated orders. Covered by discovery = researched + no response + KAM. Merchants are stores; brands are distinct brand names. Vendor and brand totals are not the sum of the cities (the same name counts once). Cities X, Y and F as in the source sheet.${d.started ? ` Project started ${fmtDay(d.started)}.` : ''}</p>
    </section>
  </div>`;
}
