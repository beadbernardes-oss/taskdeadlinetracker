// OKR3 Q4: painel (em inglês) com os números da aba Summary da planilha do piloto de PDV.
// Os números ficam nos dados da usuária (S().okr3), não no código do site, que é público.
// Quatro seções: 1) lojas e pedidos (com a KR de 50%); 2) PDVs e pedidos pendentes; 3) gap list; 4) prontidão para lançamento.
// Cores semânticas: verde = integrado/bom, vermelho = pendente de integração/problema,
// âmbar hachurado = aguardando resposta, contorno vazio = sem resposta ou despriorizado.
import { html, render, useState, useEffect } from './lib.js';
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
// Categorias da gap list, a partir da coluna Willingness e do TIMs status da Summary
const WILL = { willing: 'Willing', unwilling: 'Unwilling', brand: 'Depends on brand', unresponsive: 'Unresponsive' };
const WILL_ORDER = ['willing', 'unwilling', 'brand', 'unresponsive'];
const willCat = (g) => {
  const w = (g.will || '').toLowerCase();
  if (w === 'willing') return 'willing';
  if (/self.?built/.test(w)) return 'brand';
  if (w === 'unwilling') return 'unwilling';
  return 'unresponsive'; // "not sure (unwilling vs willing)" ou sem resposta
};
// Detalhe de "without answer or deprioritized"
const NA_BREAK = [
  ['noAnswer', 'Merchants no answer on the cold call'], ['printer', 'Merchants with printer'], ['longTail', 'Merchants with less than 5 orders/day'],
  ['selfBuilt', 'Merchants using self-built'], ['orderingTool', 'Merchants using ordering tool'],
];

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
// Ao entrar na aba OKR3, as seções voltam a ficar retraídas
addEventListener('hashchange', (ev) => {
  if (/#\/okr3/.test(location.hash) && !/#\/okr3/.test(ev.oldURL || '')) setUI({ okrS1Hidden: true, okrS2Hidden: true, okrGapHidden: true, okrS4Hidden: true });
});

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
        ${(labelFirst && p.i === 0 && p.w >= 9) || (p.i > 0 && p.short && p.w >= 5) ? html`<em>${p.short || `${Math.round(p.w)}%`}</em>` : ''}</span>`)}
    </div>
    ${target != null && html`<span class="ok-target" style=${`left:${target}%`} aria-hidden="true"></span>`}
  </div>`;
}

