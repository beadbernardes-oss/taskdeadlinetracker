/**
 * OKR3 → Tracker. Google Apps Script para colar na planilha (Extensões → Apps Script).
 *
 * Lê as abas Summary, Tracker, Not a POS e "Local Heroes vs Classic SKA", monta os números do painel
 * OKR3 Q4 e envia para o Tracker. Roda sozinho quando a planilha muda e a cada hora.
 *
 * Instalação (uma vez):
 *   1. Cole este arquivo inteiro no editor do Apps Script e salve.
 *   2. Configurações do projeto (engrenagem) → Propriedades do script → adicione OKR_TOKEN com o token
 *      que está no arquivo .secrets/okr.txt do tracker.
 *   3. No topo do editor, escolha a função "setup" e clique em Executar. Autorize com sua conta.
 *      Isso cria os gatilhos e faz o primeiro envio.
 * O token fica só nas propriedades do script, nunca no código.
 */

const OKR_ENDPOINT = 'https://bskbumrpbbyujlutlipa.supabase.co/functions/v1/okr-ingest';
const CITY_COL = { 'Brasília': 1, 'Belo Horizonte': 2, 'Fortaleza': 3, 'Curitiba': 4 }; // X, Y, F, C (coluna "City" do Tracker)
const CITY_TAGS = ['x', 'y', 'f', 'c']; // como as cidades aparecem nos cabeçalhos da Summary, na ordem do CITY_COL
const NC = CITY_TAGS.length + 1; // posições nos números: 0 = Total, depois uma por cidade

/** Cria os gatilhos (mudança na planilha + a cada hora) e envia agora. */
function setup() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onSheetChange').forSpreadsheet(SpreadsheetApp.getActive()).onChange().create();
  ScriptApp.newTrigger('sendOkr').timeBased().everyHours(1).create();
  sendOkr(true);
}

/** Planilha mudou: espera as fórmulas recalcularem e envia (um envio por vez). */
function onSheetChange() {
  Utilities.sleep(20000);
  sendOkr(false);
}

/** Monta os números e envia. force = true envia mesmo sem mudança. */
function sendOkr(force) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const token = PropertiesService.getScriptProperties().getProperty('OKR_TOKEN');
    if (!token) throw new Error('Falta a propriedade OKR_TOKEN (Configurações do projeto → Propriedades do script).');
    const data = buildOkr();
    const body = JSON.stringify(data);
    const hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify({ ...data, asOf: '' })));
    const props = PropertiesService.getScriptProperties();
    if (!force && props.getProperty('LAST_HASH') === hash) return; // nada mudou
    const res = UrlFetchApp.fetch(OKR_ENDPOINT, {
      method: 'post', contentType: 'application/json', payload: body, muteHttpExceptions: true,
      headers: { 'x-ingest-token': token },
    });
    if (res.getResponseCode() !== 200) throw new Error('Tracker respondeu ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
    props.setProperty('LAST_HASH', hash);
    console.log('OKR3 enviado: ' + res.getContentText());
  } finally {
    lock.releaseLock();
  }
}

// ---------- leitura ----------
const num = (v) => {
  if (typeof v === 'number') return v;
  const s = String(v || '').trim().replace('%', '').replace(/\s/g, '');
  if (!s) return 0;
  return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0; // formato brasileiro: 4.540 · 62,3
};
const r1 = (v) => Math.round(v * 10) / 10;
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const sheet = (name) => {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Aba não encontrada: ' + name);
  return sh;
};
// Procura a linha cujo rótulo (coluna C) contém o texto, a partir de uma linha
const findRow = (rows, text, from) => {
  for (let i = from || 0; i < rows.length; i++) if (norm(rows[i][2]).replace(/^↳\s*/, '').indexOf(norm(text)) === 0) return i;
  throw new Error('Linha não encontrada na Summary: ' + text);
};
// Acha colunas pelo texto do cabeçalho (assim uma coluna nova na Summary não desalinha a leitura).
// names: lista de cabeçalhos; aceita igual ao texto (sem diferenciar maiúsculas) ou, com '*' no fim, começando por ele.
const hk = (s) => norm(s).replace(/[–—]/g, '-'); // "X – Stores" e "X - Stores" valem igual
const colsOf = (head, names, where) => names.map((n) => {
  const want = hk(n); const pre = want.slice(-1) === '*' ? want.slice(0, -1) : null;
  const i = head.findIndex((h) => (pre !== null ? hk(h).indexOf(pre) === 0 : hk(h) === want));
  if (i < 0) throw new Error('Coluna "' + n + '" não encontrada em ' + where + ' da Summary');
  return i;
});
const cityHeads = (fmt) => ['total'].concat(CITY_TAGS).map(fmt); // ex.: (c) => c + ' – stores'
const seq = (n) => Array.from({ length: n }, (_, i) => i);

