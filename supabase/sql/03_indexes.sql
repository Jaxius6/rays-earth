-- Performance indexes for rays.earth

-- Presences indexes
create index if not exists presences_last_active_idx 
  on public.presences (last_active desc)
  where is_online = true or last_active > now() - interval '24 hours';

create index if not exists presences_is_online_idx 
  on public.presences (is_online)
  where is_online = true;

create index if not exists presences_coordinates_idx 
  on public.presences (lat, lng);

-- Pings indexes
create index if not exists pings_created_at_idx 
  on public.pings (created_at desc)
  where created_at > now() - interval '48 hours';

-- Add index for spatial queries if needed
create index if not exists pings_coordinates_idx 
  on public.pings (from_lat, from_lng, to_lat, to_lng);