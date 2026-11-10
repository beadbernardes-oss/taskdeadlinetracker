-- Tracker · schema do Supabase
-- Rode uma vez em: Supabase → SQL Editor → New query → cole tudo → Run.
-- Seguro para rodar de novo (usa IF NOT EXISTS / DROP POLICY IF EXISTS).

-- 1) Documento do tracker (um por usuária). O app sincroniza o estado inteiro aqui.
create table if not exists public.tracker_docs (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  version    bigint not null default 1,          -- controle de conflito entre desktop e iPhone
  updated_at timestamptz not null default now()
);

-- 2) Aparelhos que recebem push (desktop, iPhone…)
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  device     text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);

-- 3) Caixa de notificações (o servidor escreve, o app lê e marca como lida)
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null,                       -- evita mandar o mesmo alerta duas vezes
  kind       text,
  title      text not null,
  body       text,
  ref        jsonb,
  read       boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, key, created_at)
);
create index if not exists notifications_user_key on public.notifications (user_id, key, created_at desc);

-- Row Level Security: cada usuária só enxerga os próprios dados.
alter table public.tracker_docs       enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notifications      enable row level security;

drop policy if exists "docs: ler o meu"       on public.tracker_docs;
drop policy if exists "docs: criar o meu"     on public.tracker_docs;
drop policy if exists "docs: alterar o meu"   on public.tracker_docs;
create policy "docs: ler o meu"     on public.tracker_docs for select using (auth.uid() = user_id);
create policy "docs: criar o meu"   on public.tracker_docs for insert with check (auth.uid() = user_id);
create policy "docs: alterar o meu" on public.tracker_docs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "push: ler os meus"     on public.push_subscriptions;
drop policy if exists "push: criar os meus"   on public.push_subscriptions;
drop policy if exists "push: apagar os meus"  on public.push_subscriptions;
create policy "push: ler os meus"    on public.push_subscriptions for select using (auth.uid() = user_id);
create policy "push: criar os meus"  on public.push_subscriptions for insert with check (auth.uid() = user_id);
create policy "push: apagar os meus" on public.push_subscriptions for delete using (auth.uid() = user_id);

drop policy if exists "notif: ler as minhas"     on public.notifications;
drop policy if exists "notif: marcar as minhas"  on public.notifications;
create policy "notif: ler as minhas"    on public.notifications for select using (auth.uid() = user_id);
create policy "notif: marcar as minhas" on public.notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Atualização em tempo real entre desktop e iPhone
do $$ begin
  alter publication supabase_realtime add table public.tracker_docs;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;

-- Extensões para o agendador de alertas (o job em si é criado no próximo passo)
create extension if not exists pg_cron;
create extension if not exists pg_net;
