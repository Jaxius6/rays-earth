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

// Demo users for testing - mix of online and offline at various ages
const now = new Date()
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString()

const DEMO_USERS: Presence[] = [
  // 10 Online users
  { id: 'demo-paris', lat: 48.86, lng: 2.35, last_active: now.toISOString(), is_online: true },
  { id: 'demo-tokyo', lat: 35.68, lng: 139.69, last_active: now.toISOString(), is_online: true },
  { id: 'demo-nyc', lat: 40.71, lng: -74.01, last_active: now.toISOString(), is_online: true },
  { id: 'demo-sydney', lat: -33.87, lng: 151.21, last_active: now.toISOString(), is_online: true },
  { id: 'demo-london', lat: 51.51, lng: -0.13, last_active: now.toISOString(), is_online: true },
  { id: 'demo-berlin', lat: 52.52, lng: 13.40, last_active: now.toISOString(), is_online: true },
  { id: 'demo-beijing', lat: 39.90, lng: 116.41, last_active: now.toISOString(), is_online: true },
  { id: 'demo-mumbai', lat: 19.08, lng: 72.88, last_active: now.toISOString(), is_online: true },
  { id: 'demo-saopaulo', lat: -23.55, lng: -46.63, last_active: now.toISOString(), is_online: true },
  { id: 'demo-moscow', lat: 55.76, lng: 37.62, last_active: now.toISOString(), is_online: true },
  
  // 20 Offline users at varying fade stages
  { id: 'demo-dubai', lat: 25.20, lng: 55.27, last_active: hoursAgo(1), is_online: false },
  { id: 'demo-singapore', lat: 1.35, lng: 103.82, last_active: hoursAgo(2), is_online: false },
  { id: 'demo-hongkong', lat: 22.32, lng: 114.17, last_active: hoursAgo(3), is_online: false },
  { id: 'demo-toronto', lat: 43.65, lng: -79.38, last_active: hoursAgo(4), is_online: false },
  { id: 'demo-mexico', lat: 19.43, lng: -99.13, last_active: hoursAgo(5), is_online: false },
  { id: 'demo-cairo', lat: 30.04, lng: 31.24, last_active: hoursAgo(6), is_online: false },
  { id: 'demo-istanbul', lat: 41.01, lng: 28.98, last_active: hoursAgo(8), is_online: false },
  { id: 'demo-seoul', lat: 37.57, lng: 126.98, last_active: hoursAgo(10), is_online: false },
  { id: 'demo-bangkok', lat: 13.76, lng: 100.50, last_active: hoursAgo(12), is_online: false },
  { id: 'demo-madrid', lat: 40.42, lng: -3.70, last_active: hoursAgo(14), is_online: false },
  { id: 'demo-rome', lat: 41.90, lng: 12.50, last_active: hoursAgo(15), is_online: false },
  { id: 'demo-athens', lat: 37.98, lng: 23.73, last_active: hoursAgo(16), is_online: false },
  { id: 'demo-stockholm', lat: 59.33, lng: 18.07, last_active: hoursAgo(17), is_online: false },
  { id: 'demo-oslo', lat: 59.91, lng: 10.75, last_active: hoursAgo(18), is_online: false },
  { id: 'demo-vienna', lat: 48.21, lng: 16.37, last_active: hoursAgo(19), is_online: false },
  { id: 'demo-amsterdam', lat: 52.37, lng: 4.90, last_active: hoursAgo(20), is_online: false },
  { id: 'demo-brussels', lat: 50.85, lng: 4.35, last_active: hoursAgo(21), is_online: false },
  { id: 'demo-zurich', lat: 47.38, lng: 8.54, last_active: hoursAgo(22), is_online: false },
  { id: 'demo-copenhagen', lat: 55.68, lng: 12.57, last_active: hoursAgo(23), is_online: false },
  { id: 'demo-dublin', lat: 53.35, lng: -6.26, last_active: hoursAgo(23.5), is_online: false },
]

