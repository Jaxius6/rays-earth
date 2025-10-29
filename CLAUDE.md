# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

rays.earth is a real-time, planet-wide visualization of human presence. It displays a dark 3D Earth with glowing presence dots and allows users to send luminous arcs (pings) between locations. The experience is minimal and meditative—no visible UI, just the globe and interactions.

**Stack**: Next.js 14 (App Router), React 18, TypeScript, Three.js, GSAP, Supabase Realtime, Howler.js

## Common Commands

### Development
```bash
npm run dev          # Start dev server on localhost:3000
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
```

### Testing
```bash
npm test             # Run Jest tests once
npm run test:watch   # Run tests in watch mode
```

### Supabase
```bash
# Generate types from database schema (run after schema changes)
npm run supabase:types

# Database operations
supabase db push                    # Push migrations to remote
supabase db reset                   # Reset local database

# Deploy Edge Functions
supabase functions deploy upsert_presence
supabase functions deploy touch_presence
supabase functions deploy set_offline
supabase functions deploy get_recent_presences
supabase functions deploy emit_ping
supabase functions deploy prune_old

# View Edge Function logs
supabase functions logs <function-name> --tail
```

## Architecture

### Component Hierarchy
```
app/page.tsx (main orchestrator)
├── GlobeCanvas.tsx          # Pure Three.js scene with Earth sphere
├── PresenceLayer.tsx        # Renders presence dots on globe
├── PingEngine.tsx           # Handles arc animations between points
├── AudioGate.tsx            # Mobile audio unlock (iOS/Android requirement)
└── AriaAnnouncer.tsx        # Screen reader announcements
```

### Key Libraries
- **lib/realtime.ts**: Supabase Realtime subscriptions (presences table + pings broadcast channel)
- **lib/geo.ts**: Coordinate rounding (privacy), haversine distance, lat/lng to 3D vector conversion, decay calculations
- **lib/audio.ts**: Howler.js wrapper for ping/ripple sounds
- **lib/supabase-browser.ts**: Supabase client + RPC function wrappers

### Data Flow

1. **User opens page** → `app/page.tsx` requests geolocation
2. **Coordinates rounded** to 2 decimals (~1-3km precision) via `roundCoordinates()`
3. **Presence upserted** via `upsertPresence()` Edge Function
4. **Realtime subscriptions** established:
   - Postgres changes on `presences` table (INSERT/UPDATE/DELETE)
   - Broadcast channel `pings` for ping events
5. **Globe renders** in `GlobeCanvas.tsx` (Three.js scene with Earth sphere + custom greyscale shader)
6. **Presence dots** rendered by `PresenceLayer.tsx` using instanced meshes
7. **User clicks dot** → `emitPing()` Edge Function → arc animates in `PingEngine.tsx`
8. **Heartbeat** every 20s via `touchPresence()` to keep presence alive
9. **On close/blur** → `setOffline()` marks presence as offline
10. **Decay system** fades offline presences over 24 hours

### Coordinate System
- **Database**: Lat/Lng in degrees, rounded to 2 decimals
- **Three.js**: Cartesian (x, y, z) coordinates
- **Conversion**: `latLngToVector3()` in lib/geo.ts converts lat/lng to 3D position on sphere of radius 100

### Decay & Brightness
Presence dots fade over 24 hours after going offline. Formula in `calculateDecay()`:
- Online users: brightness = 1.0
- Offline users: brightness = 1.0 → 0.0 over 24 hours (linear decay)
- Fully faded (brightness ≤ 0): removed from globe

### Globe Rendering Details
- **Custom Three.js implementation**: No external globe libraries used
- **Texture**: Earth map loaded from CDN, converted to greyscale via fragment shader
- **High-quality rendering**:
  - Sphere geometry: 128x128 polygons for smooth surface
  - Pixel ratio: up to 3x for sharp rendering
  - ACES Filmic tone mapping for better color
  - StandardMaterial with roughness/metalness for realistic lighting
- **Shader**: Custom GLSL grayscale conversion with brightness boost:
  ```glsl
  float grey = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  diffuseColor *= vec4(vec3(grey * 3.5), sampledDiffuseColor.a);
  ```
- **Enhanced starfield**: 5000 stars with varied sizes, subtle color variation (blue/white/orange), additive blending for glow

### Supabase Edge Functions (Deno)
Located in `supabase/functions/`:
- **upsert_presence**: Create or update user presence with rounded coordinates
- **touch_presence**: Update last_active timestamp (heartbeat)
- **set_offline**: Mark presence as offline
- **get_recent_presences**: Fetch recent presences (includes faded offline users)
- **emit_ping**: Broadcast ping event via Realtime channel
- **prune_old**: Delete old offline presences (>24h) and pings (>48h) - run via cron

All functions use service role key for RLS bypass. TypeScript errors in these files are expected (Deno imports from URLs).

### Arc Animation System
See **ARCS.md** for complete documentation. Quick overview:
- **Phase 1 (0-5s)**: Drawing animation with marching ants
- **Phase 2 (5-10s)**: Glow and pulse celebration
- **Phase 3 (10s+)**: Fade to white over 10 seconds
- **Phase 4 (24h)**: Slow fade to 0% opacity over 24 hours
- Each arc has main tube, glow tube, and 40 particle "ants"
- Ripple effects at start/end with warping animation

### Database Schema
Two tables (`supabase/sql/01_schema.sql`):
- **presences**: id, lat, lng, last_active, is_online, created_at
- **pings**: id, from_lat, from_lng, to_lat, to_lng, created_at

RLS policies (`supabase/sql/02_policies.sql`): All direct table access denied. Only Edge Functions can write. Clients read via RPC functions.

