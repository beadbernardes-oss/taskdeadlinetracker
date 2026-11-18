-- Tracker · OKR3 atualizado sozinho pela planilha.
-- Um Google Apps Script dentro da planilha envia os números para a função okr-ingest, que guarda aqui.
-- Rode uma vez em: Supabase → SQL Editor → New query → cole tudo → Run. Seguro para rodar de novo.
-- Depois rode também o bloco "SQL do token" do arquivo .secrets/okr.txt.

create table if not exists public.okr_feed (
  user_id    uuid primary key references auth.users on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.okr_feed enable row level security;
drop policy if exists "okr: ler o próprio" on public.okr_feed;
create policy "okr: ler o próprio" on public.okr_feed for select using (auth.uid() = user_id);

do $$ begin
  alter publication supabase_realtime add table public.okr_feed;
exception when duplicate_object then null; end $$;

-- Cada token só serve para uma coisa: 'dx' (agenda do Daxiang) ou 'okr' (planilha do OKR3).
-- O token que fica na planilha não consegue mexer na agenda, e vice-versa.
alter table public.ingest_tokens add column if not exists scope text not null default 'dx';
