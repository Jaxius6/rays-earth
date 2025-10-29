'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import gsap from 'gsap'
import { Ping } from '@/lib/supabase-browser'
import { interpolateGreatCircle, latLngToVector3 } from '@/lib/geo'
import { playArcHum, playBong } from '@/lib/audio'

interface PingEngineProps {
  globe: THREE.Group
  pings: Ping[]
  myPresence?: { lat: number; lng: number }
}

interface PersistentArc {
  id: string
  arc: THREE.Mesh | THREE.Line
  glowArc: THREE.Mesh | THREE.Line
  createdAt: number
  geometry: THREE.BufferGeometry | THREE.TubeGeometry
  material: THREE.MeshBasicMaterial | THREE.LineBasicMaterial
  glowMaterial: THREE.MeshBasicMaterial | THREE.LineBasicMaterial
}

/**
 * Manages ping arc animations between users
 * Arcs persist for 24 hours with decay
 */
export default function PingEngine({ globe, pings, myPresence }: PingEngineProps) {
  const persistentArcsRef = useRef<Map<string, PersistentArc>>(new Map())
  const animatingArcsRef = useRef<Set<string>>(new Set())

  // Update arc opacities based on age
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
          // After 10 seconds, start fading to white and thinner
          // Fade from 10% to 0% over 24 hours
          const fadeProgress = (ageHours / 24)
          const opacity = Math.max(0, 0.1 * (1 - fadeProgress))
          
          // Transition to white over time
          const whiteness = Math.min(1, ageMs / 60000) // Fully white after 1 minute
          const color = new THREE.Color().lerpColors(
            new THREE.Color(0xffb300),
            new THREE.Color(0xffffff),
            whiteness
          )
          
          if ('color' in arcData.material) {
            arcData.material.opacity = opacity
            arcData.material.color = color
          }
          if ('color' in arcData.glowMaterial) {
            arcData.glowMaterial.opacity = opacity * 0.3
            arcData.glowMaterial.color = color
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
          // Middle points: arc high above globe
          const heightBoost = Math.sin(t * Math.PI) * 60 // Peak height - 60 units
          const pos = latLngToVector3(point.lat, point.lng, globeRadius + heightBoost)
          return new THREE.Vector3(pos.x, pos.y, pos.z)
        }
      })

      const curve = new THREE.CatmullRomCurve3(positions, false, 'catmullrom', 0.5)
      const points = curve.getPoints(200)
      const geometry = new THREE.BufferGeometry().setFromPoints(points)

      // Validate positions array more thoroughly
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

      // Thinner tubes
      let tubeGeometry, tubePath
      try {
        tubePath = new THREE.CatmullRomCurve3(validPositions, false, 'catmullrom', 0.5)
        tubeGeometry = new THREE.TubeGeometry(tubePath, 200, 0.6, 16, false) // 0.6 radius = thinner
      } catch (error) {
        console.error('Failed to create tube geometry:', error)
        animatingArcs.delete(ping.id)
        return
      }
      
      const tubeMaterial = new THREE.MeshBasicMaterial({
        color: 0xffb300,
        transparent: true,
        opacity: 0,
      })
      
      const arc = new THREE.Mesh(tubeGeometry, tubeMaterial)
      globe.add(arc)
      
      // Glow layer - also thinner
      const glowTubeGeometry = new THREE.TubeGeometry(tubePath, 200, 1.0, 16, false) // 1.0 radius
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
      })
      
      const glowArc = new THREE.Mesh(glowTubeGeometry, glowMaterial)
      globe.add(glowArc)
      
      // Store geometry references
      const arcGeometry = tubeGeometry
      const glowGeometry = glowTubeGeometry

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

      // Create MORE marching ants particles - continuous stream
      const particleCount = 40 // More particles!
      const particles: THREE.Mesh[] = []
      
      for (let i = 0; i < particleCount; i++) {
        const particleGeom = new THREE.SphereGeometry(0.4, 8, 8) // Slightly bigger
        const particleMat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 1.0,
        })
        const particle = new THREE.Mesh(particleGeom, particleMat)
        particle.visible = false
        globe.add(particle)
        particles.push(particle)
      }

      // Start audio hum
      if (isFromMe || isToMe) playArcHum()

      // PHASE 1: ONLY MARCHING ANTS - continuous stream, NO tube visible
      const phase1StartTime = Date.now()
      const phase1Duration = 5000 // 5 seconds for ants to travel

      // Keep tube completely hidden during phase 1
      tubeMaterial.opacity = 0
      glowMaterial.opacity = 0

      const animateAntsOnly = () => {
        const elapsed = Date.now() - phase1StartTime
        const progress = Math.min(elapsed / phase1Duration, 1)

        // Continuous marching ants along entire path
        particles.forEach((particle, i) => {
          // Spread particles evenly along entire path for continuous stream
          const particleOffset = (i / particleCount)
          const particlePos = progress - particleOffset * 0.3

          if (particlePos > 0 && particlePos <= 1) {
            const point = tubePath.getPointAt(Math.min(particlePos, 1))
            particle.position.copy(point)
            particle.visible = true

            // Smooth fade based on position
            const fadeIn = Math.min(particlePos * 10, 1)
            const fadeOut = particlePos > 0.9 ? (1 - particlePos) * 10 : 1
            ;(particle.material as THREE.MeshBasicMaterial).opacity = fadeIn * fadeOut
          } else {
            particle.visible = false
          }
        })

        if (progress < 1) {
          requestAnimationFrame(animateAntsOnly)
        } else {
          // Phase 1 complete - ants have landed, start tube drawing
          startTubeDrawing()
        }
      }

      // Start phase 1: ants only
      requestAnimationFrame(animateAntsOnly)

      // PHASE 2: TUBE DRAWS IN - after ants land
      const startTubeDrawing = () => {
        const phase2StartTime = Date.now()
        const phase2Duration = 2000 // 2 seconds for tube to draw

        // Keep ants visible but static
        particles.forEach(p => {
          (p.material as THREE.MeshBasicMaterial).opacity = 0.6
        })

        const animateTubeDrawing = () => {
          const elapsed = Date.now() - phase2StartTime
          const progress = Math.min(elapsed / phase2Duration, 1)

          // Tube fades in progressively
          tubeMaterial.opacity = progress * 0.8
          glowMaterial.opacity = 0 // No glow yet

          if (progress < 1) {
            requestAnimationFrame(animateTubeDrawing)
          } else {
            // Tube drawn - start glow phase
            startGlowPhase()
          }
        }

        requestAnimationFrame(animateTubeDrawing)
      }

      // PHASE 3: Glow and pulse for 5 seconds after tube is drawn
      const startGlowPhase = () => {
        // Keep ants visible but slightly dimmer
        particles.forEach(p => {
          (p.material as THREE.MeshBasicMaterial).opacity = 0.4
        })

        // Now add pulsating glow!
        const glowStartTime = Date.now()
        const glowDuration = 5000 // 5 seconds of pulsing

        const animateGlow = () => {
          const glowElapsed = Date.now() - glowStartTime
          const glowProgress = Math.min(glowElapsed / glowDuration, 1)

          // Pulsating glow effect
          const pulse = Math.sin(Date.now() * 0.01) * 0.3 + 0.7
          glowMaterial.opacity = 0.6 * pulse

          // Keep ants pulsing too
          particles.forEach(p => {
            (p.material as THREE.MeshBasicMaterial).opacity = 0.3 + pulse * 0.2
          })

          if (glowProgress < 1) {
            requestAnimationFrame(animateGlow)
          } else {
            // Glow phase complete - start fade to white
            startFadeToWhite()
          }
        }

        animateGlow()
      }

      // PHASE 4: Fade to white and thin over 10 seconds
      const startFadeToWhite = () => {
        // Keep ants visible but make them white too
        particles.forEach(p => {
          gsap.to((p.material as THREE.MeshBasicMaterial).color, {
            r: 1,
            g: 1,
            b: 1,
            duration: 10,
          })
          gsap.to((p.material as THREE.MeshBasicMaterial), {
            opacity: 0.15,
            duration: 10,
          })
        })
        
        // Store as persistent arc with particles
        animatingArcs.delete(ping.id)
        persistentArcs.set(ping.id, {
          id: ping.id,
          arc,
          glowArc,
          createdAt: Date.now(),
          geometry: arcGeometry,
          material: tubeMaterial,
          glowMaterial,
        })

        // Animate fade to 10% white over 10 seconds
        const fadeTimeline = gsap.timeline({
          onComplete: () => {
            // After fade, keep ants dimly visible
            particles.forEach(p => {
              (p.material as THREE.MeshBasicMaterial).opacity = 0.1
            })
          }
        })
        
        fadeTimeline.to(tubeMaterial, {
          opacity: 0.1,
          duration: 10,
          ease: 'power2.out',
        })
        
        fadeTimeline.to(tubeMaterial.color, {
          r: 1,
          g: 1,
          b: 1,
          duration: 10,
        }, 0)
        
        fadeTimeline.to(glowMaterial.color, {
          r: 1,
          g: 1,
          b: 1,
          duration: 10,
        }, 0)

        // Continue subtle pulsation during fade
        const pulsateInterval = setInterval(() => {
          if (!persistentArcs.has(ping.id)) {
            clearInterval(pulsateInterval)
            // Clean up particles when arc is removed
            particles.forEach(p => {
              globe.remove(p)
              p.geometry.dispose()
              ;(p.material as THREE.Material).dispose()
            })
            return
          }
          const pulse = Math.sin(Date.now() * 0.008) * 0.1 + 0.9
          glowMaterial.opacity = tubeMaterial.opacity * 0.3 * pulse
        }, 50)
      }

      // End ripple at receiver with bong - ALWAYS play bong!
      // This happens when tube finishes drawing (phase 1: 5s + phase 2: 2s = 7s)
      setTimeout(() => {
        createRipple(ping.to_lat, ping.to_lng, 0, false)
        playBong() // Play for EVERYONE, not just me
      }, 7000)
    })
  }, [globe, pings, myPresence])

  return null
}