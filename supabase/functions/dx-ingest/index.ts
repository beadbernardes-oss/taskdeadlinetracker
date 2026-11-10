// Recebe a agenda do Daxiang enviada pelo script do computador e guarda em calendar_feed.
// Autenticação: header x-ingest-token (token aleatório; só o hash SHA-256 fica no banco).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const token = req.headers.get('x-ingest-token') || '';
  if (token.length < 32) return new Response('forbidden', { status: 403 });
  const { data: row } = await sb.from('ingest_tokens').select('user_id').eq('token_hash', await sha256(token)).maybeSingle();
  if (!row) return new Response('forbidden', { status: 403 });

  let feed: any;
  try { feed = await req.json(); } catch { return new Response('bad json', { status: 400 }); }
  if (!feed || !Array.isArray(feed.events) || !feed.from || !feed.to) return new Response('bad feed', { status: 400 });
  if (feed.events.length > 3000) return new Response('too many events', { status: 413 });

  const { error } = await sb.from('calendar_feed').upsert({ user_id: row.user_id, data: feed, updated_at: new Date().toISOString() });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return Response.json({ ok: true, events: feed.events.length });
});