### Realtime Setup
- **Postgres Replication**: Enable replication for `presences` table in Supabase dashboard
- **Broadcast Channel**: `pings` channel created automatically on first use
- **Subscriptions**: Client subscribes to both in `lib/realtime.ts`

### Audio System
- **Files**: `/public/audio/ping.wav` and `/public/audio/ripple.wav` (placeholder WAVs in repo)
- **Unlock**: `AudioGate.tsx` handles mobile gesture requirement (iOS/Android policy)
- **Playback**: Howler.js via `lib/audio.ts`

### Demo Mode
30 demo presences hardcoded in `app/page.tsx` (10 online, 20 offline at various fade stages). Used for testing without Supabase.

## Development Workflow

### Testing Changes Locally
1. Modify code
2. `npm run dev` to see changes
3. `npm test` to verify unit tests pass
4. Check browser console for errors

### Demo Mode
100 demo presences hardcoded in `app/page.tsx`:
- 30 active presences (online, glowing, breathing)
- 70 dormant presences (offline, fading at various stages)
- Used for testing without Supabase or when geolocation fails

### Making Database Changes
1. Edit `supabase/sql/*.sql` files
2. Run `supabase db push`
3. Run `npm run supabase:types` to regenerate TypeScript types

### Deploying Edge Functions
After modifying function code in `supabase/functions/`:
```bash
supabase functions deploy <function-name>
```

### Path Aliases
```typescript
@/*             # Project root
@/components/*  # ./components
@/lib/*         # ./lib
@/app/*         # ./app
```

## Important Gotchas

### Three.js Scene Setup
- Camera MUST be added to scene: `scene.add(camera)` (see GlobeCanvas.tsx:40)
- Individual meshes for each presence dot (not instanced) to support per-dot materials and animations
- Active dots use MeshStandardMaterial with emissive glow and breathing animation
- Offline dots use MeshBasicMaterial with static opacity

### Coordinate Precision
- Always round coordinates to 2 decimals before storing (privacy requirement)
- Use `roundCoordinates()` from lib/geo.ts

### Realtime Updates
- Throttle updates to 100ms (10 Hz) to prevent performance issues
- Use `throttle()` from lib/realtime.ts

### Mobile Considerations
- Audio requires user gesture to unlock on iOS/Android—handled by AudioGate.tsx
- Touch rotate enabled, zoom disabled (desktop mouse wheel zoom: 200-450 units)
- Camera distance adjusted for mobile: 400 vs 300 (see GlobeCanvas.tsx:38) - further away for better view
- Drag rotation speed: 0.002 for heavy, massive globe feel

### Supabase Edge Functions
- TypeScript errors are expected (Deno imports from URLs)
- Functions run in Deno runtime, not Node.js
- Always use service role key for database operations (bypasses RLS)

### Testing Without Supabase
Enable demo mode in app/page.tsx to use hardcoded presences (useful for offline development)

## Performance Notes

### Optimizations Applied
- Instanced meshes for presence dots (avoid per-dot overhead)
- Throttled realtime updates (10 Hz client-side)
- Lazy-loaded Three.js scene after first paint
- Pixel ratio capped at 2x
- Greyscale shader applied at runtime (no need to pre-process textures)

### Known Limitations
- 50-60 FPS target on mid-range phones
- Reduced effects on low-end devices (check `navigator.hardwareConcurrency`)
- Realtime connections limited by Supabase tier (200 concurrent on free tier)

## Privacy & Security

- Coordinates rounded to 2 decimal places (~1-3km precision)
- No cookies or client-side tracking
- No PII stored—only rounded lat/lng and timestamps
- Row Level Security enforces read-only access via RPC functions
- All direct table writes blocked—only Edge Functions can write

## Troubleshooting

### "Globe not rendering"
- Check Three.js camera is added to scene
- Verify textures loading from CDN (check Network tab)
- Check browser console for WebGL errors

### "Auto-center not working"
- Centering happens only when geolocation succeeds
- Formula: `targetY = -lng * (PI/180)`, `targetX = -lat * (PI/180)`
- Check console logs for "Centering on user location" message
- Animation takes 2.5 seconds to complete

### "Active dots not glowing"
- Dots use MeshStandardMaterial with emissive property
- Breathing animation runs in separate RAF loop (PresenceLayer.tsx)
- EmissiveIntensity oscillates: `1.5 + breathe * 0.8` where breathe is `0.85 + sin(time * 1.5) * 0.15`

### "Hover effects affecting all dots"
- Only hovered dot should change (check hoveredId state)
- Hover sound plays once per hover (1200Hz sine, 0.015 gain, 120ms duration)
- Breathing animation is global but should not affect hover scale

### "Realtime not updating"
- Verify replication enabled for `presences` table
- Check Edge Functions deployed and accessible
- Confirm NEXT_PUBLIC_SUPABASE_ANON_KEY set correctly

### "Audio not playing on mobile"
- AudioGate component must render—checks for user gesture
- Verify audio files exist at `/public/audio/*.wav`
- Check browser console for Howler.js errors

### "TypeScript errors in Edge Functions"
- Expected—Deno imports from URLs not recognized by TypeScript
- Functions work correctly when deployed
- Add `// @ts-ignore` if needed for IDE

## Useful SQL Queries

```sql
-- Check presence count
SELECT COUNT(*) FROM presences WHERE is_online = true;

-- Find old data to be pruned
SELECT COUNT(*) FROM presences WHERE is_online = false AND last_active < NOW() - INTERVAL '24 hours';
SELECT COUNT(*) FROM pings WHERE created_at < NOW() - INTERVAL '48 hours';

-- Monitor database size
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```
