'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { 
  Presence, 
  Ping, 
  upsertPresence, 
  touchPresence, 
  setOffline,
  getRecentPresences,
  emitPing
} from '@/lib/supabase-browser'
import { requestGeolocation, roundCoordinates } from '@/lib/geo'
import { initializeAudio } from '@/lib/audio'
import { subscribeToPresences, subscribeToPings, unsubscribe } from '@/lib/realtime'
import { announce } from '@/components/AriaAnnouncer'
import type { RealtimeChannel } from '@supabase/supabase-js'

// Dynamic imports for client-side only components
const GlobeCanvas = dynamic(() => import('@/components/GlobeCanvas'), { ssr: false })
const PresenceLayer = dynamic(() => import('@/components/PresenceLayer'), { ssr: false })
const PingEngine = dynamic(() => import('@/components/PingEngine'), { ssr: false })
const AudioGate = dynamic(() => import('@/components/AudioGate'), { ssr: false })
const AriaAnnouncer = dynamic(() => import('@/components/AriaAnnouncer'), { ssr: false })

// Demo users for testing
const DEMO_USERS: Presence[] = [
  { id: 'demo-paris', lat: 48.86, lng: 2.35, last_active: new Date().toISOString(), is_online: true },
  { id: 'demo-tokyo', lat: 35.68, lng: 139.69, last_active: new Date().toISOString(), is_online: true },
  { id: 'demo-nyc', lat: 40.71, lng: -74.01, last_active: new Date().toISOString(), is_online: true },
  { id: 'demo-sydney', lat: -33.87, lng: 151.21, last_active: new Date().toISOString(), is_online: true },
]

