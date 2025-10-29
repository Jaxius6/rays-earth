import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const now = new Date()
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000)

    // Delete offline presences older than 24 hours
    const { error: presencesError, count: presencesCount } = await supabase
      .from('presences')
      .delete({ count: 'exact' })
      .eq('is_online', false)
      .lt('last_active', twentyFourHoursAgo.toISOString())

    if (presencesError) throw presencesError

    // Delete pings older than 48 hours
    const { error: pingsError, count: pingsCount } = await supabase
      .from('pings')
      .delete({ count: 'exact' })
      .lt('created_at', fortyEightHoursAgo.toISOString())

    if (pingsError) throw pingsError

    return new Response(
      JSON.stringify({
        success: true,
        deleted: {
          presences: presencesCount || 0,
          pings: pingsCount || 0,
        },
        timestamp: now.toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})