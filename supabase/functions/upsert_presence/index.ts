import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { lat, lng } = await req.json()

    // Validate coordinates
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      throw new Error('Invalid coordinates')
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new Error('Coordinates out of range')
    }

    // Round to 2 decimals for privacy (~1-3km precision)
    const roundedLat = Math.round(lat * 100) / 100
    const roundedLng = Math.round(lng * 100) / 100

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Generate a stable fingerprint based on rounded coords
    // This allows same-location users to share a presence
    const fingerprint = `${roundedLat}_${roundedLng}`

    // Upsert presence
    const { data, error } = await supabase
      .from('presences')
      .upsert(
        {
          lat: roundedLat,
          lng: roundedLng,
          last_active: new Date().toISOString(),
          is_online: true,
        },
        {
          onConflict: 'id',
          ignoreDuplicates: false,
        }
      )
      .select()
      .single()

    if (error) {
      // If no existing presence, insert new one
      const { data: newData, error: insertError } = await supabase
        .from('presences')
        .insert({
          lat: roundedLat,
          lng: roundedLng,
          last_active: new Date().toISOString(),
          is_online: true,
        })
        .select()
        .single()

      if (insertError) throw insertError

      return new Response(
        JSON.stringify(newData),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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