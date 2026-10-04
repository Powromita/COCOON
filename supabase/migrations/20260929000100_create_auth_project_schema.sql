begin;

create schema if not exists private;
revoke all on schema private from public;

do $$ begin
  create type public.application_role as enum ('operator', 'engineer', 'admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.clearance_status as enum ('pending', 'approved', 'suspended', 'rejected');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.project_mode as enum ('new_shelter', 'existing_shelter', 'engineering_optimization', 'reference_benchmark');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.project_status as enum ('draft', 'ready', 'running', 'completed', 'failed', 'archived');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.run_status as enum ('queued', 'running', 'completed', 'failed', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.artifact_backend as enum ('filesystem', 'supabase_storage');
exception when duplicate_object then null;
end $$;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  organization text,
  rank_or_appointment text,
  application_role public.application_role not null default 'operator',
  clearance_status public.clearance_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (display_name is null or char_length(display_name) between 1 and 160),
  constraint profiles_organization_length check (organization is null or char_length(organization) <= 200),
  constraint profiles_rank_length check (rank_or_appointment is null or char_length(rank_or_appointment) <= 160)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  project_code text not null unique,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  mode public.project_mode not null default 'new_shelter',
  status public.project_status not null default 'draft',
  current_step smallint not null default 1,
  draft jsonb not null default '{}'::jsonb,
  draft_revision bigint not null default 0,
  latest_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint projects_code_format check (project_code ~ '^prj_[A-Za-z0-9_-]+$'),
  constraint projects_name_length check (char_length(btrim(name)) between 1 and 200),
  constraint projects_description_length check (description is null or char_length(description) <= 4000),
  constraint projects_step_range check (current_step between 1 and 5),
  constraint projects_draft_object check (jsonb_typeof(draft) = 'object'),
  constraint projects_revision_nonnegative check (draft_revision >= 0),
  constraint projects_archive_state check ((status = 'archived') = (archived_at is not null))
);

create table public.optimization_runs (
  id uuid primary key default gen_random_uuid(),
  optimization_code text not null unique,
  project_id uuid not null references public.projects(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  status public.run_status not null default 'queued',
  phase text,
  phase_message text,
  input_snapshot jsonb not null,
  candidate_count integer not null,
  seed integer not null default 42,
  recommended_design_code text,
  validation_state text,
  result_summary jsonb,
  error jsonb,
  artifact_prefix text,
  idempotency_key_hash text,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint optimization_runs_code_format check (optimization_code ~ '^opt_[A-Za-z0-9_-]+$'),
  constraint optimization_runs_candidate_count check (candidate_count between 1 and 500),
  constraint optimization_runs_input_object check (jsonb_typeof(input_snapshot) = 'object'),
  constraint optimization_runs_result_object check (result_summary is null or jsonb_typeof(result_summary) = 'object'),
  constraint optimization_runs_error_object check (error is null or jsonb_typeof(error) = 'object'),
  constraint optimization_runs_design_format check (recommended_design_code is null or recommended_design_code ~ '^des_[A-Za-z0-9_-]+$'),
  constraint optimization_runs_artifact_prefix check (artifact_prefix is null or (artifact_prefix <> '' and artifact_prefix !~ '(^|[\\/])\.\.([\\/]|$)')),
  constraint optimization_runs_idempotency_hash check (idempotency_key_hash is null or idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  constraint optimization_runs_time_order check (
    (started_at is null or started_at >= queued_at) and
    (completed_at is null or (started_at is not null and completed_at >= started_at))
  ),
  constraint optimization_runs_terminal_time check ((status in ('completed', 'failed', 'cancelled')) = (completed_at is not null))
);

alter table public.optimization_runs
  add constraint optimization_runs_id_project_uq unique (id, project_id);

alter table public.projects
  add constraint projects_latest_run_fk
  foreign key (latest_run_id, id) references public.optimization_runs(id, project_id) on delete set null (latest_run_id);

create table public.candidate_designs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.optimization_runs(id) on delete cascade,
  design_code text not null,
  revision_code text,
  rank integer,
  status text not null,
  is_recommended boolean not null default false,
  picked_as text[] not null default '{}',
  objectives jsonb not null default '{}'::jsonb,
  design_summary jsonb not null default '{}'::jsonb,
  building_artifact_path text,
  created_at timestamptz not null default now(),
  unique (run_id, design_code),
  constraint candidate_designs_code_format check (design_code ~ '^des_[A-Za-z0-9_-]+$'),
  constraint candidate_designs_rank_positive check (rank is null or rank > 0),
  constraint candidate_designs_objectives_object check (jsonb_typeof(objectives) = 'object'),
  constraint candidate_designs_summary_object check (jsonb_typeof(design_summary) = 'object'),
  constraint candidate_designs_artifact_path check (building_artifact_path is null or (building_artifact_path <> '' and building_artifact_path !~ '(^|[\\/])\.\.([\\/]|$)'))
);

create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.optimization_runs(id) on delete cascade,
  kind text not null,
  backend public.artifact_backend not null default 'filesystem',
  bucket text,
  object_path text not null,
  content_type text,
  byte_size bigint,
  checksum_sha256 text,
  created_at timestamptz not null default now(),
  retention_until timestamptz,
  unique (run_id, kind, object_path),
  constraint artifacts_kind_length check (char_length(btrim(kind)) between 1 and 80),
  constraint artifacts_path_safe check (object_path <> '' and object_path !~ '(^|[\\/])\.\.([\\/]|$)'),
  constraint artifacts_backend_location check ((backend = 'filesystem' and bucket is null) or (backend = 'supabase_storage' and bucket is not null)),
  constraint artifacts_byte_size check (byte_size is null or byte_size >= 0),
  constraint artifacts_checksum check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$')
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  run_id uuid references public.optimization_runs(id) on delete set null,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  request_id text,
  source text not null default 'api',
  created_at timestamptz not null default now(),
  constraint audit_events_type_length check (char_length(btrim(event_type)) between 1 and 120),
  constraint audit_events_data_object check (jsonb_typeof(event_data) = 'object'),
  constraint audit_events_request_id_length check (request_id is null or char_length(request_id) <= 160),
  constraint audit_events_source_length check (char_length(btrim(source)) between 1 and 80)
);

