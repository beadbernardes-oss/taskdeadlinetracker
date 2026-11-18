// Recebe os números do OKR3 enviados pelo Google Apps Script da planilha e guarda em okr_feed.
// Autenticação: header x-ingest-token (token aleatório com escopo 'okr'; só o hash SHA-256 fica no banco).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const isObj = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const token = req.headers.get('x-ingest-token') || '';
  if (token.length < 32) return new Response('forbidden', { status: 403 });
  const { data: row } = await sb.from('ingest_tokens').select('user_id, scope').eq('token_hash', await sha256(token)).maybeSingle();
  if (!row || row.scope !== 'okr') return new Response('forbidden', { status: 403 });

  const raw = await req.text();
  if (raw.length > 300_000) return new Response('too large', { status: 413 });
  let feed: any;
  try { feed = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }
  // Formato mínimo esperado pelo painel
  if (!isObj(feed) || !isObj(feed.exec) || !isObj(feed.s1) || !isObj(feed.s2) || !Array.isArray(feed.gap) || feed.gap.length > 500) {
    return new Response('bad feed', { status: 400 });
  }

  const { error } = await sb.from('okr_feed').upsert({ user_id: row.user_id, data: feed, updated_at: new Date().toISOString() });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return Response.json({ ok: true, vendors: feed.gap.length });
});
