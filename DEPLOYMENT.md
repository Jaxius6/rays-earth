# Deployment Guide for rays.earth

Quick reference for deploying rays.earth to production.

## Pre-Deployment Checklist

- [ ] Supabase project created
- [ ] Database migrations run (01_schema.sql, 02_policies.sql, 03_indexes.sql)
- [ ] Realtime enabled for `presences` table
- [ ] Custom realtime channel `pings` created
- [ ] All 6 Edge Functions deployed
- [ ] Cron job for `prune_old` scheduled (optional)
- [ ] Environment variables set in Vercel
- [ ] Audio files replaced with production sounds (optional)

## Step-by-Step Deployment

### 1. Supabase Setup (15 min)

```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Push database schema
supabase db push

# Deploy Edge Functions
supabase functions deploy upsert_presence
supabase functions deploy touch_presence
supabase functions deploy set_offline
supabase functions deploy get_recent_presences
supabase functions deploy emit_ping
supabase functions deploy prune_old

# Set secrets for Edge Functions
supabase secrets set SUPABASE_URL=https://YOUR_PROJECT.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

### 2. Enable Realtime (5 min)

In Supabase Dashboard:

1. Go to **Database → Replication**
2. Find `presences` table
3. Click to enable replication
4. Go to **Database → Realtime** (or Settings → Realtime)
5. Ensure realtime is enabled globally
6. The `pings` broadcast channel is created automatically when first used

### 3. Vercel Deployment (5 min)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Follow prompts, then add environment variables
```

In Vercel Dashboard:

1. Go to **Settings → Environment Variables**
2. Add:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://YOUR_PROJECT.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `YOUR_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` = `YOUR_SERVICE_ROLE_KEY`
3. Trigger a new deployment

### 4. Optional: Schedule Pruning

In Supabase Dashboard SQL Editor:

```sql
-- Install pg_cron extension if not already enabled
create extension if not exists pg_cron;

-- Schedule daily cleanup at 3 AM UTC
select cron.schedule(
  'prune-old-rays-data',
  '0 3 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/prune_old',
    headers := jsonb_build_object(
      'Authorization', 
      'Bearer YOUR_SERVICE_ROLE_KEY'
    )
  );
  $$
);
```

### 5. Verify Deployment

Visit your Vercel URL and check:

- [ ] Globe loads and renders
- [ ] Geolocation prompt appears
- [ ] Your presence dot appears on the globe
- [ ] Audio gate disappears on first tap
- [ ] Health check works: `https://your-domain.vercel.app/api/health`
- [ ] DevTools console shows no errors

## Production Audio Files

Replace placeholder audio files with production sounds:

```bash
# Generate or download proper audio files
# Place in public/audio/

# ping.wav - warm tone, ~200ms, C note (523Hz)
# ripple.wav - soft click, ~100ms
```

Recommended tools:
- Audacity (free, open source)
- sfxr.me (browser-based sound generator)
- freesound.org (CC-licensed sounds)

## Environment Variables Reference

### Required for Client (Vercel)

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
```

### Required for Edge Functions (Supabase Secrets)

```bash
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

## Monitoring & Maintenance

### Check Edge Function Logs

```bash
supabase functions logs upsert_presence --tail
supabase functions logs emit_ping --tail
```

### Monitor Database Size

```sql
-- Check table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Verify Pruning

```sql
-- Check old data is being removed
SELECT COUNT(*) FROM presences WHERE is_online = false AND last_active < NOW() - INTERVAL '24 hours';
SELECT COUNT(*) FROM pings WHERE created_at < NOW() - INTERVAL '48 hours';
```

## Troubleshooting

### "Presences not appearing"

- Check RLS policies are enabled: `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true;`
- Verify Edge Functions are deployed: Visit Supabase Functions dashboard
- Check browser console for errors

### "Realtime not working"

- Confirm replication is enabled for `presences` table
- Check Supabase logs for connection errors
- Verify NEXT_PUBLIC_SUPABASE_ANON_KEY is correct

### "High database usage"

- Ensure `prune_old` cron job is running
- Manually run pruning: Call `/functions/v1/prune_old`
- Check indexes are created: `\di` in SQL editor

## Performance Optimization

### For High Traffic

1. **Enable Supabase connection pooling**: Settings → Database → Connection Pooling
2. **Add rate limiting**: Use Vercel Edge Middleware or Supabase rate limiting
3. **CDN for static assets**: Vercel handles this automatically
4. **Optimize Edge Functions**: Add caching headers where appropriate

### For Low-End Devices

Already implemented in code:
- Instanced meshes for dots
- Throttled realtime updates (10 Hz)
- Pixel ratio capped at 2x
- Reduced effects based on `navigator.hardwareConcurrency`

## Cost Estimates

### Supabase (Free Tier Limits)

- Database: 500 MB (plenty for this use case)
- Realtime: 200 concurrent connections
- Edge Functions: 500K invocations/month
- Bandwidth: 5 GB/month

### Vercel (Hobby Tier)

- Bandwidth: 100 GB/month
- Serverless functions: Unlimited
- Deployments: Unlimited

**Expected cost for moderate traffic (1000 daily visitors): $0/month on free tiers**

## Security Recommendations

1. **Rate limiting**: Add to Edge Functions to prevent abuse
2. **CORS**: Already configured in Edge Functions
3. **Environment variables**: Never commit `.env.local`
4. **RLS policies**: Already enforced, do not disable
5. **Monitoring**: Set up Supabase alerts for unusual activity

## Support

- GitHub Issues: [Your repo URL]
- Documentation: See README.md
- Supabase Docs: https://supabase.com/docs
- Vercel Docs: https://vercel.com/docs

---

Built with Next.js 14, Supabase, and Three.js