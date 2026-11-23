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
const CITY_COL = { 'Brasília': 1, 'Belo Horizonte': 2, 'Fortaleza': 3 }; // X, Y, F (coluna "City" do Tracker)

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

function buildOkr() {
  const ss = SpreadsheetApp.getActive();
  const sum = sheet('Summary').getDataRange().getDisplayValues();

  // Executive view (linhas 2 a 24): colunas D (Total), E (X), F (Y), G (F)
  const EXEC = {
    merchants: 'Merchants in list', orders: 'Estimated orders', covered: 'Merchants covered by discovery',
    pos: 'Merchants with a POS found', integrated: 'Merchants on a POS integrated with Keeta', gap: 'Merchants on a POS not integrated (gap)',
    posIntegratedPct: '% of merchants with a POS found on an integrated POS', ordersIntegratedPct: '% of all est. orders on an integrated POS',
    ordersGapPct: '% of all est. orders in the gap', vendors: 'POS vendors found', vendorsIntegrated: 'integrated with Keeta',
    vendorsGap: 'not integrated (= gap list)', noResponse: 'Merchants with no response', noResponsePct: '% of covered merchants with no response',
    printer: 'Merchants on a printer (no POS)', excluded: 'Merchants excluded from gap (ordering tool or self-built)',
    brands: 'Brands (total)', brandsIntegrated: 'on an integrated POS', brandsGap: 'on a POS not integrated (gap)',
    brandsUnknown: 'POS unknown (BD does not know)', skaOrdersPct: 'SKA orders covered (all SKA orders)',
  };
  const execRows = sum.slice(0, 25);
  const exec = {};
  Object.keys(EXEC).forEach((k) => { const r = execRows[findRow(execRows, EXEC[k])]; exec[k] = [3, 4, 5, 6].map((c) => num(r[c])); });

  // Gap list: do cabeçalho "Willingness" até "Total gap merchants"
  let h = sum.findIndex((r) => norm(r[0]) === 'willingness');
  if (h < 0) throw new Error('Cabeçalho da gap list não encontrado na Summary');
  const gap = [];
  for (let i = h + 1; i < sum.length; i++) {
    const r = sum[i];
    if (norm(r[2]) === 'total gap merchants') break;
    if (!String(r[2]).trim()) continue;
    gap.push({ vendor: String(r[2]).trim(), will: norm(r[0]), status: String(r[1]).trim(), m: [num(r[6]), num(r[9]), num(r[12])], o: [num(r[7]), num(r[10]), num(r[13])], seg: String(r[15]).trim(), other: String(r[16] || '').trim() });
  }

  // 1. Lojas e pedidos: D/E = Total lojas/pedidos, F/G = X, H/I = Y, J/K = F
  const s1h = findRow(sum, '1. Lojas e pedidos');
  const pair = (label) => { const r = sum[findRow(sum, label, s1h)]; return { s: [3, 5, 7, 9].map((c) => num(r[c])), o: [4, 6, 8, 10].map((c) => num(r[c])) }; };
  const list = sum[findRow(sum, 'Merchant list', s1h)];
  const s1 = {
    stores: [3, 5, 7, 9].map((c) => num(list[c])), orders: [4, 6, 8, 10].map((c) => num(list[c])),
    noAnswer: pair('Merchants without answer or deprioritized'), pending: pair('Merchants pending answer'),
    known: pair('Merchants with PDV known by us'), integrated: pair('Already integrated with Keeta'), gap: pair('Pending integration'),
  };

  // 2. PDVs e pedidos pendentes: D/F/H/J = quantidade, E/G/I/K = % dos pedidos pendentes
  const s2h = findRow(sum, '2. PDVs e pedidos pendentes');
  const cnt = (label) => [3, 5, 7, 9].map((c) => num(sum[findRow(sum, label, s2h)][c]));
  const np = (label) => { const r = sum[findRow(sum, label, s2h)]; return { n: [3, 5, 7, 9].map((c) => num(r[c])), p: [4, 6, 8, 10].map((c) => num(r[c])) }; };
  const s2 = {
    mapped: cnt('Total mapped PDVs'), integrated: cnt('Integrated with Keeta'), pending: cnt('Pending integration'),
    top80: cnt('PDVs covering 80% of pending orders'), willing: np('Willing to cooperate now'), unwilling: np('Unwilling to cooperate'),
  };

  // Pending integration por segmento (coluna Segment da gap list)
  const gapBreak = {};
  ['SKA', 'SMB'].forEach((seg) => {
    const g = gap.filter((x) => x.seg === seg);
    const m = [0, 1, 2, 3].map((i) => (i === 0 ? g.reduce((a, x) => a + x.m[0] + x.m[1] + x.m[2], 0) : g.reduce((a, x) => a + x.m[i - 1], 0)));
    const o = [0, 1, 2, 3].map((i) => (i === 0 ? g.reduce((a, x) => a + x.o[0] + x.o[1] + x.o[2], 0) : g.reduce((a, x) => a + x.o[i - 1], 0)));
    gapBreak[seg.toLowerCase()] = { s: m.map((v, i) => r1(100 * v / (exec.merchants[i] || 1))), o: o.map((v, i) => r1(100 * v / (exec.orders[i] || 1))) };
  });

  // Tracker loja a loja: detalhe de "without answer or deprioritized" e battlecard por segmento
  const tr = sheet('Tracker').getRange('A2:Q' + sheet('Tracker').getLastRow()).getDisplayValues();
  const notPos = sheet('Not a POS').getDataRange().getDisplayValues().slice(1).map((r) => norm(r[0])).filter((v) => v && v !== 'total');
  const notPosSet = new Set(notPos);
  const selfBuilt = (v) => /self.?built/.test(v);
  const lh = sheet('Local Heroes vs Classic SKA').getDataRange().getDisplayValues();
  const lhHead = lh.findIndex((r) => norm(r[0]) === 'city' && norm(r[1]) === 'brand' && norm(r[2]).indexOf('class') === 0);
  const z = () => [0, 0, 0, 0];
  const cls = {};
  // Marcas por segmento e cidade (battlecard). Coluna I "POS found (Tracker)", coluna J "On integrated POS?":
  // integrada = J tem Yes; PDV desconhecido = I vazio ou "Not Mapped"; sistema que não é PDV = todos os sistemas
  // de I estão na aba "Not a POS" (ordering tool, self-built); senão, PDV não integrado (gap)
  const brands = { ska: z(), lh: z() }; const intBrands = { ska: z(), lh: z() };
  const gapBrands = { ska: z(), lh: z() }; const unkBrands = { ska: z(), lh: z() };
  const nonPosBrands = { ska: z(), lh: z() };
  const allNotPos = (pos) => pos.split(',').map((x) => x.trim()).filter(Boolean).every((x) => notPosSet.has(x));
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
  const sg = {}; SEG.forEach((k) => { sg[k] = { n: z(), o: z(), iN: z(), iO: z(), pO: z(), pdv: z().map(() => new Set()), pdvInt: z().map(() => new Set()), unkN: z() }; });
  const totN = z(); const totO = z();
  tr.forEach((r) => {
    const c = CITY_COL[String(r[16]).trim()]; if (!c) return;
    const o = num(r[5]); const st = String(r[6]).trim(); const plat = String(r[7]).trim(); const integ = String(r[10]).trim() === 'Yes';
    const researched = st === 'Researched';
    let cat = null;
    if (st.indexOf('No signal') === 0) cat = 'noAnswer';
    else if (st.indexOf('Long tail') === 0) cat = 'longTail';
    else if (researched && !plat) cat = 'printer';
    else if (researched && !integ && notPosSet.has(norm(plat))) cat = selfBuilt(norm(plat)) ? 'selfBuilt' : 'orderingTool';
    const seg = cls[String(r[16]).trim() + '|' + norm(r[2])] || 'smb';
    [0, c].forEach((j) => {
      totN[j] += 1; totO[j] += o;
      if (cat) { bN[cat][j] += 1; bO[cat][j] += o; }
      const d = sg[seg]; d.n[j] += 1; d.o[j] += o;
      if (researched && integ) { d.iN[j] += 1; d.iO[j] += o; }
      if (researched && !plat) d.pO[j] += o;
      // PDVs distintos do segmento (como "Total mapped PDVs" da Summary): sem sistemas da aba "Not a POS"
      const p = norm(plat);
      // Merchants com PDV desconhecido: loja ainda não pesquisada (sem resposta, pendente, long tail, KAM) ou "Not Mapped"
      if (!researched || p === 'not mapped') d.unkN[j] += 1;
      if (p && p !== 'not mapped' && !notPosSet.has(p)) { d.pdv[j].add(p); if (integ) d.pdvInt[j].add(p); }
    });
  });
  const noAnswerBreak = {};
  BRK.forEach((k) => { noAnswerBreak[k] = { s: [0, 1, 2, 3].map((j) => r1(100 * bN[k][j] / (totN[j] || 1))), o: [0, 1, 2, 3].map((j) => r1(100 * bO[k][j] / (totO[j] || 1))) }; });
  s1.noAnswerBreak = noAnswerBreak;
  s1.gapBreak = gapBreak;
  // Battlecard: lojas, integradas e % de pedidos integrados vêm da seção "3. SKA Classic, Local Heroes e SMB" da Summary.
  // O % de pedidos em printer não está na Summary: usa a linha de printer da seção se existir, senão calcula pelo Tracker.
  const s3h = sum.findIndex((r) => norm(r[2]).indexOf('3. ska classic') === 0);
  const seg4 = {};
  SEG.forEach((k) => {
    const d = sg[k];
    const calcPrinter = [0, 1, 2, 3].map((j) => (d.o[j] ? r1(100 * d.pO[j] / d.o[j]) : 0));
    let stores = d.n; let intStores = d.iN;
    let intPct = [0, 1, 2, 3].map((j) => (d.o[j] ? r1(100 * d.iO[j] / d.o[j]) : 0));
    let printerPct = calcPrinter;
    if (s3h >= 0) {
      const name = { ska: 'SKA Classic', lh: 'Local Heroes', smb: 'SMB' }[k];
      let i; try { i = findRow(sum, name + ' merchant list', s3h); } catch (e) { i = findRow(sum, name + ' brand list', s3h); }
      const S = (row) => [3, 5, 7, 9].map((c) => num(sum[row][c]));
      const O = (row) => [4, 6, 8, 10].map((c) => num(sum[row][c]));
      stores = S(i); intStores = S(i + 1); intPct = O(i + 2);
      for (let j = i + 1; j <= i + 5 && j < sum.length; j++) if (/printer/.test(norm(sum[j][2]))) { printerPct = O(j); break; }
    }
    seg4[k] = { stores, intStores, intPct, printerPct, coveredPct: intPct.map((v, j) => r1(v + printerPct[j])),
      pdvs: d.pdv.map((x) => x.size), pdvInt: d.pdvInt.map((x) => x.size), pdvGap: d.pdv.map((x, j) => x.size - d.pdvInt[j].size), pdvUnkMerchants: d.unkN };
    if (brands[k]) Object.assign(seg4[k], { brands: brands[k], intBrands: intBrands[k], gapBrands: gapBrands[k], nonPosBrands: nonPosBrands[k], unkBrands: unkBrands[k] });
  });

  return {
    asOf: Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd'),
    sentAt: new Date().toISOString(),
    source: ss.getUrl() + '#gid=' + sheet('Summary').getSheetId(),
    kr: { target: 70, citiesTotal: 5 },
    exec, gap, s1, s2,
    s4: { target: 50, seg: seg4 },
  };
}

/** Para conferir sem enviar: Executar → testBuild e veja o registro de execução. */
function testBuild() { console.log(JSON.stringify(buildOkr()).slice(0, 4000)); }
