-- Integração Daxiang: agenda enviada pelo script do computador.
-- Rode no SQL Editor do Supabase. Depois rode também o bloco "SQL do token" do arquivo .secrets/daxiang.txt.

create table if not exists public.calendar_feed (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.calendar_feed enable row level security;
drop policy if exists "feed: ler o próprio" on public.calendar_feed;
create policy "feed: ler o próprio" on public.calendar_feed for select using (auth.uid() = user_id);

do $$ begin
  alter publication supabase_realtime add table public.calendar_feed;
exception when duplicate_object then null; end $$;

-- Tokens do script (só o hash SHA-256; sem acesso pelo app)
create table if not exists public.ingest_tokens (
  token_hash text primary key,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.ingest_tokens enable row level security;
