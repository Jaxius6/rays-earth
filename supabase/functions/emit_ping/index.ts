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
    const { from_lat, from_lng, to_lat, to_lng } = await req.json()

    // Validate coordinates
    if (
      typeof from_lat !== 'number' || typeof from_lng !== 'number' ||
      typeof to_lat !== 'number' || typeof to_lng !== 'number'
    ) {
      throw new Error('Invalid coordinates')
    }

    if (
      from_lat < -90 || from_lat > 90 || from_lng < -180 || from_lng > 180 ||
      to_lat < -90 || to_lat > 90 || to_lng < -180 || to_lng > 180
    ) {
      throw new Error('Coordinates out of range')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Insert ping
    const { data, error } = await supabase
      .from('pings')
      .insert({
        from_lat,
        from_lng,
        to_lat,
        to_lng,
      })
      .select()
      .single()

    if (error) throw error

    // Publish to realtime channel for all clients to receive
    const channel = supabase.channel('pings')
    await channel.send({
      type: 'broadcast',
      event: 'ping',
      payload: {
        id: data.id,
        from_lat: data.from_lat,
        from_lng: data.from_lng,
        to_lat: data.to_lat,
        to_lng: data.to_lng,
        created_at: data.created_at,
        // Server timestamp to avoid clock skew
        server_timestamp: Date.now(),
      },
    })

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})