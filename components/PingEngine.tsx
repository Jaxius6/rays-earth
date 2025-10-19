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
  arc: THREE.Line
  glowArc: THREE.Line
  createdAt: number
  geometry: THREE.BufferGeometry
  material: THREE.LineBasicMaterial
  glowMaterial: THREE.LineBasicMaterial
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
          
          arcData.material.opacity = opacity
          arcData.material.color = color
          arcData.glowMaterial.opacity = opacity * 0.3
          arcData.glowMaterial.color = color
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

      // MUCH thicker arc material with pulsing
      const material = new THREE.LineBasicMaterial({
        color: 0xffb300,
        transparent: true,
        opacity: 0,
        linewidth: 20, // VERY thick
      })

      const arc = new THREE.Line(geometry, material)
      globe.add(arc)
      
      // Even thicker glow layer for dramatic effect
      const glowMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        linewidth: 35, // Massive glow
      })
      const glowArc = new THREE.Line(geometry.clone(), glowMaterial)
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

      // Animation timeline - 5 SECOND travel
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
            geometry,
            material,
            glowMaterial,
          })
        },
      })

      // Start ripple at sender
      createRipple(ping.from_lat, ping.from_lng, 0, true)

      // Fade in arc quickly
      timeline.to(material, {
        opacity: 0.9,
        duration: 0.3,
      })
      
      timeline.to(glowMaterial, {
        opacity: 0.5,
        duration: 0.3,
      }, 0)

      // Arc travel - 5 SECONDS with ethereal hum
      timeline.to(material, {
        opacity: 1.0,
        duration: 5,
        ease: 'power1.inOut',
        onStart: () => {
          if (isFromMe || isToMe) playArcHum()
        },
      })
      
      // Pulsing glow during travel
      timeline.to(glowMaterial, {
        opacity: 0.8,
        duration: 2.5,
        yoyo: true,
        repeat: 1,
        ease: 'sine.inOut',
      }, 0.3)

      // After travel, fade to 10% over 10 seconds, transition to white
      timeline.to(material, {
        opacity: 0.1,
        duration: 10,
        ease: 'power2.out',
      })
      
      timeline.to(glowMaterial, {
        opacity: 0.03,
        duration: 10,
        ease: 'power2.out',
      }, '-=10')
      
      // Transition color to white
      timeline.to(material.color, {
        r: 1,
        g: 1,
        b: 1,
        duration: 10,
      }, '-=10')
      
      timeline.to(glowMaterial.color, {
        r: 1,
        g: 1,
        b: 1,
        duration: 10,
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