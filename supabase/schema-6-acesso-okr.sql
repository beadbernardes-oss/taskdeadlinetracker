-- Tracker · acesso "Só OKR3": a pessoa vê apenas o painel do OKR3, sem o Gantt.
-- Rode uma vez em: Supabase → SQL Editor → New query → cole tudo → Run. Seguro para rodar de novo.
-- Precisa do schema-4-compartilhar.sql e do schema-5-okr.sql já rodados.
--
-- Como funciona:
--   shared_access.scope = 'all'  → Gantt e OKR3 (como já era; convites antigos continuam assim)
--   shared_access.scope = 'okr3' → só OKR3. A pessoa lê os números direto do okr_feed (o que a planilha envia)
--                                  e o banco não deixa ela ler a vitrine do Gantt (shared_views).

alter table public.shared_access add column if not exists scope text not null default 'all'
  check (scope in ('all', 'okr3'));

-- Vitrine do Gantt: só quem tem acesso completo
drop policy if exists "vitrine: convidada le" on public.shared_views;
create policy "vitrine: convidada le" on public.shared_views for select
  using (exists (select 1 from public.shared_access a
                 where a.owner_id = shared_views.owner_id
                   and a.viewer_email = lower(auth.jwt() ->> 'email')
                   and a.scope = 'all'));

-- OKR3 enviado pela planilha: qualquer pessoa convidada pode ler o da dona que a convidou
drop policy if exists "okr: convidada le" on public.okr_feed;
create policy "okr: convidada le" on public.okr_feed for select
  using (exists (select 1 from public.shared_access a
                 where a.owner_id = okr_feed.user_id
                   and a.viewer_email = lower(auth.jwt() ->> 'email')));
