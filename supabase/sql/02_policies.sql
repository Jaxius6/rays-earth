-- Row Level Security (RLS) policies for rays.earth
-- Tight security: all operations via RPC functions only

-- Enable RLS on both tables
alter table public.presences enable row level security;
alter table public.pings enable row level security;

-- Presences policies

-- Allow anonymous users to SELECT recent presences (within 24 hours)
create policy "Allow select recent presences"
  on public.presences
  for select
  using (
    last_active > now() - interval '24 hours'
  );

-- No direct INSERT - must use upsert_presence RPC function
create policy "No direct insert on presences"
  on public.presences
  for insert
  with check (false);

-- No direct UPDATE - must use touch_presence or set_offline RPC functions
create policy "No direct update on presences"
  on public.presences
  for update
  using (false);

-- No direct DELETE - only service role via prune_old function
create policy "No direct delete on presences"
  on public.presences
  for delete
  using (false);

-- Pings policies

-- Allow anonymous users to SELECT recent pings (within 48 hours)
create policy "Allow select recent pings"
  on public.pings
  for select
  using (
    created_at > now() - interval '48 hours'
  );

-- No direct INSERT - must use emit_ping RPC function
create policy "No direct insert on pings"
  on public.pings
  for insert
  with check (false);

-- No UPDATE allowed on pings (immutable)
create policy "No update on pings"
  on public.pings
  for update
  using (false);

-- No direct DELETE - only service role via prune_old function
create policy "No direct delete on pings"
  on public.pings
  for delete
  using (false);

-- Grant minimal permissions to anon role
grant usage on schema public to anon;
grant select on public.presences to anon;
grant select on public.pings to anon;

-- Service role has full access (used by Edge Functions)
-- This is already granted by default but explicitly stated here for clarity
grant all on public.presences to service_role;
grant all on public.pings to service_role;