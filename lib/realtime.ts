/**
 * Realtime subscription helpers for rays.earth
 */

import { supabase, Presence, Ping } from './supabase-browser'
import type { RealtimeChannel } from '@supabase/supabase-js'

/**
 * Subscribe to presence updates
 */
export function subscribeToPresences(
  onInsert: (presence: Presence) => void,
  onUpdate: (presence: Presence) => void,
  onDelete: (id: string) => void
): RealtimeChannel {
  const channel = supabase
    .channel('public:presences')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'presences',
      },
      (payload) => {
        onInsert(payload.new as Presence)
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'presences',
      },
      (payload) => {
        onUpdate(payload.new as Presence)
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'presences',
      },
      (payload) => {
        onDelete((payload.old as Presence).id)
      }
    )
    .subscribe()

  return channel
}

/**
 * Subscribe to ping events via broadcast channel
 */
export function subscribeToPings(
  onPing: (ping: Ping) => void
): RealtimeChannel {
  const channel = supabase
    .channel('pings')
    .on('broadcast', { event: 'ping' }, (payload) => {
      onPing(payload.payload as Ping)
    })
    .subscribe()

  return channel
}

/**
 * Unsubscribe from a channel
 */
export async function unsubscribe(channel: RealtimeChannel): Promise<void> {
  await supabase.removeChannel(channel)
}

/**
 * Throttle function for limiting update frequency
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean
  let lastResult: ReturnType<T>

  return function (this: any, ...args: Parameters<T>) {
    if (!inThrottle) {
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
      lastResult = func.apply(this, args)
    }
    return lastResult
  }
}