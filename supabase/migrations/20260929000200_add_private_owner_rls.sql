begin;

create or replace function private.user_owns_project(target_project_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = target_project_id
      and p.owner_id = (select auth.uid())
  );
$$;

create or replace function private.user_owns_run(target_run_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.optimization_runs r
    join public.projects p on p.id = r.project_id
    where r.id = target_run_id
      and p.owner_id = (select auth.uid())
  );
$$;

revoke all on function private.user_owns_project(uuid), private.user_owns_run(uuid) from public, anon;
grant usage on schema private to authenticated, service_role;
grant execute on function private.user_owns_project(uuid), private.user_owns_run(uuid) to authenticated, service_role;

grant usage on schema public to authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name, organization, rank_or_appointment) on table public.profiles to authenticated;

grant select on table public.projects to authenticated;
grant insert (project_code, owner_id, name, description, mode, status, current_step, draft, draft_revision, archived_at)
  on table public.projects to authenticated;
grant update (name, description, mode, status, current_step, draft, draft_revision, latest_run_id, archived_at)
  on table public.projects to authenticated;

grant select on table public.optimization_runs, public.candidate_designs, public.artifacts, public.audit_events to authenticated;

grant all privileges on table public.profiles, public.projects, public.optimization_runs, public.candidate_designs, public.artifacts, public.audit_events to service_role;
grant all privileges on sequence public.audit_events_id_seq to service_role;

create policy profiles_select_own
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) is not null and user_id = (select auth.uid()));

create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) is not null and user_id = (select auth.uid()))
  with check ((select auth.uid()) is not null and user_id = (select auth.uid()));

create policy projects_select_own
  on public.projects for select
  to authenticated
  using ((select auth.uid()) is not null and owner_id = (select auth.uid()));

create policy projects_insert_own
  on public.projects for insert
  to authenticated
  with check ((select auth.uid()) is not null and owner_id = (select auth.uid()));

create policy projects_update_own
  on public.projects for update
  to authenticated
  using ((select auth.uid()) is not null and owner_id = (select auth.uid()))
  with check ((select auth.uid()) is not null and owner_id = (select auth.uid()));

create policy optimization_runs_select_owned_project
  on public.optimization_runs for select
  to authenticated
  using (private.user_owns_project(project_id));

create policy candidate_designs_select_owned_run
  on public.candidate_designs for select
  to authenticated
  using (private.user_owns_run(run_id));

create policy artifacts_select_owned_run
  on public.artifacts for select
  to authenticated
  using (private.user_owns_run(run_id));

create policy audit_events_select_owned_project
  on public.audit_events for select
  to authenticated
  using (
    (project_id is not null and private.user_owns_project(project_id))
    or (project_id is null and actor_id = (select auth.uid()))
  );

comment on function private.user_owns_project(uuid) is 'RLS helper: true only when the JWT subject owns the project.';
comment on function private.user_owns_run(uuid) is 'RLS helper: true only when the JWT subject owns the run parent project.';

commit;
