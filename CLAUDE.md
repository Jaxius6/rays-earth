# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

rays.earth is a real-time, planet-wide visualization of human presence. It displays a dark 3D Earth with glowing presence dots and allows users to send luminous arcs (pings) between locations. The experience is minimal and meditative—no visible UI, just the globe and interactions.

**Stack**: Next.js 14 (App Router), React 18, TypeScript, Three.js, GSAP, Supabase Realtime, Web Audio API

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
- **lib/audio.ts**: Web Audio API procedural sound generation (hover woosh, arc hum, connection bong)
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
- **Texture**: Earth map (Blue Marble 8K) + topology bump map loaded from CDN, converted to greyscale via fragment shader
- **High-quality rendering**:
  - Sphere geometry: 512x512 polygons (MAXIMUM RESOLUTION) for perfectly smooth surface
  - Pixel ratio: up to 3x for sharp rendering
  - ACES Filmic tone mapping with 1.2 exposure for better color
  - StandardMaterial with roughness 0.9, metalness 0.1, bump mapping for surface detail
  - Anisotropic filtering at maximum (texture sharpness)
- **Shader**: Custom GLSL grayscale conversion with gamma correction and brightness boost:
  ```glsl
  float grey = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  grey = pow(grey, 0.85) * 4.0; // Gamma correction + 4x boost
  diffuseColor *= vec4(vec3(grey), sampledDiffuseColor.a);
  ```
- **Enhanced starfield**: 10,000 stars positioned 400-800 units away, varied sizes (0.5-3.5), subtle color variation (5% blue-white, 5% warm orange, 90% white), additive blending for glow, size attenuation with distance

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
Arcs use a clock wipe drawing effect implemented via Three.js `setDrawRange()`:
- **Phase 1 (0-3s)**: Clock wipe drawing effect - tube progressively reveals along arc path using vertex draw range
- **Phase 2 (3-8s)**: Glow phase - pulsating glow tube appears (0.6 base opacity with sine wave pulse)
- **Phase 3 (8-18s)**: Fade to white - arc transitions from orange (#ffb300) to white (#ffffff) and opacity drops to 10%
- **Phase 4 (18s-24h)**: Long decay - arc slowly fades from 10% to 0% over 24 hours
- **Arc height varies by distance**: Close connections (0-500km) = 20% height (12 units), Far connections (10,000km+) = 100% height (60 units)
- Each arc has main tube (0.6 radius) and glow tube (1.0 radius)
- Ripple effects at start (sender immediately) and end (receiver at 3s with bong sound)
- Clock wipe creates smooth progressive reveal from start to end point

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
- **Web Audio API**: Procedural sound generation (no audio files needed)
- **Unlock**: `AudioGate.tsx` handles mobile gesture requirement (iOS/Android policy)
- **Sounds**:
  - **Hover woosh**: Frequency sweep 150Hz → 800Hz with low-pass filter (1200Hz cutoff), 0.008 gain, 150ms duration
  - **Arc hum**: Layered triangle waves (110Hz fundamental + harmonics), 0.06-0.01 gain per layer, 5s duration
  - **Connection bong**: Pure sine wave, harmonizing upward with each ping (A2 → A4), 0.12 gain, 1.5s decay
- **Implementation**: `lib/audio.ts` using Web Audio API oscillators, filters, and gain envelopes

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
- Touch rotate enabled (desktop mouse wheel zoom: 200-380 units, prevents going behind stars at 400-800)
- Camera distance adjusted for mobile: 400 vs 300 (see GlobeCanvas.tsx:38) - further away for better view
- Drag rotation speed: 0.002 for heavy, massive globe feel
- Auto-rotation speed: 0.0002 (very slow, meditative)

### Supabase Edge Functions
- TypeScript errors are expected (Deno imports from URLs)
- Functions run in Deno runtime, not Node.js
- Always use service role key for database operations (bypasses RLS)

### Testing Without Supabase
Enable demo mode in app/page.tsx to use hardcoded presences (useful for offline development)

## Performance Notes

### Optimizations Applied
- Individual meshes for presence dots (allows per-dot materials and emissive animations)
- Throttled realtime updates (10 Hz client-side)
- Lazy-loaded Three.js scene after first paint
- Pixel ratio capped at 3x for maximum quality
- Greyscale shader with gamma correction applied at runtime (no pre-processing needed)
- Separate RAF loop for heartbeat animation (independent of React re-renders)
- Anisotropic filtering for texture sharpness
- Bump mapping for surface detail without geometry overhead

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
- Formula accounts for latLngToVector3 offset: `targetY = -(lng + 180) * (PI/180)`, `targetX = -lat * (PI/180)`
- Stops auto-rotation during centering to prevent interference
- Check console logs for "=== CENTER ON DEBUG ===" message with detailed rotation info
- Animation takes 2.5 seconds to complete with power2.inOut easing

### "Active dots not glowing"
- Active dots have TWO components: solid core + particle glow
- **Core dot**: MeshBasicMaterial, solid white, 0.6 radius
- **Glow particle**: Sprite with radial gradient texture (canvas-based), 6x size of core
- Glow uses AdditiveBlending for luminous effect
- Rhythmic pulse animation: glow size 0.8 to 1.2, opacity 0.4 to 0.9 (~1.5s cycle)
- Hovered dots: scale 1.4, glow opacity 0.9 (bright, no pulsing)
- Smooth lerp transitions: 0.25 factor for quick response
- Offline dots: static at scale 0.6, no glow
- Glow animation runs in SEPARATE useEffect with [globe, hoveredId] dependencies

### "Hover effects affecting all dots"
- Only hovered dot should change (check hoveredId === presence.id in animation loop)
- Hover sound: soft woosh with frequency sweep 150Hz → 800Hz, low-pass filtered at 1200Hz, 0.008 gain, 150ms
- Hover creates warping ripple effect at dot location (RingGeometry, scale animation with warp)
- Heartbeat animation respects hover state: hovered dots stay large (1.5 scale, 3.0 emissive)

### "Realtime not updating"
- Verify replication enabled for `presences` table
- Check Edge Functions deployed and accessible
- Confirm NEXT_PUBLIC_SUPABASE_ANON_KEY set correctly

### "Audio not playing on mobile"
- AudioGate component must render—checks for user gesture to unlock AudioContext
- Web Audio API requires resume() on suspended AudioContext (iOS/Android policy)
- Check browser console for "Failed to play" warnings from lib/audio.ts
- Verify AudioContext is created and unlocked (isAudioUnlocked() should return true)

### "TypeScript errors in Edge Functions"
- Expected—Deno imports from URLs not recognized by TypeScript
- Functions work correctly when deployed
- Add `// @ts-ignore` if needed for IDE

### "Dots positioned incorrectly on globe"
- latLngToVector3 adds 180° offset: `theta = toRadians(lng + 180)`
- This accounts for Three.js spherical coordinate system where 0° longitude is at back of sphere
- Dot positioning: use latLngToVector3(lat, lng, globeRadius) - conversion handles offset automatically
- Globe rotation: must account for offset manually: `targetY = -(lng + 180) * (PI/180)`
- Dots should be at ground level: radius = globeRadius (100), NOT globeRadius + 2

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
