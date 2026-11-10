// Edge Function "alerts": roda a cada minuto (pg_cron) e envia os alertas cujo horário chegou.
// Secrets necessários: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET.
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem automaticamente nas Edge Functions.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return new Response('forbidden', { status: 403 });

  const now = new Date();
  const oldest = new Date(now.getTime() - 3 * 3600e3).toISOString(); // não manda alerta velho (>3h)
  const { data: due, error } = await sb.from('scheduled_alerts')
    .select('*').is('sent_at', null).lte('fire_at', now.toISOString()).gte('fire_at', oldest)
    .order('fire_at').limit(100);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let sent = 0; const dead: string[] = [];
  const subsCache = new Map<string, any[]>();
  for (const a of due ?? []) {
    // Marca antes de enviar para nunca duplicar se duas execuções se sobrepuserem
    const { data: claimed } = await sb.from('scheduled_alerts').update({ sent_at: now.toISOString() })
      .eq('user_id', a.user_id).eq('key', a.key).is('sent_at', null).select('key');
    if (!claimed?.length) continue;
    if (!subsCache.has(a.user_id)) {
      const { data: subs } = await sb.from('push_subscriptions').select('*').eq('user_id', a.user_id);
      subsCache.set(a.user_id, subs ?? []);
    }
    const payload = JSON.stringify({ title: a.title, body: a.body, key: a.key, ref: a.ref });
    for (const s of subsCache.get(a.user_id)!) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: 'high' });
        sent++;
        await sb.from('push_subscriptions').update({ last_ok_at: now.toISOString() }).eq('id', s.id);
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.id); // aparelho desinscrito
        else console.error('push falhou', code, (e as Error).message);
      }
    }
  }
  if (dead.length) await sb.from('push_subscriptions').delete().in('id', dead);
  // Limpeza: alertas enviados há mais de 30 dias
  await sb.from('scheduled_alerts').delete().lt('fire_at', new Date(now.getTime() - 30 * 864e5).toISOString()).not('sent_at', 'is', null);
  return Response.json({ due: due?.length ?? 0, sent, removed: dead.length });
});
