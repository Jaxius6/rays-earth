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

    // Get all presences active within the last 24 hours
    const { data, error } = await supabase
      .from('presences')
      .select('*')
      .gte('last_active', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('last_active', { ascending: false })

    if (error) throw error

    // Calculate decay factor for each presence
    const now = Date.now()
    const presencesWithDecay = data.map((presence) => {
      const lastActive = new Date(presence.last_active).getTime()
      const ageMs = now - lastActive
      const ageHours = ageMs / (60 * 60 * 1000)
      
      // Linear decay over 24 hours
      const decay = presence.is_online ? 1 : Math.max(0, 1 - (ageHours / 24))
      
      return {
        ...presence,
        decay,
      }
    })

    return new Response(
      JSON.stringify(presencesWithDecay),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})