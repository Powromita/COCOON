begin;

create extension if not exists pgtap with schema extensions;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'user-a@example.test', '', now(), '{}', '{"display_name":"User A"}', now(), now()),
  ('20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'user-b@example.test', '', now(), '{}', '{"display_name":"User B"}', now(), now());

insert into public.projects (id, project_code, owner_id, name, mode, draft)
values
  ('a0000000-0000-0000-0000-000000000001', 'prj_user_a', '10000000-0000-0000-0000-000000000001', 'User A project', 'new_shelter', '{}'),
  ('b0000000-0000-0000-0000-000000000002', 'prj_user_b', '20000000-0000-0000-0000-000000000002', 'User B project', 'new_shelter', '{}');

insert into public.optimization_runs (id, optimization_code, project_id, requested_by, input_snapshot, candidate_count)
values
  ('a1000000-0000-0000-0000-000000000001', 'opt_user_a', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '{}', 10),
  ('b1000000-0000-0000-0000-000000000002', 'opt_user_b', 'b0000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '{}', 10);

insert into public.candidate_designs (run_id, design_code, status)
values
  ('a1000000-0000-0000-0000-000000000001', 'des_user_a', 'selected'),
  ('b1000000-0000-0000-0000-000000000002', 'des_user_b', 'selected');

insert into public.artifacts (run_id, kind, object_path)
values
  ('a1000000-0000-0000-0000-000000000001', 'report', 'user-a/report.json'),
  ('b1000000-0000-0000-0000-000000000002', 'report', 'user-b/report.json');

insert into public.audit_events (actor_id, project_id, run_id, event_type)
values
  ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'run.created'),
  ('20000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 'run.created');

select plan(21);
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$select * from public.profiles$$, '42501', null, 'Anonymous users cannot read profiles');
select throws_ok($$select * from public.projects$$, '42501', null, 'Anonymous users cannot read projects');
select throws_ok($$select * from public.optimization_runs$$, '42501', null, 'Anonymous users cannot read runs');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

select results_eq('select user_id from public.profiles order by user_id', array['10000000-0000-0000-0000-000000000001'::uuid], 'User A sees only own profile');
select results_eq('select project_code from public.projects order by project_code', array['prj_user_a'::text], 'User A sees only own project');
select results_eq('select optimization_code from public.optimization_runs order by optimization_code', array['opt_user_a'::text], 'User A sees only own run');
select results_eq('select design_code from public.candidate_designs order by design_code', array['des_user_a'::text], 'User A sees only own candidate');
select results_eq('select object_path from public.artifacts order by object_path', array['user-a/report.json'::text], 'User A sees only own artifact');
select is((select count(*)::integer from public.audit_events), 1, 'User A sees only own project audit event');
select results_eq($$update public.projects set name = 'A updated' where project_code = 'prj_user_a' returning project_code$$, array['prj_user_a'::text], 'User A can update own project');
select is_empty($$update public.projects set name = 'intrusion' where project_code = 'prj_user_b' returning project_code$$, 'User A cannot update User B project');
select lives_ok($$insert into public.projects (project_code, owner_id, name) values ('prj_user_a_second', '10000000-0000-0000-0000-000000000001', 'Second A project')$$, 'User A can create own project');
select throws_ok($$insert into public.projects (project_code, owner_id, name) values ('prj_claim_b', '20000000-0000-0000-0000-000000000002', 'Claim B')$$, '42501', null, 'User A cannot create a project for User B');
select throws_ok($$delete from public.projects where project_code = 'prj_user_a'$$, '42501', null, 'Direct project deletion is denied');
select lives_ok($$update public.profiles set display_name = 'User A updated' where user_id = '10000000-0000-0000-0000-000000000001'$$, 'User A can update safe profile fields');
select throws_ok($$update public.profiles set application_role = 'admin' where user_id = '10000000-0000-0000-0000-000000000001'$$, '42501', null, 'User A cannot elevate own role');
select throws_ok($$insert into public.optimization_runs (optimization_code, project_id, requested_by, input_snapshot, candidate_count) values ('opt_direct', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '{}', 1)$$, '42501', null, 'Users cannot insert runs directly');
select throws_ok($$insert into public.candidate_designs (run_id, design_code, status) values ('a1000000-0000-0000-0000-000000000001', 'des_direct', 'selected')$$, '42501', null, 'Users cannot insert candidates directly');
select throws_ok($$insert into public.artifacts (run_id, kind, object_path) values ('a1000000-0000-0000-0000-000000000001', 'report', 'direct.json')$$, '42501', null, 'Users cannot insert artifacts directly');
select throws_ok($$insert into public.audit_events (actor_id, event_type) values ('10000000-0000-0000-0000-000000000001', 'forged')$$, '42501', null, 'Users cannot forge audit events');
select is(private.user_owns_project('b0000000-0000-0000-0000-000000000002'), false, 'Ownership helper rejects User B project');

select * from finish();
rollback;