export default function HomePage() {
  const [isLoading, setIsLoading] = useState(true)
  const [globeLoading, setGlobeLoading] = useState(true)
  const [globe, setGlobe] = useState<any>(null)
  const [myPresence, setMyPresence] = useState<Presence | null>(null)
  const [presences, setPresences] = useState<Presence[]>([])
  const [pings, setPings] = useState<Ping[]>([])
  const [demoMode, setDemoMode] = useState(false)
  
  const presenceChannelRef = useRef<RealtimeChannel | null>(null)
  const pingChannelRef = useRef<RealtimeChannel | null>(null)
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const globeControlsRef = useRef<{ centerOn: (lat: number, lng: number) => void } | null>(null)

  // Initialize audio immediately
  useEffect(() => {
    initializeAudio()
  }, [])

  // SEQUENCED LOAD: Earth → My Dot → Center → Other Dots → Rotate
  useEffect(() => {
    if (!globe || globeLoading) return
    
    console.log('🌍 Step 1: Globe loaded')
    
    const init = async () => {
      try {
        const hasSupabase =
          process.env.NEXT_PUBLIC_SUPABASE_URL &&
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
          process.env.NEXT_PUBLIC_SUPABASE_URL.trim() !== '' &&
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim() !== ''

        if (hasSupabase) {
          // STEP 2: Request geolocation and show MY dot
          console.log('📍 Step 2: Requesting location...')
          const position = await requestGeolocation()
          
          if (position) {
            const { lat, lng } = roundCoordinates(
              position.coords.latitude,
              position.coords.longitude
            )

            // Create MY presence
            const presence = await upsertPresence(lat, lng)
            setMyPresence(presence)
            console.log('✨ Step 2.5: MY dot created at', lat, lng)
            
            // Wait a moment to see my dot
            await new Promise(resolve => setTimeout(resolve, 500))
            
            // STEP 3: Center on MY location
            console.log('🎯 Step 3: Centering on MY location...')
            if (globeControlsRef.current) {
              globeControlsRef.current.centerOn(lat, lng)
            }
            
            announce(`Connected to rays.earth at ${lat.toFixed(2)}, ${lng.toFixed(2)}`)
            
            // Wait for centering animation to complete
            await new Promise(resolve => setTimeout(resolve, 2500))
          } else {
            announce('Connected to rays.earth. Viewing global presence.')
          }

          // STEP 4: Load OTHER dots
          console.log('👥 Step 4: Loading other users...')
          const initialPresences = await getRecentPresences()
          const allPresences = [...initialPresences, ...DEMO_USERS]
          setPresences(allPresences)
          setDemoMode(true)
          
          console.log(`✅ Loaded ${initialPresences.length} real + ${DEMO_USERS.length} demo users`)
          announce(`${allPresences.length} users visible`)
          
          // STEP 5: Auto-rotation will start after 5s inactivity (handled by GlobeCanvas)
          console.log('⏳ Step 5: Auto-rotation starts after 5s inactivity')
        } else {
          console.warn('Supabase not configured - showing demo users')
          setPresences(DEMO_USERS)
          setDemoMode(true)
          announce('Viewing rays.earth globe with demo users')
        }
      } catch (error) {
        console.error('Initialization error:', error)
        setPresences(DEMO_USERS)
        setDemoMode(true)
        announce('Showing globe with demo users')
      }
    }

    init()
  }, [globe, globeLoading])
  
  // Handle globe ready callback
  const handleGlobeReady = useCallback((globeInstance: any, controls: { centerOn: (lat: number, lng: number) => void }) => {
    console.log('Globe is ready!')
    setGlobe(globeInstance)
    globeControlsRef.current = controls
    setGlobeLoading(false)
    setIsLoading(false) // Hide loader immediately - globe is visible!
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

    // If we have myPresence, send real ping (which will broadcast and create arc)
    if (myPresence) {
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
    } else {
      // No myPresence - create local demo ping only
      const demoPing: Ping = {
        id: `demo-${Date.now()}`,
        from_lat: presence.lat,
        from_lng: presence.lng,
        to_lat: presence.lat,
        to_lng: presence.lng,
        created_at: new Date().toISOString(),
      }
      
      setPings((prev) => [...prev, demoPing])
      setTimeout(() => {
        setPings((prev) => prev.filter((p) => p.id !== demoPing.id))
      }, 3000)
      
      announce('Ping sent')
    }
  }, [myPresence])

  return (
    <>
      {/* Loader overlay - hide with opacity when done */}
      <div
        className="fixed inset-0 flex items-center justify-center bg-gradient-to-b from-rays-bg-dark to-rays-bg-light transition-opacity duration-500 pointer-events-none z-50"
        style={{ opacity: isLoading ? 1 : 0 }}
      >
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-rays-amber border-t-transparent rounded-full spinner mx-auto mb-4" />
          <p className="sr-only">Loading rays.earth...</p>
        </div>
      </div>

      {/* Main content - always rendered */}
      <main className="fixed inset-0 overflow-hidden">
        <GlobeCanvas onGlobeReady={handleGlobeReady} />
      
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
    </>
  )
}