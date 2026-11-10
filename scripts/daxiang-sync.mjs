// Sincroniza a agenda do Daxiang com o Tracker.
// Lê as reuniões pelo CLI oficial (oa-skills calendar-mcp, só leitura) e envia para o Supabase.
// Uso: node scripts/daxiang-sync.mjs [--dry]   (--dry só mostra o que seria enviado)
import { execFileSync } from 'node:child_process';
import { readFileSync, appendFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIS = 'beatrizbernardes';
const TZ = 'America/Sao_Paulo';
const PAST_DAYS = 7, FUTURE_DAYS = 56, CHUNK_DAYS = 7;
const ENDPOINT = 'https://bskbumrpbbyujlutlipa.supabase.co/functions/v1/dx-ingest';
const LOG = join(ROOT, '.secrets', 'daxiang-sync.log');
const DRY = process.argv.includes('--dry');
const PESSOAL = /^\s*\[pessoal\]/i; // eventos marcados [PESSOAL] nunca saem do computador
// Caminho completo do CLI (a tarefa agendada do Windows não tem a pasta do npm no PATH)
const NPM_DIR = join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'npm');
const OA_FULL = join(NPM_DIR, 'oa-skills.cmd');
const OA = existsSync(OA_FULL) ? `"${OA_FULL}"` : 'oa-skills';
if (OA === 'oa-skills') appendFileSync(join(ROOT, '.secrets', 'daxiang-sync.log'), `${new Date().toISOString()} aviso: CLI não achado em ${OA_FULL} (APPDATA=${process.env.APPDATA}, node=${process.execPath}, script=${fileURLToPath(import.meta.url)})\n`);
process.env.PATH = `${NPM_DIR};${dirname(process.execPath)};${process.env.PATH || ''}`;
const OUT = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}\n`;
  process.stdout.write(line);
  try {
    if (existsSync(LOG) && statSync(LOG).size > 200_000) writeFileSync(LOG, '');
    appendFileSync(LOG, line);
  } catch { /* ok */ }
}

// Data local de São Paulo no formato que o CLI espera
const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const local = (d) => fmt.format(d).replace('T', ' ');
const dayStart = (d) => { const s = local(d).slice(0, 10); return new Date(`${s}T00:00:00-03:00`); };

function cli(args) {
  let out;
  for (let tryN = 1; ; tryN++) { // só leitura: pode tentar de novo se a rede falhar
    try { out = execFileSync(OA, ['calendar-mcp', ...args, '--mis', MIS, '--raw'], { encoding: 'utf8', shell: true, timeout: 120_000, maxBuffer: 50 * 1024 * 1024 }); break; }
    catch (e) { if (tryN >= 3) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000 * tryN); }
  }
  const j = JSON.parse(out.slice(out.indexOf('{')));
  if (j.status?.code !== 0) throw new Error(`Daxiang: ${j.status?.msg || 'erro'}`);
  return j.data;
}

function search(from, to) {
  const all = [];
  for (let page = 1; page < 50; page++) {
    const d = cli(['searchSchedule', '--startTime', `"${local(from)}"`, '--endTime', `"${local(new Date(+to - 1000))}"`, '--timeZone', TZ, '--pageIndex', String(page), '--pageSize', '100']);
    all.push(...(d.data || []));
    if (!d.hasNext) break;
  }
  return all;
}

// --login: faz uma consulta com a janela "ligada" ao terminal, para o login da empresa (SSO) aparecer e ser concluído
function interactiveLogin() {
  console.log('\nConectando ao Daxiang (se pedir login da empresa, siga as instruções abaixo)...\n');
  const t = local(new Date());
  execFileSync(OA, ['calendar-mcp', 'searchSchedule', '--startTime', `"${t.slice(0, 10)} 00:00"`, '--endTime', `"${t.slice(0, 10)} 23:59:59"`, '--mis', MIS], { stdio: 'inherit', shell: true });
  console.log('\nConectado. Sincronizando (leva alguns minutos)...\n');
}

async function main() {
  if (process.argv.includes('--login')) interactiveLogin();
  const tokenFile = join(ROOT, '.secrets', 'daxiang.txt');
  const token = readFileSync(tokenFile, 'utf8').split('TOKEN')[1]?.split('\n').map((s) => s.trim()).find((s) => /^[A-Za-z0-9_-]{40,}$/.test(s));
  if (!token) throw new Error('Token não encontrado em .secrets/daxiang.txt');

  const qFrom = new Date(+dayStart(new Date()) - PAST_DAYS * 864e5);
  const qTo = new Date(+dayStart(new Date()) + FUTURE_DAYS * 864e5);
  // A busca do Daxiang às vezes omite séries em consultas curtas: consulta o período todo e também semana a semana.
  const raw = search(qFrom, qTo);
  for (let a = qFrom; a < qTo; a = new Date(+a + CHUNK_DAYS * 864e5)) {
    const b = new Date(Math.min(+a + CHUNK_DAYS * 864e5, +qTo));
    raw.push(...search(a, b));
  }
  // Janela "confiável": 1 dia de margem nas pontas (fora dela o app não apaga nada)
  const from = new Date(+qFrom + 864e5), to = new Date(+qTo - 864e5);
  const seen = new Set();
  const events = [];
  for (const e of raw) {
    if (seen.has(e.eventId)) continue; seen.add(e.eventId);
    if (PESSOAL.test(e.title || '')) continue;
    const s = new Date(e.startTime);
    if (s < from || s >= to) continue;
    const people = (e.attendUserInfoList || []).filter((p) => p.mis !== MIS).map((p) => (p.name || p.mis || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    events.push({
      sid: String(e.eventId).split('_')[0],
      title: (e.title || 'Reunião').replace(/\s+/g, ' ').trim(),
      s: s.toISOString(),
      m: Math.max(5, Math.round((e.endTime - e.startTime) / 60000)),
      org: e.organizerMis === MIS,
      people,
      link: /^https?:\/\//.test(e.conference || '') ? e.conference : '',
    });
  }
  const feed = { from: from.toISOString(), to: to.toISOString(), syncedAt: new Date().toISOString(), events };
  if (OUT) writeFileSync(OUT, JSON.stringify(feed));
  if (DRY) {
    for (const e of events) console.log(local(new Date(e.s)), `${e.m}m`.padEnd(5), e.org ? 'ORG ' : '    ', e.people.length ? '' : '(só você)', e.title);
    log(`dry-run: ${events.length} ocorrências, ${new Set(events.map((e) => e.sid)).size} séries`);
    return;
  }
  const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json', 'x-ingest-token': token }, body: JSON.stringify(feed) });
  const body = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${body.slice(0, 200)}`);
  log(`ok: ${events.length} ocorrências enviadas`);
}

main().catch((e) => { log(`ERRO: ${e.message}`); process.exit(1); });
