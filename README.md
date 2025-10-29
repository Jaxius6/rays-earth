# rays.earth

A live, real-time, planet-wide map of luminous human presence. No UI chrome, no text, no buttons — just a dark Earth glowing with the presence of visitors around the world.

![rays.earth](https://img.shields.io/badge/Next.js-14-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue) ![Three.js](https://img.shields.io/badge/Three.js-0.160-green)

## 🌍 Concept

A minimal, meditative web experience where:

- **No visible UI** — The entire experience is the globe and interactions
- **Real-time presence** — See visitors appear and fade over 24 hours
- **Ping interactions** — Click any glow to send a luminous arc between points
- **Privacy-first** — Coordinates rounded to ~1-3km precision, no PII stored
- **Mobile-optimized** — Smooth 50-60 FPS on modern phones

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm 9+
- A [Supabase](https://supabase.com) account
- A [Vercel](https://vercel.com) account (for deployment)

### 1. Clone and Install

```bash
git clone https://github.com/yourusername/rays-earth.git
cd rays-earth
npm install
```

### 2. Set Up Supabase

#### Create a Supabase Project

1. Go to [app.supabase.com](https://app.supabase.com)
2. Create a new project
3. Note your project URL and keys from Settings → API

#### Run Database Migrations

```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

Or manually run the SQL files in order:

1. `supabase/sql/01_schema.sql`
2. `supabase/sql/02_policies.sql`
3. `supabase/sql/03_indexes.sql`

#### Enable Realtime

1. Go to Database → Replication in Supabase dashboard
2. Enable replication for `presences` table
3. Create a custom realtime channel named `pings` in Settings → Realtime

#### Deploy Edge Functions

```bash
# Deploy all functions
supabase functions deploy upsert_presence
supabase functions deploy touch_presence
supabase functions deploy set_offline
supabase functions deploy get_recent_presences
supabase functions deploy emit_ping
supabase functions deploy prune_old

# Set environment variables for functions
supabase secrets set SUPABASE_URL=your-project-url
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

#### Set Up Scheduled Pruning (Optional)

Create a cron job in Supabase to call `prune_old` function:

```sql
-- Run daily at 3 AM UTC
select cron.schedule(
  'prune-old-data',
  '0 3 * * *',
  $$
  select net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/prune_old',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  );
  $$
);
```

### 3. Configure Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 4. Run Locally

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## 📦 Deploy to Vercel

### One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/rays-earth)

### Manual Deploy

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
# Settings → Environment Variables
```

Add the same environment variables from `.env.local` to your Vercel project.

## 🎨 Technical Architecture

### Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript
- **3D**: Three.js + three-globe with custom GLSL shaders
- **Animation**: GSAP for timing/easing
- **Realtime**: Supabase Realtime (Postgres + WebSocket channels)
- **Database**: Supabase Postgres with Row Level Security
- **Serverless**: Supabase Edge Functions (Deno)
- **Audio**: Howler.js with mobile gesture unlock
- **Styling**: Tailwind CSS

### Data Flow

```
User Opens Page
    ↓
Request Geolocation → Round to 2 decimals
    ↓
Call upsert_presence Edge Function
    ↓
Subscribe to Realtime Channels
    ↓
Render Globe + Presence Dots
    ↓
User Clicks Another Dot
    ↓
Call emit_ping Edge Function
    ↓
Animate Arc + Play Sounds
    ↓
Heartbeat every 20s (touch_presence)
    ↓
On Close/Background → set_offline
```

### Performance Optimizations

- **Instanced meshes** for presence dots (avoid per-dot overhead)
- **Throttled realtime** updates (10 Hz client-side)
- **Lazy-loaded** Three.js scene after first paint
- **Reduced effects** on low-end devices (navigator.hardwareConcurrency check)
- **Greyscale shader** applied to globe texture at runtime
- **Pixel ratio capped** at 2x for performance

### Globe Rendering

The Earth uses NASA Blue Marble textures converted to greyscale via a custom fragment shader:

```glsl
// Converts RGB to greyscale in shader
float grey = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));
diffuseColor *= vec4(vec3(grey * 0.4), sampledDiffuseColor.a);
```

Textures are loaded from CDN:
- Globe: `//unpkg.com/three-globe/example/img/earth-dark.jpg`
- Bump: `//unpkg.com/three-globe/example/img/earth-topology.png`

Alternative: Download and self-host NASA Blue Marble from:
- [NASA Visible Earth](https://visibleearth.nasa.gov/collection/1484/blue-marble)

### Audio Files

The placeholder audio files are minimal WAV headers. For production, replace with:

**ping.wav** — Short, warm tone (~200ms, C note at 523Hz)
**ripple.wav** — Soft percussive click (~100ms)

Generate with tools like:
- [Audacity](https://www.audacityteam.org/)
- [sfxr](https://sfxr.me/)
- Web Audio API synthesis

## 🔒 Privacy & Security

- **Coordinates rounded** to 2 decimal places (~1-3km precision)
- **No cookies** or client-side tracking
- **No PII stored** — only rounded lat/lng and timestamps
- **Row Level Security** enforces read-only access via RPC functions
- **Rate limiting** recommended via Supabase Edge Function quotas
- **No text on screen** — fully visual interface

## 🧪 Testing

Run unit tests:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

## 📱 Mobile Considerations

- **Portrait and landscape** both supported
- **Touch rotate** enabled, zoom disabled
- **Audio unlock** via gesture (required by iOS/Android)
- **50-60 FPS target** on mid-range phones
- **Reduced effects** on low-memory devices

## 🛠️ Development Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm test             # Run Jest tests
```

## 🐛 Troubleshooting

### "Geolocation not working"

- Ensure HTTPS (required by browser geolocation API)
- Check browser permissions in site settings
- App still works without geolocation (view-only mode)

### "Realtime not updating"

- Verify replication enabled for `presences` table in Supabase
- Check that `pings` channel exists in Realtime settings
- Confirm Edge Functions are deployed and accessible

### "Audio not playing on mobile"

- Audio requires a user gesture to unlock on iOS/Android
- The AudioGate component handles this automatically
- Ensure audio files exist at `/public/audio/*.wav`

### "TypeScript errors in Edge Functions"

- These are expected (Deno imports from URLs)
- Functions will work correctly when deployed to Supabase
- Add `// @ts-ignore` or configure Deno in IDE if needed

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Credits

- **Globe textures**: NASA Blue Marble
- **Three.js**: [mrdoob](https://github.com/mrdoob/three.js)
- **three-globe**: [vasturiano](https://github.com/vasturiano/three-globe)
- **Supabase**: Real-time database and Edge Functions
- **Vercel**: Hosting and deployment

---

**rays.earth** — A minimal map of human presence, glowing in real-time across the planet.