export default function HomePage() {
  const [isLoading, setIsLoading] = useState(true)
  const [globe, setGlobe] = useState<any>(null)
  const [myPresence, setMyPresence] = useState<Presence | null>(null)
  const [presences, setPresences] = useState<Presence[]>([])
  const [pings, setPings] = useState<Ping[]>([])
  const [demoMode, setDemoMode] = useState(false)
  
  const presenceChannelRef = useRef<RealtimeChannel | null>(null)
  const pingChannelRef = useRef<RealtimeChannel | null>(null)
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Initialize on mount
  useEffect(() => {
    const init = async () => {
      try {
        // Initialize audio system
        initializeAudio()

        // Check if Supabase is configured (non-empty values)
        const hasSupabase = 
          process.env.NEXT_PUBLIC_SUPABASE_URL && 
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
          process.env.NEXT_PUBLIC_SUPABASE_URL.trim() !== '' &&
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim() !== ''

        if (hasSupabase) {
          // Request geolocation
          const position = await requestGeolocation()
          
          if (position) {
            const { lat, lng } = roundCoordinates(
              position.coords.latitude,
              position.coords.longitude
            )

            // Upsert presence
            const presence = await upsertPresence(lat, lng)
            setMyPresence(presence)
            announce(`Connected to rays.earth at ${lat.toFixed(2)}, ${lng.toFixed(2)}`)
          } else {
            announce('Connected to rays.earth. Viewing global presence.')
          }

          // Fetch initial presences
          const initialPresences = await getRecentPresences()
          
          // ALWAYS add demo users for testing pings
          const allPresences = [...initialPresences, ...DEMO_USERS]
          setPresences(allPresences)
          setDemoMode(true)
          
          console.log(`Loaded ${initialPresences.length} real users + ${DEMO_USERS.length} demo users`)
          announce(`${allPresences.length} users visible (${DEMO_USERS.length} demo for testing)`)
        } else {
          console.warn('Supabase not configured - showing globe with demo users')
          setPresences(DEMO_USERS)
          setDemoMode(true)
          announce('Viewing rays.earth globe with demo users')
        }

        setIsLoading(false)
      } catch (error) {
        console.error('Initialization error:', error)
        // Show demo users on error
        setPresences(DEMO_USERS)
        setDemoMode(true)
        setIsLoading(false)
        announce('Showing globe with demo users')
      }
    }

    init()
  }, [])

  // Subscribe to realtime updates
  useEffect(() => {
    if (!myPresence) return

    // Subscribe to presence changes
    const presenceChannel = subscribeToPresences(
      (presence) => {
        setPresences((prev) => [...prev.filter(p => p.id !== presence.id), presence])
        announce('Someone new appeared')
      },
      (presence) => {
        setPresences((prev) =>
          prev.map((p) => (p.id === presence.id ? presence : p))
        )
      },
      (id) => {
        setPresences((prev) => prev.filter((p) => p.id !== id))
      }
    )
    presenceChannelRef.current = presenceChannel

    // Subscribe to pings
    const pingChannel = subscribeToPings((ping) => {
      setPings((prev) => [...prev, ping])
      
      // Remove ping after animation completes
      setTimeout(() => {
        setPings((prev) => prev.filter((p) => p.id !== ping.id))
      }, 3000)

      announce('Ping received')
    })
    pingChannelRef.current = pingChannel

    // Heartbeat to keep presence alive
    heartbeatIntervalRef.current = setInterval(() => {
      if (myPresence) {
        touchPresence(myPresence.id).catch(console.error)
      }
    }, 20000)

    return () => {
      if (presenceChannelRef.current) {
        unsubscribe(presenceChannelRef.current)
      }
      if (pingChannelRef.current) {
        unsubscribe(pingChannelRef.current)
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
      }
    }
  }, [myPresence])

  // Handle page visibility and unload
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && myPresence) {
        setOffline(myPresence.id).catch(console.error)
      } else if (!document.hidden && myPresence) {
        touchPresence(myPresence.id).catch(console.error)
      }
    }

    const handleBeforeUnload = () => {
      if (myPresence) {
        const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/set_offline`
        const data = JSON.stringify({ id: myPresence.id })
        navigator.sendBeacon(url, data)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [myPresence])

  // Handle presence click to send ping
  const handlePresenceClick = useCallback(async (presence: Presence) => {
    // Don't ping yourself
    if (presence.id === myPresence?.id) return

    console.log('Clicked presence:', presence)

    // Always create local ping animation for instant feedback
    const demoPing: Ping = {
      id: `demo-${Date.now()}`,
      from_lat: myPresence?.lat || presence.lat,
      from_lng: myPresence?.lng || presence.lng,
      to_lat: presence.lat,
      to_lng: presence.lng,
      created_at: new Date().toISOString(),
    }
    
    setPings((prev) => [...prev, demoPing])
    setTimeout(() => {
      setPings((prev) => prev.filter((p) => p.id !== demoPing.id))
    }, 3000)
    
    announce('Ping sent')

    // Also try to send real ping if we have a presence
    if (!myPresence) return

    try {
      await emitPing(
        myPresence.lat,
        myPresence.lng,
        presence.lat,
        presence.lng
      )
      announce('Ping sent')
    } catch (error) {
      console.error('Failed to send ping:', error)
    }
  }, [myPresence, demoMode])

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-b from-rays-bg-dark to-rays-bg-light">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-rays-amber border-t-transparent rounded-full spinner mx-auto mb-4" />
          <p className="sr-only">Loading rays.earth...</p>
        </div>
      </div>
    )
  }

  return (
    <main className="fixed inset-0 overflow-hidden">
      <GlobeCanvas onGlobeReady={setGlobe} />
      
      {globe && (
        <>
          <PresenceLayer 
            globe={globe}
            presences={presences}
            onPresenceClick={handlePresenceClick}
          />
          <PingEngine 
            globe={globe}
            pings={pings}
            myPresence={myPresence ? { lat: myPresence.lat, lng: myPresence.lng } : undefined}
          />
        </>
      )}


      <AudioGate />
      <AriaAnnouncer />
    </main>
  )
}