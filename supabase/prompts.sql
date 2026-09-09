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
  kind text not null default 'text',
  prompt_part text not null default 'complete',
  model text not null default '',
  syntax text not null default 'natural_language',
  example_images jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- 已存在旧表时，补上绘画提示词所需字段。
alter table public.prompts add column if not exists kind text not null default 'text';
alter table public.prompts add column if not exists prompt_part text not null default 'complete';
alter table public.prompts add column if not exists model text not null default '';
alter table public.prompts add column if not exists syntax text not null default 'natural_language';
alter table public.prompts add column if not exists example_images jsonb not null default '[]'::jsonb;

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

-- 绘画提示词示例图使用私有 Storage，通过登录后的短时签名 URL 展示。
insert into storage.buckets (id, name, public)
values ('prompt-examples', 'prompt-examples', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Users can view their own prompt example images" on storage.objects;
create policy "Users can view their own prompt example images"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'prompt-examples'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "Users can upload their own prompt example images" on storage.objects;
create policy "Users can upload their own prompt example images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'prompt-examples'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "Users can update their own prompt example images" on storage.objects;
create policy "Users can update their own prompt example images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'prompt-examples'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'prompt-examples'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "Users can delete their own prompt example images" on storage.objects;
create policy "Users can delete their own prompt example images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'prompt-examples'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