function buildOkr() {
  const ss = SpreadsheetApp.getActive();
  const sum = sheet('Summary').getDataRange().getDisplayValues();

  // Executive view (linhas 2 a 24): colunas Total, X, Y, F, C, achadas pelo cabeçalho "Executive view"
  const EXEC = {
    merchants: 'Merchants in list', orders: 'Estimated orders', covered: 'Merchants covered by discovery',
    pos: 'Merchants with a POS found', integrated: 'Merchants on a POS integrated with Keeta', gap: 'Merchants on a POS not integrated (gap)',
    posIntegratedPct: '% of merchants with a POS found on an integrated POS', ordersIntegratedPct: '% of all est. orders on an integrated POS',
    ordersGapPct: '% of all est. orders in the gap', vendors: 'POS vendors found', vendorsIntegrated: 'integrated with Keeta',
    vendorsGap: 'not integrated (= gap list)', noResponse: 'Merchants with no response', noResponsePct: '% of covered merchants with no response',
    printer: 'Merchants on a printer (no POS)', excluded: 'Merchants excluded from gap',
    brands: 'Brands (total)', brandsIntegrated: 'on an integrated POS', brandsGap: 'on a POS not integrated (gap)',
    brandsUnknown: 'POS unknown (BD does not know)', skaOrdersPct: 'SKA orders covered (all SKA orders)',
  };
  const execRows = sum.slice(0, 25);
  const execCols = colsOf(execRows[findRow(execRows, 'Executive view')], cityHeads((c) => c), 'Executive view');
  const exec = {};
  Object.keys(EXEC).forEach((k) => { const r = execRows[findRow(execRows, EXEC[k])]; exec[k] = execCols.map((c) => num(r[c])); });

  // Gap list: do cabeçalho "Willingness" até "Total gap merchants"; m e o = merchants e pedidos por cidade (X, Y, F, C)
  let h = sum.findIndex((r) => norm(r[0]) === 'willingness');
  if (h < 0) throw new Error('Cabeçalho da gap list não encontrado na Summary');
  const gh = sum[h];
  const gm = colsOf(gh, CITY_TAGS.map((c) => 'Merchants (' + c + ')'), 'gap list');
  const go = colsOf(gh, CITY_TAGS.map((c) => 'Est. orders (' + c + ')'), 'gap list');
  const [gSeg] = colsOf(gh, ['Segment*'], 'gap list');
  let gOther = -1; try { [gOther] = colsOf(gh, ['Also mapped*'], 'gap list'); } catch (e) { /* coluna opcional */ }
  const gap = [];
  for (let i = h + 1; i < sum.length; i++) {
    const r = sum[i];
    if (norm(r[2]) === 'total gap merchants') break;
    if (!String(r[2]).trim()) continue;
    gap.push({ vendor: String(r[2]).trim(), will: norm(r[0]), status: String(r[1]).trim(), m: gm.map((c) => num(r[c])), o: go.map((c) => num(r[c])),
      seg: String(r[gSeg] || '').trim(), other: gOther >= 0 ? String(r[gOther] || '').trim() : '' });
  }

  // Seções 1 e 3: linha "Metric" logo abaixo do título, com "Total – Stores", "Total – Orders", "X – Stores"...
  const metricHead = (from, where) => {
    for (let i = from + 1; i < Math.min(sum.length, from + 4); i++) if (norm(sum[i][2]) === 'metric') return sum[i];
    throw new Error('Cabeçalho "Metric" não encontrado em ' + where + ' da Summary');
  };

  // 1. Lojas e pedidos
  const s1h = findRow(sum, '1. Lojas e pedidos');
  const s1H = metricHead(s1h, 'seção 1');
  const s1S = colsOf(s1H, cityHeads((c) => c + ' – stores'), 'seção 1'); const s1O = colsOf(s1H, cityHeads((c) => c + ' – orders'), 'seção 1');
  const pair = (label) => { const r = sum[findRow(sum, label, s1h)]; return { s: s1S.map((c) => num(r[c])), o: s1O.map((c) => num(r[c])) }; };
  const list = sum[findRow(sum, 'Merchant list', s1h)];
  const s1 = {
    stores: s1S.map((c) => num(list[c])), orders: s1O.map((c) => num(list[c])),
    noAnswer: pair('Merchants without answer or deprioritized'), pending: pair('Merchants pending answer'),
    known: pair('Merchants with PDV known by us'), integrated: pair('Already integrated with Keeta'), gap: pair('Pending integration'),
  };

  // 2. PDVs e pedidos pendentes: "Total", "X"... = quantidade; "Total – % of pending orders"... = % dos pedidos pendentes
  const s2h = findRow(sum, '2. PDVs e pedidos pendentes');
  const s2H = metricHead(s2h, 'seção 2');
  const s2N = colsOf(s2H, cityHeads((c) => c), 'seção 2'); const s2P = colsOf(s2H, cityHeads((c) => c + ' – % of pending orders'), 'seção 2');
  const cnt = (label) => s2N.map((c) => num(sum[findRow(sum, label, s2h)][c]));
  const np = (label) => { const r = sum[findRow(sum, label, s2h)]; return { n: s2N.map((c) => num(r[c])), p: s2P.map((c) => num(r[c])) }; };
  const s2 = {
    mapped: cnt('Total mapped PDVs'), integrated: cnt('Integrated with Keeta'), pending: cnt('Pending integration'),
    top80: cnt('PDVs covering 80% of pending orders'), willing: np('Willing to cooperate now'), unwilling: np('Unwilling to cooperate'),
  };

  // Pending integration por segmento (coluna Segment da gap list); posição 0 = soma das cidades
  const gapBreak = {};
  const tot = (a) => a.reduce((x, y) => x + y, 0);
  ['SKA', 'SMB'].forEach((seg) => {
    const g = gap.filter((x) => x.seg === seg);
    const m = seq(NC).map((i) => g.reduce((a, x) => a + (i === 0 ? tot(x.m) : x.m[i - 1]), 0));
    const o = seq(NC).map((i) => g.reduce((a, x) => a + (i === 0 ? tot(x.o) : x.o[i - 1]), 0));
    gapBreak[seg.toLowerCase()] = { s: m.map((v, i) => r1(100 * v / (exec.merchants[i] || 1))), o: o.map((v, i) => r1(100 * v / (exec.orders[i] || 1))) };
  });

  // Tracker loja a loja: detalhe de "without answer or deprioritized" e battlecard por segmento
  const tr = sheet('Tracker').getRange('A2:Q' + sheet('Tracker').getLastRow()).getDisplayValues();
  const notPos = sheet('Not a POS').getDataRange().getDisplayValues().slice(1).map((r) => norm(r[0])).filter((v) => v && v !== 'total');
  const notPosSet = new Set(notPos);
  // Self-built é o PDV próprio da marca: é PDV (não vai na aba "Not a POS"), mas fica fora do gap porque integrar
  // depende da marca assinar com a Keeta. Reconhecido pelo nome; "Self-built" genérico vira "<marca> self-built".
  const selfBuilt = (v) => /self.?built/.test(v);
  const sysName = (p, brand) => (/^self.?built$/.test(p) ? norm(brand) + ' self-built' : p);
  const outOfGap = (p) => selfBuilt(p) || notPosSet.has(p); // ordering tool ou self-built
  const lh = sheet('Local Heroes vs Classic SKA').getDataRange().getDisplayValues();
  const lhHead = lh.findIndex((r) => norm(r[0]) === 'city' && norm(r[1]) === 'brand' && norm(r[2]).indexOf('class') === 0);
  const z = () => seq(NC).map(() => 0);
  const cls = {};
  // Marcas por segmento e cidade (battlecard). Coluna I "POS found (Tracker)", coluna J "On integrated POS?":
  // integrada = J tem Yes; PDV desconhecido = I vazio ou "Not Mapped"; fora do gap = todos os sistemas de I são
  // ordering tool (aba "Not a POS") ou self-built; senão, PDV não integrado (gap)
  const brands = { ska: z(), lh: z() }; const intBrands = { ska: z(), lh: z() };
  const gapBrands = { ska: z(), lh: z() }; const unkBrands = { ska: z(), lh: z() };
  const nonPosBrands = { ska: z(), lh: z() };
  const allNotPos = (pos) => pos.split(',').map((x) => x.trim()).filter(Boolean).every(outOfGap);
  if (lhHead >= 0) for (let i = lhHead + 1; i < lh.length; i++) {
    const r = lh[i]; if (!(r[0] in CITY_COL)) continue;
    const key = r[0] + '|' + norm(r[1]);
    let k = null;
    if (r[2] === 'SKA - Classic') k = 'ska';
    else if (r[2] === 'SKA - Local Hero' && norm(r[7]) === 'yes') k = 'lh';
    if (!k) continue;
    cls[key] = k;
    const pos = norm(r[8]); const bucket = /yes/.test(norm(r[9])) ? intBrands : (!pos || pos === 'not mapped' ? unkBrands : (allNotPos(pos) ? nonPosBrands : gapBrands));
    [0, CITY_COL[r[0]]].forEach((j) => { brands[k][j] += 1; bucket[k][j] += 1; });
  }
  const BRK = ['noAnswer', 'printer', 'longTail', 'selfBuilt', 'orderingTool'];
  const bN = {}; const bO = {}; BRK.forEach((k) => { bN[k] = z(); bO[k] = z(); });
  const SEG = ['ska', 'lh', 'smb'];
  const sg = {}; SEG.forEach((k) => { sg[k] = { n: z(), o: z(), iN: z(), iO: z(), pO: z(), pdv: z().map(() => new Set()), pdvInt: z().map(() => new Set()), unkN: z(), ltN: z(), ltO: z() }; });
  const totN = z(); const totO = z();
  tr.forEach((r) => {
    const c = CITY_COL[String(r[16]).trim()]; if (!c) return;
    const o = num(r[5]); const st = String(r[6]).trim(); const plat = String(r[7]).trim(); const integ = String(r[10]).trim() === 'Yes';
    const researched = st === 'Researched';
    let cat = null;
    if (st.indexOf('No signal') === 0) cat = 'noAnswer';
    else if (st.indexOf('Long tail') === 0) cat = 'longTail';
    else if (researched && !plat) cat = 'printer';
    else if (researched && !integ && outOfGap(norm(plat))) cat = selfBuilt(norm(plat)) ? 'selfBuilt' : 'orderingTool';
    const seg = cls[String(r[16]).trim() + '|' + norm(r[2])] || 'smb';
    [0, c].forEach((j) => {
      totN[j] += 1; totO[j] += o;
      if (cat) { bN[cat][j] += 1; bO[cat][j] += o; }
      const d = sg[seg]; d.n[j] += 1; d.o[j] += o;
      if (cat === 'longTail') { d.ltN[j] += 1; d.ltO[j] += o; }
      if (researched && integ) { d.iN[j] += 1; d.iO[j] += o; }
      if (researched && !plat) d.pO[j] += o;
      // PDVs distintos do segmento (como "Total mapped PDVs" da Summary): sem ordering tools (aba "Not a POS").
      // Self-built conta como PDV da marca; quando não integrado, vai à parte (fora do gap), não em "not integrated".
      const p = sysName(norm(plat), r[2]);
      // Merchants com PDV desconhecido: loja ainda não pesquisada (sem resposta, pendente, long tail, KAM) ou "Not Mapped"
      if (!researched || p === 'not mapped') d.unkN[j] += 1;
      if (p && p !== 'not mapped' && (selfBuilt(p) || !notPosSet.has(p))) { d.pdv[j].add(p); if (integ) d.pdvInt[j].add(p); }
    });
  });
  const noAnswerBreak = {};
  BRK.forEach((k) => { noAnswerBreak[k] = { s: seq(NC).map((j) => r1(100 * bN[k][j] / (totN[j] || 1))), o: seq(NC).map((j) => r1(100 * bO[k][j] / (totO[j] || 1))) }; });
  s1.noAnswerBreak = noAnswerBreak;
  s1.gapBreak = gapBreak;
  // Battlecard: lojas, integradas e % de pedidos integrados vêm da seção "3. SKA Classic, Local Heroes e SMB" da Summary.
  // O % de pedidos em printer não está na Summary: usa a linha de printer da seção se existir, senão calcula pelo Tracker.
  const s3h = sum.findIndex((r) => norm(r[2]).indexOf('3. ska classic') === 0);
  let s3S = null; let s3O = null;
  if (s3h >= 0) {
    const s3H = metricHead(s3h, 'seção 3');
    s3S = colsOf(s3H, cityHeads((c) => c + ' – stores'), 'seção 3'); s3O = colsOf(s3H, cityHeads((c) => c + ' – orders'), 'seção 3');
  }
  const seg4 = {};
  SEG.forEach((k) => {
    const d = sg[k];
    const calcPrinter = seq(NC).map((j) => (d.o[j] ? r1(100 * d.pO[j] / d.o[j]) : 0));
    let stores = d.n; let intStores = d.iN;
    let intPct = seq(NC).map((j) => (d.o[j] ? r1(100 * d.iO[j] / d.o[j]) : 0));
    let printerPct = calcPrinter;
    if (s3h >= 0) {
      const name = { ska: 'SKA Classic', lh: 'Local Heroes', smb: 'SMB' }[k];
      let i; try { i = findRow(sum, name + ' merchant list', s3h); } catch (e) { i = findRow(sum, name + ' brand list', s3h); }
      const S = (row) => s3S.map((c) => num(sum[row][c]));
      const O = (row) => s3O.map((c) => num(sum[row][c]));
      stores = S(i); intStores = S(i + 1); intPct = O(i + 2);
      for (let j = i + 1; j <= i + 5 && j < sum.length; j++) if (/printer/.test(norm(sum[j][2]))) { printerPct = O(j); break; }
    }
    seg4[k] = { stores, intStores, intPct, printerPct, coveredPct: intPct.map((v, j) => r1(v + printerPct[j])),
      pdvs: d.pdv.map((x) => x.size), pdvInt: d.pdvInt.map((x) => x.size), pdvUnkMerchants: d.unkN,
      pdvSelf: d.pdv.map((x, j) => [...x].filter((p) => selfBuilt(p) && !d.pdvInt[j].has(p)).length),
      pdvGap: d.pdv.map((x, j) => [...x].filter((p) => !selfBuilt(p) && !d.pdvInt[j].has(p)).length),
      orders: d.o.map(r1), ltStores: d.ltN, ltOrders: d.ltO.map(r1) };
    if (brands[k]) Object.assign(seg4[k], { brands: brands[k], intBrands: intBrands[k], gapBrands: gapBrands[k], nonPosBrands: nonPosBrands[k], unkBrands: unkBrands[k] });
  });

  return {
    asOf: Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd'),
    sentAt: new Date().toISOString(),
    source: ss.getUrl() + '#gid=' + sheet('Summary').getSheetId(),
    kr: { target: 70, citiesTotal: 5 },
    cities: ['Total'].concat(CITY_TAGS.map((c) => c.toUpperCase())),
    exec, gap, s1, s2,
    s4: { target: 50, seg: seg4 },
  };
}

/** Para conferir sem enviar: Executar → testBuild e veja o registro de execução. */
function testBuild() { console.log(JSON.stringify(buildOkr()).slice(0, 4000)); }
