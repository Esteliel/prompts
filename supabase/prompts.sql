-- 在 Supabase Dashboard 的 SQL Editor 中执行一次。
-- 执行前请在 Authentication > URL Configuration 中加入：
-- https://esteliel.github.io/prompts/

create table if not exists public.prompts (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text not null default '未分类',
  tags text[] not null default '{}',
  description text not null default '',
  content text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists prompts_user_id_idx on public.prompts (user_id);

alter table public.prompts enable row level security;

revoke all on public.prompts from anon;
grant select, insert, update, delete on public.prompts to authenticated;

drop policy if exists "Users can view their own prompts" on public.prompts;
create policy "Users can view their own prompts"
  on public.prompts for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own prompts" on public.prompts;
create policy "Users can create their own prompts"
  on public.prompts for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own prompts" on public.prompts;
create policy "Users can update their own prompts"
  on public.prompts for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own prompts" on public.prompts;
create policy "Users can delete their own prompts"
  on public.prompts for delete
  to authenticated
  using ((select auth.uid()) = user_id);
