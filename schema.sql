-- Run once in the Supabase SQL Editor. Transactional: failures roll back the setup.
begin;

create table public.care_circles (
  id uuid primary key default gen_random_uuid(),
  elder_name text not null check (length(trim(elder_name)) between 1 and 100),
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.circle_members (
  circle_id uuid not null references public.care_circles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);
create index circle_members_user on public.circle_members(user_id);
create table public.care_entries (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.care_circles(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  caregiver text not null check (length(trim(caregiver)) between 1 and 100),
  type text not null check (type in ('medicine', 'meal', 'vitals', 'appointment', 'note')),
  title text not null check (length(trim(title)) between 1 and 300),
  note text not null default '' check (length(note) <= 4000),
  entry_date date not null,
  entry_time time not null check (entry_time < time '24:00:00'),
  created_at timestamptz not null default now(),
  source_id text check (length(source_id) between 1 and 100),
  unique(circle_id, source_id)
);
create index care_entries_circle_date on public.care_entries(circle_id, entry_date desc, entry_time desc);

-- Invitations are not exposed through the public Data API.
create schema if not exists sevalog_private;
revoke all on schema sevalog_private from public, anon, authenticated;
create table sevalog_private.invites (
  circle_id uuid primary key references public.care_circles(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  expires_at timestamptz not null default now() + interval '7 days'
);
alter table sevalog_private.invites enable row level security;

-- Security-definer helpers only answer membership for the current caller.
create function public.is_circle_member(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.circle_members where circle_id = target and user_id = auth.uid());
$$;
create function public.owns_circle(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.care_circles where id = target and owner_id = auth.uid());
$$;

alter table public.care_circles enable row level security;
alter table public.circle_members enable row level security;
alter table public.care_entries enable row level security;
revoke all on public.care_circles, public.circle_members, public.care_entries from anon, authenticated;
grant select on public.care_circles, public.circle_members, public.care_entries to authenticated;
grant update(elder_name) on public.care_circles to authenticated;
grant insert, delete on public.care_entries to authenticated;

create policy circles_read on public.care_circles for select to authenticated
  using (public.is_circle_member(id));
create policy circles_update on public.care_circles for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy members_read on public.circle_members for select to authenticated
  using (public.is_circle_member(circle_id));
create policy entries_read on public.care_entries for select to authenticated
  using (public.is_circle_member(circle_id));
create policy entries_add on public.care_entries for insert to authenticated
  with check (public.is_circle_member(circle_id) and author_id = auth.uid());
create policy entries_delete on public.care_entries for delete to authenticated
  using (public.is_circle_member(circle_id) and (author_id = auth.uid() or public.owns_circle(circle_id)));

create function public.create_care_circle(elder text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into public.care_circles(elder_name, owner_id) values (trim(elder), auth.uid()) returning id into result;
  insert into public.circle_members(circle_id, user_id) values (result, auth.uid());
  return result;
end;
$$;
create function public.create_circle_invite(target uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  if not public.owns_circle(target) then raise exception 'Only the circle owner can invite members'; end if;
  insert into sevalog_private.invites(circle_id) values (target)
    on conflict(circle_id) do update set token = gen_random_uuid(), expires_at = now() + interval '7 days'
    returning token into result;
  return result;
end;
$$;
create function public.join_care_circle(invitation text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select circle_id into result from sevalog_private.invites
    where token::text = trim(invitation) and expires_at > now() for share;
  if result is null then raise exception 'Invitation is invalid or expired'; end if;
  insert into public.circle_members(circle_id, user_id) values(result, auth.uid()) on conflict do nothing;
  return result;
end;
$$;

revoke all on function public.is_circle_member(uuid), public.owns_circle(uuid),
  public.create_care_circle(text), public.create_circle_invite(uuid), public.join_care_circle(text) from public, anon;
grant execute on function public.is_circle_member(uuid), public.owns_circle(uuid),
  public.create_care_circle(text), public.create_circle_invite(uuid), public.join_care_circle(text) to authenticated;
commit;
