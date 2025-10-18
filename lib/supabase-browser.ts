/**
 * Supabase client for browser-side operations
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})

/**
 * Presence type definition
 */
export interface Presence {
  id: string
  lat: number
  lng: number
  last_active: string
  is_online: boolean
  created_at?: string
  decay?: number
}

/**
 * Ping type definition
 */
export interface Ping {
  id: string
  from_lat: number
  from_lng: number
  to_lat: number
  to_lng: number
  created_at: string
  server_timestamp?: number
}

/**
 * Call Edge Function to upsert presence
 */
export async function upsertPresence(lat: number, lng: number): Promise<Presence> {
  const response = await fetch(
    `${supabaseUrl}/functions/v1/upsert_presence`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ lat, lng }),
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to upsert presence: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Call Edge Function to touch presence (heartbeat)
 */
export async function touchPresence(id: string): Promise<Presence> {
  const response = await fetch(
    `${supabaseUrl}/functions/v1/touch_presence`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ id }),
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to touch presence: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Call Edge Function to set presence offline
 */
export async function setOffline(id: string): Promise<Presence> {
  const response = await fetch(
    `${supabaseUrl}/functions/v1/set_offline`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ id }),
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to set offline: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Call Edge Function to get recent presences
 */
export async function getRecentPresences(): Promise<Presence[]> {
  const response = await fetch(
    `${supabaseUrl}/functions/v1/get_recent_presences`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to get presences: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Call Edge Function to emit ping
 */
export async function emitPing(
  from_lat: number,
  from_lng: number,
  to_lat: number,
  to_lng: number
): Promise<Ping> {
  const response = await fetch(
    `${supabaseUrl}/functions/v1/emit_ping`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ from_lat, from_lng, to_lat, to_lng }),
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to emit ping: ${response.statusText}`)
  }

  return response.json()
}