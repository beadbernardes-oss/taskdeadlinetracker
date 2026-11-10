-- Tracker · parte 2: agenda de alertas (rode no SQL Editor, depois do schema.sql)

create table if not exists public.scheduled_alerts (
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key      text not null,               -- identifica o alerta (evita duplicar)
  fire_at  timestamptz not null,        -- quando disparar (já no seu fuso, calculado pelo app)
  kind     text,
  title    text not null,
  body     text,
  ref      jsonb,                       -- o que abrir ao tocar na notificação
  sent_at  timestamptz,
  primary key (user_id, key)
);
create index if not exists scheduled_alerts_due on public.scheduled_alerts (fire_at) where sent_at is null;

alter table public.scheduled_alerts enable row level security;
drop policy if exists "alertas: ler os meus"    on public.scheduled_alerts;
drop policy if exists "alertas: criar os meus"  on public.scheduled_alerts;
drop policy if exists "alertas: apagar os meus" on public.scheduled_alerts;
create policy "alertas: ler os meus"    on public.scheduled_alerts for select using (auth.uid() = user_id);
create policy "alertas: criar os meus"  on public.scheduled_alerts for insert with check (auth.uid() = user_id);
create policy "alertas: apagar os meus" on public.scheduled_alerts for delete using (auth.uid() = user_id);

-- Permite atualizar a inscrição de push do mesmo aparelho
drop policy if exists "push: alterar os meus" on public.push_subscriptions;
create policy "push: alterar os meus" on public.push_subscriptions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