// Número que sobe de 0 até o valor junto com as barras (some com "reduzir movimento")
const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
function CountUp({ v, fmt }) {
  const [x, setX] = useState(calm() ? v : 0);
  useEffect(() => {
    if (calm()) { setX(v); return undefined; }
    const t0 = performance.now(); let raf;
    const step = (t) => { const k = Math.min(1, (t - t0) / 700); setX(v * (1 - (1 - k) ** 4)); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [v]);
  return fmt(x);
}

function Status({ ok, children }) {
  return html`<span class=${`ok-status-pill ${ok ? 'is-ok' : 'is-bad'}`}><${Icon} n=${ok ? 'check' : 'alert'} s=${13} />${children}</span>`;
}

// Cabeçalho de seção que abre e fecha; fechada, mostra um resumo de uma linha
function SecHead({ n, title, hideKey, summary }) {
  const hidden = !!U()[hideKey];
  return html`<header class="ok-sec-h">
    <span class="ok-sec-n">${n}</span>
    <h2><button type="button" class="ok-toggle ok-sec-toggle" aria-expanded=${!hidden} aria-controls=${`ok-sec-${n}`} onClick=${() => setUI({ [hideKey]: !hidden })}>
      ${title}<${Icon} n="right" s=${16} cls=${hidden ? '' : 'open'} /></button></h2>
    ${hidden && summary && html`<span class="muted small ok-sec-sum">${summary}</span>`}
  </header>`;
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
    { k: 'noAnswer', label: 'Merchants without answer or deprioritized', parent: true, toggle: 'okrBreakOpen', has: !!s1.noAnswerBreak },
    ...(s1.noAnswerBreak && U().okrBreakOpen ? NA_BREAK.filter(([k]) => s1.noAnswerBreak[k]).map(([k, label]) => ({ k, label, sub: true, br: true, src: 'noAnswerBreak' })) : []),
    { k: 'pending', label: 'Merchants pending answer' },
    { k: 'known', label: 'Merchants with PDV known by us', kr: true },
    { k: 'integrated', label: 'Already integrated with Keeta', sub: true, tone: 'good' },
    { k: 'gap', label: 'Pending integration', sub: true, tone: 'bad', toggle: 'okrGapOpen', has: !!s1.gapBreak },
    // Pending integration por segmento (redes nacionais x pequenos e médios), pela gap list
    ...(s1.gapBreak && U().okrGapOpen ? [['ska', 'of which SKA'], ['smb', 'of which SMB']].map(([k, label]) => ({ k, label, sub2: true, br: true, tone: 'bad', src: 'gapBreak' })) : []),
  ];
  return html`<section class="ok-sec">
    <${SecHead} n="1" title="Stores and orders" hideKey="okrS1Hidden"
      summary=${`PDV known: ${p1(avg3)} of est. orders (average of X, Y, F) · target ${target}%`} />
    ${!U().okrS1Hidden && html`<div id="ok-sec-1">

    <div class="ok-card ok-kr">
      <div class="kr-head">
        <div class="kr-title"><h3>Est. orders with PDV known by us</h3></div>
        <div class="kr-score">
          <span class=${`kr-num ${avg3 >= target ? 'is-ok' : 'is-bad'}`}><${CountUp} v=${avg3} fmt=${p1} /></span>
          <span class="kr-meta"><${Status} ok=${avg3 >= target}>${avg3 >= target ? 'Above target' : `${(target - avg3).toFixed(1)} pts below target`}<//><span class="muted small">Average of X, Y, F (${3} of ${kr?.citiesTotal || 5} KR cities) · target ${target}%</span></span>
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
        ${[1, 2, 3, 0].map((i, j) => { const ok = knownO(i) >= target;
          return html`<div class=${`kr-row ${i === 0 ? 'total' : ''}`} style=${`--i:${j}`}>
            <span class="ok-slabel"><b>${cityName(CITIES[i])}</b><small>${n0(s1.orders[i])} orders/day</small></span>
            <${Bar} id=${`k${i}`} label=${cityName(CITIES[i])} parts=${ordersParts(i)} total=${ordersParts(i).reduce((a, p) => a + p.v, 0)} split=${2} target=${target} />
            <span class="kr-val" title=${ok ? 'On track' : `${(target - knownO(i)).toFixed(1)} pts short of ${target}%`}><b class=${ok ? 'ok-txt-good' : 'ok-txt-bad'}>${p1(knownO(i))}</b><span class=${`kr-ico ${ok ? 'is-ok' : 'is-bad'}`} aria-label=${ok ? 'on track' : `${(target - knownO(i)).toFixed(1)} points short`}><${Icon} n=${ok ? 'check' : 'alert'} s=${14} /></span></span>
          </div>`; })}
      </div>
    </div>

    <div class="ok-card">
      <div class="ok-tablewrap"><table class="ok-table ok-mt ok-s1">
        <thead>
          <tr class="grp-h"><td></td>${CITIES.map((x) => html`<th scope="colgroup" colspan="2">${x === 'Total' ? 'Total (X + Y + F)' : `City ${x}`}</th>`)}</tr>
          <tr><th scope="col">Metric</th>${CITIES.map((x) => html`<th scope="col" class="num">${x} – Stores</th><th scope="col" class="num">${x} – Orders</th>`)}</tr>
        </thead>
        <tbody>
          <tr><th scope="row">Merchant list (100%)</th>${CITIES.map((_, i) => html`<td class="num">${n0(s1.stores[i])}</td><td class="num">${n0(s1.orders[i])}</td>`)}</tr>
          ${rows.map((r) => html`<tr class=${`${r.tone ? `row-${r.tone}` : ''} ${r.kr ? 'row-kr' : ''} ${r.br ? 'row-br' : ''} ${r.parent ? 'row-parent' : ''}`}>
            <th scope="row" class=${r.sub2 ? 'ok-sub2' : r.sub ? 'ok-sub' : ''}>${r.toggle && r.has
              ? html`<button type="button" class="ok-toggle" aria-expanded=${!!U()[r.toggle]} title=${U()[r.toggle] ? 'Hide breakdown' : 'Show breakdown'} onClick=${() => setUI({ [r.toggle]: !U()[r.toggle] })}>
                  ${r.sub ? '↳ ' : ''}${r.label}<${Icon} n="right" s=${14} cls=${U()[r.toggle] ? 'open' : ''} /></button>`
              : html`${r.sub2 ? '↳↳ ' : r.sub ? '↳ ' : ''}${r.label}`}</th>
            ${CITIES.map((_, i) => { const v = r.src ? s1[r.src][r.k] : s1[r.k];
              return html`<td class=${`num ${i === 0 && r.tone && !r.br ? 'b' : ''}`}>${p1(v.s[i])}</td>
              <td class=${`num ${i === 0 && r.tone && !r.br ? 'b' : ''} ${r.kr ? (v.o[i] >= target ? 'ok-txt-good' : 'ok-txt-bad') : ''}`}>${p1(v.o[i])}</td>`; })}
          </tr>`)}
        </tbody>
      </table></div>
    </div>
    </div>`}
  </section>`;
}

// ---------- Seção 2: PDVs e pedidos pendentes ----------
function PdvSection({ s2, d, e, u }) {
  const c = CITIES.indexOf(u.okrCity || 'Total'); const city = CITIES[c];
  const scope = c === 0 ? 'all cities' : `city ${city}`;
  const gm = (g) => (c === 0 ? g.m.reduce((a, b) => a + b, 0) : g.m[c - 1]);
  const go = (g) => (c === 0 ? g.o.reduce((a, b) => a + b, 0) : g.o[c - 1]);
  const will = WILL[u.okrWill] ? u.okrWill : 'all';
  const gapAll = d.gap.filter((g) => gm(g) > 0).sort((a, b) => go(b) - go(a));
  const gapRows = gapAll.filter((g) => will === 'all' || willCat(g) === will);
  const maxO = Math.max(1, ...gapAll.map(go));
  const willCount = (w) => gapAll.filter((g) => willCat(g) === w).length;
  const cnt = (key) => CITIES.map((_, i) => html`<td class="num">${s2[key][i]}</td>`);
  const withPct = (o) => CITIES.map((_, i) => html`<td class="num">${o.n[i]} <span class="muted">(${p1(o.p[i])})</span></td>`);
  const PDV = { integrated: { label: 'Integrated with Keeta', cls: 'v-good' }, pending: { label: 'Pending integration', cls: 'v-bad' } };
  const WL = { willing: { label: 'Willing to cooperate now', cls: 'v-good-hatch' }, unwilling: { label: 'Unwilling to cooperate', cls: 'v-bad' } };

  return html`<section class="ok-sec">
    <${SecHead} n="2" title="PDVs and pending orders" hideKey="okrS2Hidden"
      summary=${`${s2.mapped[0]} PDVs · ${s2.integrated[0]} integrated · ${s2.pending[0]} on gap · ${p1(s2.unwilling.p[0])} of pending orders unwilling`} />
    ${!u.okrS2Hidden && html`<div id="ok-sec-2">

    <div class="ok-card">
      <h3>Mapped PDVs: integration status and willingness to cooperate</h3>
      <p class="kr-call is-bad"><${Icon} n="alert" s=${15} />
        <span><b>${p1(s2.unwilling.p[0])} of pending orders sit with ${s2.unwilling.n[0]} unwilling PDVs.</b>
          ${[3, 2, 1].map((i, j) => html`${j ? ' · ' : ' '}${CITIES[i]}: ${p1(s2.unwilling.p[i])}`)}.</span>
      </p>
      ${s2.willing.n[0] > 0 && html`<p class="pdv-win"><i class="v-good-hatch" aria-hidden="true"></i>
        <span><b>Quick win:</b> ${s2.willing.n[0]} willing PDV${s2.willing.n[0] === 1 ? '' : 's'} already hold ${p1(s2.willing.p[0])} of pending orders.</span></p>`}
      <${Legend} groups=${[{ items: [PDV.integrated] }, { title: 'Pending integration', items: [WL.willing, WL.unwilling] }]} />
      <div class="kr-row pdv pdv-head" aria-hidden="true"><span></span><span class="muted small">PDVs</span><span class="muted small">Pending orders</span></div>
      ${[1, 2, 3, 0].map((i, j) => html`<div class=${`kr-row pdv ${i === 0 ? 'total' : ''}`} style=${`--i:${j}`}>
        <span class="ok-slabel"><b>${cityName(CITIES[i])}</b><small>${s2.pending[i]} on gap</small></span>
        <${Bar} id=${`p${i}`} label=${cityName(CITIES[i])} total=${s2.mapped[i]} split=${1}
          parts=${[{ v: s2.integrated[i], cls: 'v-good', label: PDV.integrated.label, short: `${s2.integrated[i]}`, text: `${s2.integrated[i]} PDVs · ${p1(pct(s2.integrated[i], s2.mapped[i]))} of mapped PDVs` },
            { v: s2.willing.n[i], cls: 'v-good-hatch', label: `Pending · ${WL.willing.label.toLowerCase()}`, text: `${s2.willing.n[i]} PDVs · ${p1(s2.willing.p[i])} of pending orders` },
            { v: s2.unwilling.n[i], cls: 'v-bad', label: `Pending · ${WL.unwilling.label.toLowerCase()}`, short: `${s2.unwilling.n[i]}`, text: `${s2.unwilling.n[i]} PDVs · ${p1(s2.unwilling.p[i])} of pending orders` }]} />
        <span class="kr-val pdv-val">
          <span><b class="ok-txt-bad">${p1(s2.unwilling.p[i])}</b> <small class="muted">unwilling</small></span>
          <small class="muted">${s2.willing.n[i]} willing · ${s2.unwilling.n[i]} unwilling</small>
        </span>
      </div>`)}

      <div class="ok-tablewrap ok-pdv-wrap"><table class="ok-table ok-mt ok-pdv">
        <thead><tr><th scope="col">Metric</th>${CITIES.map((x) => html`<th scope="col" class="num">${x}</th>`)}</tr></thead>
        <tbody>
          <tr><th scope="row">Total mapped PDVs</th>${cnt('mapped')}</tr>
          <tr class="row-good"><th scope="row">Integrated with Keeta</th>${cnt('integrated')}</tr>
          <tr class="row-bad"><th scope="row">Pending integration</th>${cnt('pending')}</tr>
          <tr><th scope="row">PDVs covering 80% of pending orders</th>${cnt('top80')}</tr>
          <tr class="row-good"><th scope="row" class="ok-sub">↳ Willing to cooperate now</th>${withPct(s2.willing)}</tr>
          <tr class="row-bad"><th scope="row" class="ok-sub">↳ Unwilling to cooperate</th>${withPct(s2.unwilling)}</tr>
        </tbody>
      </table></div>
      <p class="muted small ok-note">% = share of pending orders (orders in stores on a non-integrated PDV), not share of total orders. PDV totals are not the sum of the cities (the same vendor counts once).</p>
    </div>
    </div>`}
  </section>

  <section class="ok-sec">
    <${SecHead} n="3" title="Gap list: PDV vendors not integrated with Keeta" hideKey="okrGapHidden"
      summary=${`${d.gap.length} vendors · ${n0(e.gap[0])} merchants · ${p1(e.ordersGapPct[0])} of all est. orders`} />
    ${!u.okrGapHidden && html`<div class="ok-card" id="ok-sec-3">
      <div class="ok-card-h ok-filters">
        <${Seg} small value=${will} onChange=${(v) => setUI({ okrWill: v })} options=${[{ value: 'all', label: `All ${gapAll.length}` }, ...WILL_ORDER.map((w) => ({ value: w, label: `${WILL[w]} ${willCount(w)}` }))]} />
        <div class="grow"></div>
        <${Seg} small value=${city} onChange=${(v) => setUI({ okrCity: v })} options=${CITIES.map((x) => ({ value: x, label: cityName(x) }))} />
      </div>
      <p class="muted small">${n0(e.gap[c])} merchants · ${nOrd(gapAll.reduce((a, g) => a + go(g), 0))} est. orders/day (${p1(e.ordersGapPct[c])}) · ${scope}</p>
      <div class="ok-tablewrap"><table class="ok-table ok-gap">
        <thead><tr><th scope="col">PDV vendor</th><th scope="col">Willingness</th><th scope="col">TIMs status</th><th scope="col" class="num">Merchants</th><th scope="col" class="num">Est. orders/day</th><th scope="col" class="num">% of all orders</th><th scope="col">Segment</th></tr></thead>
        <tbody>${gapRows.map((g) => html`<tr>
          <th scope="row"><b>${g.vendor}</b>${g.other && html` <span class="ok-tag" title=${`Also mapped in project ${g.other}`}>${g.other}</span>`}</th>
          <td><span class=${`ok-will w-${willCat(g)}`}>${WILL[willCat(g)]}</span></td>
          <td class="ok-status">${g.status || '—'}</td>
          <td class="num">${gm(g)}</td>
          <td class="num ok-barcell"><span class="ok-bc"><span class="ok-ibar" aria-hidden="true" style=${`width:${pct(go(g), maxO)}%`}></span><span class="ok-bv">${nOrd(go(g))}</span></span></td>
          <td class="num">${p1(pct(go(g), e.orders[c]))}</td>
          <td>${g.seg}</td></tr>`)}
          ${!gapRows.length && html`<tr><td colspan="7" class="muted">No vendors in this group.</td></tr>`}
        </tbody>
      </table></div>
    </div>`}
  </section>`;
}

// ---------- Seção 4: prontidão para lançamento (battlecard entre cidades) ----------
// Gatilho por segmento, em % dos pedidos cobertos (PDV integrado ou printer): 70% SKA Classic e Local Heroes, 50% SMB.
// A cidade ganha o selo "Secure to launch" assim que qualquer segmento dela passa do gatilho (cada cidade por si).
const SEGS4 = [['ska', 'SKA Classic'], ['lh', 'Local Heroes'], ['smb', 'SMB']];
const COV4 = { ska: 'SKA orders covered', lh: 'Local Heroes orders covered', smb: 'Orders covered' };
const dash = (a, i) => (a ? n0(a[i]) : '—');
const TRIG4 = { ska: 70, lh: 70, smb: 50 };
function LaunchSection({ s4, u }) {
  const T = (k) => TRIG4[k] ?? s4.target ?? 50;
  const cities = [1, 2, 3];
  const passing = (i) => SEGS4.filter(([k]) => s4.seg[k].coveredPct[i] >= T(k));
  const ready = (i) => passing(i).length > 0;
  const secure = cities.filter(ready);
  // Quem está mais perto do gatilho, para o cartão sem selo dizer o que falta
  const trigTxt = `${TRIG4.ska}% SKA Classic & Local Heroes · ${TRIG4.smb}% SMB`;
  return html`<section class="ok-sec">
    <${SecHead} n="4" title="Launch readiness: city battlecard" hideKey="okrS4Hidden"
      summary=${`Secure to launch: ${secure.length ? secure.map((i) => `${CITIES[i]} (${passing(i).map(([, l]) => l).join(', ')})`).join(' · ') : 'none yet'} · trigger ${trigTxt}`} />
    ${!u.okrS4Hidden && html`<div id="ok-sec-4" class="ok-battle-wrap">
      <p class="muted small ok-lead"><b>Secure to launch:</b> SKA Classic or Local Heroes with ${TRIG4.ska}%+ of their est. orders covered, or SMB with ${TRIG4.smb}%+.</p>
      <${Legend} groups=${[{ title: 'Orders covered', items: [{ label: 'Integrated PDV', cls: 'v-good' }, { label: 'Printer', cls: 'v-good-hatch' }, { label: 'Trigger', cls: 'lg-line' }] }]} />
      <div class="ok-battle">${cities.map((i) => { const ok = ready(i); const pass = passing(i);
        return html`<article class=${`ok-bc-card ${ok ? 'is-secure' : ''}`}>
          <header class="bc-head">
            <h3>City ${CITIES[i]}</h3>
            ${ok ? html`<span class="bc-seal" role="img" aria-label=${`Secure to launch, via ${pass.map(([, l]) => l).join(' and ')}`}>
                <span class="bc-seal-t">Secure to launch</span>
                <span class="bc-seal-s">via ${pass.map(([, l]) => l).join(' + ')}</span>
              </span>`
              : html`<span class="bc-seal is-not" role="img" aria-label="Not secure to launch: no segment at its trigger">
                <span class="bc-seal-t">Not secure to launch</span>
                <span class="bc-seal-s">no segment at trigger</span>
              </span>`}
          </header>
          ${SEGS4.map(([k, label]) => { const g = s4.seg[k]; const cov = g.coveredPct[i]; const target = T(k); const segOk = cov >= target;
            return html`<div class="bc-seg">
              <div class="bc-seg-h"><b>${label}</b></div>
              <table class="bc-tab"><tbody>
                ${g.brands
                  ? html`<tr><th scope="row">${label} brand list</th><td>${n0(g.brands[i])}</td></tr>
                      <tr class="good"><th scope="row">↳ Brands on an integrated PDV</th><td>${n0(g.intBrands[i])}</td></tr>
                      <tr class="bad"><th scope="row">↳ Brands on a PDV not integrated (gap)</th><td>${dash(g.gapBrands, i)}</td></tr>
                      <tr class="unk"><th scope="row">↳ Brands PDV unknown (BD does not know)</th><td>${dash(g.unkBrands, i)}</td></tr>`
                  : html`<tr><th scope="row">${label} merchant list</th><td>${n0(g.stores[i])}</td></tr>
                      <tr><th scope="row">↳ of which are integrated</th><td>${n0(g.intStores[i])}</td></tr>
                      <tr class="good"><th scope="row">↳ % of orders integrated</th><td>${p1(g.intPct[i])}</td></tr>
                      <tr class="bad"><th scope="row">↳ % of orders not integrated</th><td>${p1(100 - g.intPct[i])}</td></tr>`}
              </tbody></table>
              <div class="bc-cov" role="img" aria-label=${`${label}: ${p1(cov)} of orders covered (integrated ${p1(g.intPct[i])} + printer ${p1(g.printerPct[i])}); trigger ${target}%`}>
                <span class="bc-cov-l">${COV4[k]}${!segOk && html`<small> · ${(target - cov).toFixed(1)} pts to ${target}%</small>`}</span>
                <span class=${`bc-cov-v ${segOk ? 'ok-txt-good' : 'ok-txt-bad'}`}>${p1(cov)}</span>
                <span class="bc-track"><span class="bc-fill"><i class="v-good" style=${`width:${Math.min(100, g.intPct[i])}%`}></i><i class="v-good-hatch" style=${`width:${Math.min(100 - g.intPct[i], g.printerPct[i])}%`}></i></span><span class="ok-target" style=${`left:${target}%`}></span></span>
              </div>
            </div>`; })}
        </article>`; })}
      </div>
      <p class="muted small ok-note">Segments from the "Local Heroes vs Classic SKA" tab. Local Heroes = candidates that meet the size criterion (to be validated); SMB = all other stores.</p>
    </div>`}
  </section>`;
}

export function Okr() {
  const d = S().okr3; const u = U();
  if (!d || !d.s1 || !d.s2) return html`<div class="view okr"><${Empty} text="No OKR3 data yet." icon="list" /></div>`;
  return html`<div class="view okr">
    <div class="toolbar">
      <div class="ok-head"><h2>Epicenters PDV coverage</h2><span class="muted small">${d.syncedAt
        ? `Updated from the sheet ${new Date(d.syncedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
        : `Data as of ${fmtDay(d.asOf)} · Summary tab`}</span></div>
      <div class="grow"></div>
      ${d.source && html`<a class="btn btn-sm" href=${d.source} target="_blank" rel="noopener"><${Icon} n="link" s=${14} />Summary sheet</a>`}
    </div>
    <${StoresSection} s1=${d.s1} kr=${d.kr} />
    <${PdvSection} s2=${d.s2} d=${d} e=${d.exec} u=${u} />
    ${d.s4 && html`<${LaunchSection} s4=${d.s4} u=${u} />`}
  </div>`;
}
