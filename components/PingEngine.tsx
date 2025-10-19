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

      // Get exact start and end positions (matching presence dots at globeRadius + 2)
      const startPos = latLngToVector3(ping.from_lat, ping.from_lng, globeRadius + 2)
      const endPos = latLngToVector3(ping.to_lat, ping.to_lng, globeRadius + 2)

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
          const pos = latLngToVector3(point.lat, point.lng, globeRadius + 2 + heightBoost)
          return new THREE.Vector3(pos.x, pos.y, pos.z)
        }
      })

      const curve = new THREE.CatmullRomCurve3(positions, false, 'catmullrom', 0.5)
      const points = curve.getPoints(200)
      const geometry = new THREE.BufferGeometry().setFromPoints(points)

      // ULTRA THICK arc - use tube geometry for actual thickness
      const tubePath = new THREE.CatmullRomCurve3(positions, false, 'catmullrom', 0.5)
      const tubeGeometry = new THREE.TubeGeometry(tubePath, 200, 2.5, 16, false) // 2.5 radius = 5 width!
      
      const tubeMaterial = new THREE.MeshBasicMaterial({
        color: 0xffb300,
        transparent: true,
        opacity: 0,
      })
      
      const arc = new THREE.Mesh(tubeGeometry, tubeMaterial)
      globe.add(arc)
      
      // MASSIVE glow layer as second tube
      const glowTubeGeometry = new THREE.TubeGeometry(tubePath, 200, 4, 16, false) // 4 radius = 8 width!
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
      })
      
      const glowArc = new THREE.Mesh(glowTubeGeometry, glowMaterial)
      globe.add(glowArc)
      
      // Store original geometry references for disposal
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
        const pos = latLngToVector3(lat, lng, globeRadius + 2.5)
        
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

      // Animation timeline - 5 SECOND ACTIVE DRAWING with pulsating magic glow
      const timeline = gsap.timeline({
        onComplete: () => {
          // Don't remove - keep arc persistent
          animatingArcs.delete(ping.id)
          
          // Store as persistent arc at 10% opacity
          persistentArcs.set(ping.id, {
            id: ping.id,
            arc,
            glowArc,
            createdAt: Date.now(),
            geometry: arcGeometry,
            material: tubeMaterial,
            glowMaterial,
          })
        },
      })

      // Start ripple at sender
      createRipple(ping.from_lat, ping.from_lng, 0, true)

      // ANIMATED DRAWING: Use morphTargets to reveal arc from A to B
      // We'll animate the scale along the tube path
      let drawProgress = 0
      const animateDrawing = () => {
        if (drawProgress >= 1) return
        
        drawProgress = Math.min(drawProgress + 0.0033, 1) // 5 seconds = 0.0033 per frame at 60fps
        
        // Scale the arc geometry to simulate drawing
        const scaleY = drawProgress
        arc.scale.set(1, scaleY, 1)
        glowArc.scale.set(1, scaleY, 1)
        
        // Pulsating magic glow effect
        const pulse = Math.sin(Date.now() * 0.01) * 0.15 + 0.85 // Oscillate 0.7-1.0
        glowMaterial.opacity = Math.min(drawProgress, 0.7) * pulse
        tubeMaterial.opacity = Math.min(drawProgress, 1.0)
        
        if (drawProgress < 1) {
          requestAnimationFrame(animateDrawing)
        }
      }

      // Start the drawing animation and hum
      if (isFromMe || isToMe) playArcHum()
      requestAnimationFrame(animateDrawing)
      
      // After 5 seconds, start fading with continuous pulsation
      setTimeout(() => {
        // Continue pulsating even during fade
        const pulsateInterval = setInterval(() => {
          if (!persistentArcs.has(ping.id)) {
            clearInterval(pulsateInterval)
            return
          }
          const pulse = Math.sin(Date.now() * 0.008) * 0.1 + 0.9
          const currentOpacity = tubeMaterial.opacity
          glowMaterial.opacity = currentOpacity * 0.3 * pulse
        }, 50)
      }, 5000)

      // After 5 second drawing, fade to 10% over 10 seconds, transition to white
      timeline.to(tubeMaterial, {
        opacity: 0.1,
        duration: 10,
        delay: 5,
        ease: 'power2.out',
      })
      
      // Transition color to white
      timeline.to(tubeMaterial.color, {
        r: 1,
        g: 1,
        b: 1,
        duration: 10,
        delay: 5,
      }, '-=10')
      
      timeline.to(glowMaterial.color, {
        r: 1,
        g: 1,
        b: 1,
        duration: 10,
        delay: 5,
      }, '-=10')

      // End ripple at receiver with bong sound
      createRipple(ping.to_lat, ping.to_lng, 5, false)
      if (isFromMe || isToMe) {
        setTimeout(() => playBong(), 5000)
      }
    })
  }, [globe, pings, myPresence])

  return null
}