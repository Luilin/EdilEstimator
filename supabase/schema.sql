-- ============================================================
-- Stimia — schema database SQL (Supabase / Postgres)
--
-- Come usarlo:
--   1. Apri il progetto su https://supabase.com
--   2. Menu "SQL Editor" → "New query"
--   3. Incolla tutto questo file e premi "Run"
--
-- Lo script è idempotente: puoi rieseguirlo senza perdere dati.
-- ============================================================

create table if not exists public.projects (
  id            text primary key,
  owner_id      uuid not null references auth.users (id) on delete cascade,
  owner_email   text,
  name          text not null default '',
  last_modified bigint not null default 0,
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists projects_owner_idx on public.projects (owner_id);
create index if not exists projects_last_modified_idx on public.projects (last_modified desc);

-- Condivisione dei progetti per email (sostituisce sharedWithEmails).
create table if not exists public.project_members (
  project_id text not null references public.projects (id) on delete cascade,
  email      text not null,
  role       text not null default 'editor' check (role in ('viewer', 'editor')),
  created_at timestamptz not null default now(),
  primary key (project_id, email)
);

create index if not exists project_members_email_idx on public.project_members (lower(email));

-- updated_at automatico
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
before update on public.projects
for each row execute function public.touch_updated_at();

-- Verifica appartenenza: SECURITY DEFINER evita la ricorsione delle policy.
create or replace function public.is_project_member(p_project_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.project_members m
    where m.project_id = p_project_id
      and lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

alter table public.projects enable row level security;
alter table public.project_members enable row level security;

-- ------------------------- PROGETTI -------------------------
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select to authenticated
  using (owner_id = auth.uid() or public.is_project_member(id));

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
  for update to authenticated
  using (owner_id = auth.uid() or public.is_project_member(id))
  with check (owner_id = auth.uid() or public.is_project_member(id));

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects
  for delete to authenticated
  using (owner_id = auth.uid());

-- ------------------------- MEMBRI ---------------------------
drop policy if exists members_select on public.project_members;
create policy members_select on public.project_members
  for select to authenticated
  using (
    exists (
      select 1
      from public.projects p
      where p.id = project_id
        and (p.owner_id = auth.uid() or public.is_project_member(p.id))
    )
  );

drop policy if exists members_write on public.project_members;
create policy members_write on public.project_members
  for all to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = auth.uid()
    )
  );