create unique index optimization_runs_project_idempotency_uq
  on public.optimization_runs(project_id, idempotency_key_hash)
  where idempotency_key_hash is not null;
create unique index candidate_designs_one_recommendation_uq
  on public.candidate_designs(run_id)
  where is_recommended;
create index projects_owner_updated_idx on public.projects(owner_id, updated_at desc);
create index optimization_runs_project_created_idx on public.optimization_runs(project_id, created_at desc);
create index optimization_runs_requested_by_idx on public.optimization_runs(requested_by, created_at desc);
create index candidate_designs_run_idx on public.candidate_designs(run_id);
create index artifacts_run_idx on public.artifacts(run_id);
create index audit_events_actor_created_idx on public.audit_events(actor_id, created_at desc);
create index audit_events_project_created_idx on public.audit_events(project_id, created_at desc);
create index audit_events_run_created_idx on public.audit_events(run_id, created_at desc);

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, display_name, organization)
  values (
    new.id,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'organization', '')), '')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace function private.guard_project_ownership()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id or new.project_code is distinct from old.project_code or new.created_at is distinct from old.created_at then
    raise exception 'project identity and ownership are immutable' using errcode = '22000';
  end if;
  return new;
end;
$$;

create or replace function private.guard_run_snapshot()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.optimization_code is distinct from old.optimization_code or new.project_id is distinct from old.project_id or new.requested_by is distinct from old.requested_by or new.input_snapshot is distinct from old.input_snapshot or new.candidate_count is distinct from old.candidate_count or new.seed is distinct from old.seed or new.created_at is distinct from old.created_at then
    raise exception 'run identity and input snapshot are immutable' using errcode = '22000';
  end if;
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function private.set_updated_at();
create trigger projects_set_updated_at before update on public.projects for each row execute function private.set_updated_at();
create trigger optimization_runs_set_updated_at before update on public.optimization_runs for each row execute function private.set_updated_at();
create trigger projects_guard_ownership before update on public.projects for each row execute function private.guard_project_ownership();
create trigger optimization_runs_guard_snapshot before update on public.optimization_runs for each row execute function private.guard_run_snapshot();
create trigger auth_user_create_profile after insert on auth.users for each row execute function private.create_profile_for_new_user();

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.optimization_runs enable row level security;
alter table public.candidate_designs enable row level security;
alter table public.artifacts enable row level security;
alter table public.audit_events enable row level security;

revoke all on table public.profiles, public.projects, public.optimization_runs, public.candidate_designs, public.artifacts, public.audit_events from anon, authenticated;
revoke all on sequence public.audit_events_id_seq from anon, authenticated;

grant usage on schema private to service_role;
grant execute on function private.set_updated_at(), private.create_profile_for_new_user(), private.guard_project_ownership(), private.guard_run_snapshot() to service_role;

comment on table public.projects is 'Private COCOON project metadata and mutable configurator draft; owner_id is immutable.';
comment on table public.optimization_runs is 'Immutable submitted input plus mutable lifecycle/result metadata for one COCOON pipeline run.';
comment on table public.candidate_designs is 'Compact candidate summaries; complete BuildingModel data remains an authorized artifact.';
comment on table public.artifacts is 'Authorized metadata for filesystem or private Supabase Storage objects.';
comment on table public.audit_events is 'Append-oriented security and project lifecycle audit metadata.';

commit;
