-- rays.earth database schema
-- Minimal tables for tracking user presences and ping events

-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- Presences: users currently or previously seen on the globe
create table if not exists public.presences (
  id uuid primary key default gen_random_uuid(),
  lat numeric(10, 2) not null,
  lng numeric(10, 2) not null,
  last_active timestamptz not null default now(),
  is_online boolean not null default true,
  created_at timestamptz not null default now(),
  
  -- Constraint to prevent duplicate coordinates at the same precision
  constraint valid_latitude check (lat >= -90 and lat <= 90),
  constraint valid_longitude check (lng >= -180 and lng <= 180)
);

-- Pings: ephemeral ping events (kept 24-48h, then pruned by cron)
create table if not exists public.pings (
  id uuid primary key default gen_random_uuid(),
  from_lat numeric(10, 2) not null,
  from_lng numeric(10, 2) not null,
  to_lat numeric(10, 2) not null,
  to_lng numeric(10, 2) not null,
  created_at timestamptz not null default now(),
  
  constraint valid_from_latitude check (from_lat >= -90 and from_lat <= 90),
  constraint valid_from_longitude check (from_lng >= -180 and from_lng <= 180),
  constraint valid_to_latitude check (to_lat >= -90 and to_lat <= 90),
  constraint valid_to_longitude check (to_lng >= -180 and to_lng <= 180)
);

-- Add helpful comments
comment on table public.presences is 'Tracks user presence on the globe with coordinates rounded to 2 decimals (~1-3km precision)';
comment on table public.pings is 'Ephemeral ping events between users, auto-pruned after 48 hours';