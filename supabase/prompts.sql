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

-- 收藏来源用于跨浏览器保留收藏状态；旧记录保持兼容。
alter table public.prompts add column if not exists source_id text not null default '';

-- 公开内容为用户主动发布的快照，个人 prompts 表的 RLS 不变。
create table if not exists public.shared_prompts (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  image_paths text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, id) references public.prompts(user_id, id) on delete cascade
);
create index if not exists shared_prompts_updated_idx on public.shared_prompts (updated_at desc);
alter table public.shared_prompts enable row level security;
grant select on public.shared_prompts to anon, authenticated;
grant insert, update, delete on public.shared_prompts to authenticated;
drop policy if exists "Anyone can read shared prompts" on public.shared_prompts;
create policy "Anyone can read shared prompts" on public.shared_prompts for select to anon, authenticated using (true);
drop policy if exists "Owners can publish prompts" on public.shared_prompts;
create policy "Owners can publish prompts" on public.shared_prompts for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Owners can update shared prompts" on public.shared_prompts;
create policy "Owners can update shared prompts" on public.shared_prompts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Owners can retract shared prompts" on public.shared_prompts;
create policy "Owners can retract shared prompts" on public.shared_prompts for delete to authenticated using ((select auth.uid()) = user_id);

-- 仅显式分享后的图片副本进入此公开桶，原 prompt-examples 桶仍然私有。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shared-examples', 'shared-examples', true, 8388608, array['image/jpeg','image/png','image/webp','image/gif','image/avif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Owners manage shared image copies" on storage.objects;
create policy "Owners manage shared image copies" on storage.objects for all to authenticated
using (bucket_id = 'shared-examples' and (storage.foldername(name))[1] = (select auth.uid()::text))
with check (bucket_id = 'shared-examples' and (storage.foldername(name))[1] = (select auth.uid()::text));
