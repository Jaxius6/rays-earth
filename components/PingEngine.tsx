'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import gsap from 'gsap'
import { Ping } from '@/lib/supabase-browser'
import { interpolateGreatCircle, latLngToVector3, haversineDistance } from '@/lib/geo'
import { playArcHum, playBong } from '@/lib/audio'

interface PingEngineProps {
  globe: THREE.Group
  pings: Ping[]
  myPresence?: { lat: number; lng: number }
}

interface PersistentArc {
  id: string
  arc: THREE.Mesh
  glowArc: THREE.Mesh
  createdAt: number
  geometry: THREE.TubeGeometry
  material: THREE.MeshBasicMaterial
  glowMaterial: THREE.MeshBasicMaterial
}

/**
 * Manages ping arc animations between users
 * Clock wipe drawing effect, then glow, then 24-hour decay
 */
export default function PingEngine({ globe, pings, myPresence }: PingEngineProps) {
  const persistentArcsRef = useRef<Map<string, PersistentArc>>(new Map())
  const animatingArcsRef = useRef<Set<string>>(new Set())

  // Update arc opacities based on age (24-hour decay)
  useEffect(() => {
    if (!globe) return

    const updateOpacities = () => {
      const now = Date.now()
      const persistentArcs = persistentArcsRef.current

      persistentArcs.forEach((arcData, id) => {
        const ageMs = now - arcData.createdAt
        const ageHours = ageMs / (60 * 60 * 1000)

        if (ageHours >= 24) {
          // Remove arcs older than 24 hours
          globe.remove(arcData.arc)
          globe.remove(arcData.glowArc)
          arcData.geometry.dispose()
          arcData.material.dispose()
          arcData.glowMaterial.dispose()
          persistentArcs.delete(id)
        } else if (ageMs > 10000) {
          // After 10 seconds, continue fading to 0% over 24 hours
          const fadeProgress = ageHours / 24
          const opacity = Math.max(0, 0.1 * (1 - fadeProgress))

          if ('color' in arcData.material) {
            arcData.material.opacity = opacity
          }
          if ('color' in arcData.glowMaterial) {
            arcData.glowMaterial.opacity = opacity * 0.3
          }
        }
      })
    }

    const interval = setInterval(updateOpacities, 1000)
    return () => clearInterval(interval)
  }, [globe])

  // Handle new pings
  useEffect(() => {
    if (!globe || pings.length === 0) return

    const globeRadius = 100
    const animatingArcs = animatingArcsRef.current
    const persistentArcs = persistentArcsRef.current

    pings.forEach((ping) => {
      // Skip if already processed
      if (animatingArcs.has(ping.id) || persistentArcs.has(ping.id)) return

      animatingArcs.add(ping.id)

      // Calculate arc path with more points for smoothness
      const arcPoints = interpolateGreatCircle(
        ping.from_lat,
        ping.from_lng,
        ping.to_lat,
        ping.to_lng,
        100
      )

      // Get exact start and end positions (matching presence dots at globeRadius)
      const startPos = latLngToVector3(ping.from_lat, ping.from_lng, globeRadius)
      const endPos = latLngToVector3(ping.to_lat, ping.to_lng, globeRadius)

      // Calculate distance between points to determine arc height
      const distance = haversineDistance(
        ping.from_lat,
        ping.from_lng,
        ping.to_lat,
        ping.to_lng
      )

      // Scale arc height based on distance
      // Close distances (0-500km): 20% height
      // Far distances (10,000km+): 100% height
      const minDistance = 500 // km - close distance threshold
      const maxDistance = 10000 // km - far distance threshold
      const normalizedDistance = Math.min(Math.max((distance - minDistance) / (maxDistance - minDistance), 0), 1)
      const heightScale = 0.2 + (normalizedDistance * 0.8) // 20% to 100%
      const maxHeight = 60 // Maximum arc height in units
      const scaledHeight = maxHeight * heightScale

      // Make arc loop higher above globe, but START and END at exact dot positions
      const positions: THREE.Vector3[] = arcPoints.map((point, index) => {
        const t = index / (arcPoints.length - 1)

        if (t === 0) {
          // First point: exact start position
          return new THREE.Vector3(startPos.x, startPos.y, startPos.z)
        } else if (t === 1) {
          // Last point: exact end position
          return new THREE.Vector3(endPos.x, endPos.y, endPos.z)
        } else {
          // Middle points: arc high above globe (height varies with distance)
          const heightBoost = Math.sin(t * Math.PI) * scaledHeight
          const pos = latLngToVector3(point.lat, point.lng, globeRadius + heightBoost)
          return new THREE.Vector3(pos.x, pos.y, pos.z)
        }
      })

      // Validate positions array
      const validPositions = positions.filter(p =>
        p &&
        typeof p.x === 'number' &&
        typeof p.y === 'number' &&
        typeof p.z === 'number' &&
        !isNaN(p.x) && !isNaN(p.y) && !isNaN(p.z) &&
        isFinite(p.x) && isFinite(p.y) && isFinite(p.z)
      )

      if (validPositions.length < 2) {
        console.error('Invalid positions for arc:', positions)
        animatingArcs.delete(ping.id)
        return
      }

      // Create tube geometry for arc
      let tubeGeometry: THREE.TubeGeometry
      let tubePath: THREE.CatmullRomCurve3
      try {
        tubePath = new THREE.CatmullRomCurve3(validPositions, false, 'catmullrom', 0.5)
        tubeGeometry = new THREE.TubeGeometry(tubePath, 200, 0.6, 16, false)
      } catch (error) {
        console.error('Failed to create tube geometry:', error)
        animatingArcs.delete(ping.id)
        return
      }

      // Main tube material with clock wipe effect
      const tubeMaterial = new THREE.MeshBasicMaterial({
        color: 0xffb300,
        transparent: true,
        opacity: 0.8,
      })

      const arc = new THREE.Mesh(tubeGeometry, tubeMaterial)
      arc.frustumCulled = false
      globe.add(arc)

      // Glow layer
      const glowTubeGeometry = new THREE.TubeGeometry(tubePath, 200, 1.0, 16, false)
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
      })

      const glowArc = new THREE.Mesh(glowTubeGeometry, glowMaterial)
      glowArc.frustumCulled = false
      globe.add(glowArc)

      // Check if involves current user
      const isFromMe = myPresence &&
        Math.abs(ping.from_lat - myPresence.lat) < 0.01 &&
        Math.abs(ping.from_lng - myPresence.lng) < 0.01

      const isToMe = myPresence &&
        Math.abs(ping.to_lat - myPresence.lat) < 0.01 &&
        Math.abs(ping.to_lng - myPresence.lng) < 0.01

      // Beautiful warping ripple creation
      const createRipple = (lat: number, lng: number, delay: number, isSender: boolean) => {
        const pos = latLngToVector3(lat, lng, globeRadius + 0.5)
        
        // Create multiple concentric ripples for depth
        for (let i = 0; i < 3; i++) {
          setTimeout(() => {
            const rippleGeometry = new THREE.RingGeometry(0.5, 1.5, 64)
            const rippleMaterial = new THREE.MeshBasicMaterial({
              color: isSender ? 0xffffff : 0xffb300,
              transparent: true,
              opacity: 0.8,
              side: THREE.DoubleSide,
            })
            
            const ripple = new THREE.Mesh(rippleGeometry, rippleMaterial)
            ripple.position.set(pos.x, pos.y, pos.z)
            
            const normal = new THREE.Vector3(pos.x, pos.y, pos.z).normalize()
            ripple.lookAt(normal.x * 200, normal.y * 200, normal.z * 200)
            
            globe.add(ripple)

            // Warping animation with noise-like distortion
            let startTime = Date.now()
            const animateWarp = () => {
              const elapsed = (Date.now() - startTime) / 1000
              if (elapsed > 1.5) {
                globe.remove(ripple)
                rippleGeometry.dispose()
                rippleMaterial.dispose()
                return
              }
              
              // Beautiful warping effect
              const baseScale = 1 + elapsed * 4
              const warpX = Math.sin(elapsed * 8 + i) * 0.3
              const warpY = Math.cos(elapsed * 6 + i * 0.5) * 0.2
              
              ripple.scale.set(
                baseScale + warpX,
                baseScale + warpY,
                1
              )
              
              // Organic fade
              rippleMaterial.opacity = 0.8 * Math.pow(1 - elapsed / 1.5, 2)
              
              requestAnimationFrame(animateWarp)
            }
            animateWarp()
          }, i * 150 + delay * 1000)
        }
      }

      // Start ripple at sender
      createRipple(ping.from_lat, ping.from_lng, 0, true)

      // Start audio hum
      if (isFromMe || isToMe) playArcHum()

      // CLOCK WIPE EFFECT - Draw tube progressively along arc path
      const drawStartTime = Date.now()
      const drawDuration = 3000 // 3 seconds to draw the full arc

      // Initially hide the tube by setting drawRange to 0
      const positionAttribute = tubeGeometry.attributes.position
      const totalVertices = positionAttribute.count
      tubeGeometry.setDrawRange(0, 0)

      let drawAnimationId: number

      const animateClockWipe = () => {
        const elapsed = Date.now() - drawStartTime
        const progress = Math.min(elapsed / drawDuration, 1)

        // Calculate how many vertices to draw based on progress
        const vertexCount = Math.floor(progress * totalVertices)
        tubeGeometry.setDrawRange(0, vertexCount)

        if (progress < 1) {
          drawAnimationId = requestAnimationFrame(animateClockWipe)
        } else {
          // Drawing complete - start glow phase
          startGlowPhase()
        }
      }

      // Start clock wipe animation
      requestAnimationFrame(animateClockWipe)

      // GLOW PHASE - After tube is fully drawn
      const startGlowPhase = () => {
        const glowStartTime = Date.now()
        const glowDuration = 5000 // 5 seconds of pulsing glow

        let glowAnimationId: number

        const animateGlow = () => {
          const elapsed = Date.now() - glowStartTime
          const progress = Math.min(elapsed / glowDuration, 1)

          // Pulsating glow effect
          const pulse = Math.sin(Date.now() * 0.01) * 0.3 + 0.7
          glowMaterial.opacity = 0.6 * pulse

          if (progress < 1) {
            glowAnimationId = requestAnimationFrame(animateGlow)
          } else {
            // Glow complete - fade to white
            startFadeToWhite()
          }
        }

        animateGlow()
      }

      // FADE TO WHITE - After glow phase
      const startFadeToWhite = () => {
        // Store as persistent arc
        animatingArcs.delete(ping.id)
        persistentArcs.set(ping.id, {
          id: ping.id,
          arc,
          glowArc,
          createdAt: Date.now(),
          geometry: tubeGeometry,
          material: tubeMaterial,
          glowMaterial,
        })

        // Fade to white over 10 seconds
        gsap.to(tubeMaterial, {
          opacity: 0.1,
          duration: 10,
          ease: 'power2.out',
        })

        gsap.to(tubeMaterial.color, {
          r: 1,
          g: 1,
          b: 1,
          duration: 10,
        })

        gsap.to(glowMaterial.color, {
          r: 1,
          g: 1,
          b: 1,
          duration: 10,
        })

        // Continue subtle pulsation
        const pulsateInterval = setInterval(() => {
          if (!persistentArcs.has(ping.id)) {
            clearInterval(pulsateInterval)
            return
          }
          const pulse = Math.sin(Date.now() * 0.008) * 0.1 + 0.9
          glowMaterial.opacity = tubeMaterial.opacity * 0.3 * pulse
        }, 50)
      }

      // End ripple at receiver with bong after tube is drawn
      setTimeout(() => {
        createRipple(ping.to_lat, ping.to_lng, 0, false)
        playBong() // Play for EVERYONE, not just me
      }, drawDuration)
    })
  }, [globe, pings, myPresence])

  return null
}