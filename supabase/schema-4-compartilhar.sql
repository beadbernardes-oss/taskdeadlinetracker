-- Tracker · compartilhar só o Gantt e o OKR3 com outra pessoa (ex.: sua head), somente leitura.
-- Rode uma vez em: Supabase → SQL Editor → New query → cole tudo → Run. Seguro para rodar de novo.
--
-- Como funciona:
--   shared_views  = a "vitrine": cópia só das entregas do Gantt, do OKR3 e das fotos dos PMs.
--                   Seu app atualiza sozinho. Tarefas, reuniões, pautas e o resto NÃO entram aqui.
--   shared_access = quem pode ver a sua vitrine (pelo e-mail). Você gerencia em Configurações no app.
-- A convidada nunca tem acesso a tracker_docs (seus dados completos): as regras abaixo só liberam a vitrine.

create table if not exists public.shared_views (
  owner_id   uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.shared_access (
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  viewer_email text not null check (viewer_email = lower(viewer_email)),
  created_at   timestamptz not null default now(),
  primary key (owner_id, viewer_email)
);

alter table public.shared_views  enable row level security;
alter table public.shared_access enable row level security;

-- Vitrine: você grava a sua; a convidada só lê a de quem a convidou
drop policy if exists "vitrine: dona grava"       on public.shared_views;
drop policy if exists "vitrine: convidada le"     on public.shared_views;
create policy "vitrine: dona grava" on public.shared_views for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "vitrine: convidada le" on public.shared_views for select
  using (exists (select 1 from public.shared_access a
                 where a.owner_id = shared_views.owner_id
                   and a.viewer_email = lower(auth.jwt() ->> 'email')));

-- Convites: você gerencia os seus; a convidada só enxerga o convite dela (para o app saber de quem é a vitrine)
drop policy if exists "convite: dona gerencia"    on public.shared_access;
drop policy if exists "convite: convidada ve"     on public.shared_access;
create policy "convite: dona gerencia" on public.shared_access for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "convite: convidada ve" on public.shared_access for select
  using (viewer_email = lower(auth.jwt() ->> 'email'));

-- Atualização em tempo real da vitrine para quem está vendo
do $$ begin
  alter publication supabase_realtime add table public.shared_views;
exception when duplicate_object then null; end $$;
