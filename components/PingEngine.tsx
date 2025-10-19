'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import gsap from 'gsap'
import { Ping } from '@/lib/supabase-browser'
import { interpolateGreatCircle, latLngToVector3 } from '@/lib/geo'
import { playPing, playRipple } from '@/lib/audio'

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
        } else if (ageMs > 30000) {
          // After 30 seconds, start fading
          // Fade from 10% to 0% over 24 hours
          const fadeProgress = (ageHours / 24)
          const opacity = Math.max(0, 0.1 * (1 - fadeProgress))
          arcData.material.opacity = opacity
          arcData.glowMaterial.opacity = opacity * 0.5
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

      // Calculate higher arc path
      const arcPoints = interpolateGreatCircle(
        ping.from_lat,
        ping.from_lng,
        ping.to_lat,
        ping.to_lng,
        50
      )

      // Make arc loop higher above globe
      const positions: THREE.Vector3[] = arcPoints.map((point, index) => {
        const t = index / (arcPoints.length - 1)
        const heightBoost = Math.sin(t * Math.PI) * 50 // Higher curve - 50 units
        const pos = latLngToVector3(point.lat, point.lng, globeRadius + 6 + heightBoost)
        return new THREE.Vector3(pos.x, pos.y, pos.z)
      })

      const curve = new THREE.CatmullRomCurve3(positions, false, 'catmullrom', 0.5)
      const points = curve.getPoints(150)
      const geometry = new THREE.BufferGeometry().setFromPoints(points)

      // Thicker arc material
      const material = new THREE.LineBasicMaterial({
        color: 0xffb300,
        transparent: true,
        opacity: 0,
        linewidth: 8, // Much thicker
      })

      const arc = new THREE.Line(geometry, material)
      globe.add(arc)
      
      // Shimmer glow layer
      const glowMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        linewidth: 12,
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

      // Ripple creation
      const createRipple = (lat: number, lng: number, delay: number) => {
        const pos = latLngToVector3(lat, lng, globeRadius + 2.5)
        const rippleGeometry = new THREE.RingGeometry(1, 2, 32)
        const rippleMaterial = new THREE.MeshBasicMaterial({
          color: 0xffb300,
          transparent: true,
          opacity: 1.0,
          side: THREE.DoubleSide,
        })
        
        const ripple = new THREE.Mesh(rippleGeometry, rippleMaterial)
        ripple.position.set(pos.x, pos.y, pos.z)
        
        const normal = new THREE.Vector3(pos.x, pos.y, pos.z).normalize()
        ripple.lookAt(normal.x * 200, normal.y * 200, normal.z * 200)
        
        globe.add(ripple)

        gsap.to(ripple.scale, {
          x: 4,
          y: 4,
          z: 4,
          duration: 1.2,
          delay,
          ease: 'power2.out',
        })

        gsap.to(rippleMaterial, {
          opacity: 0,
          duration: 1.2,
          delay,
          ease: 'power2.out',
          onComplete: () => {
            globe.remove(ripple)
            rippleGeometry.dispose()
            rippleMaterial.dispose()
          },
        })

        if ((isFromMe || isToMe) && delay > 0) {
          setTimeout(() => playRipple(), delay * 1000)
        }
      }

      // Animation timeline - 3 second travel
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
      createRipple(ping.from_lat, ping.from_lng, 0)
      if (isFromMe) playRipple()

      // Fade in arc
      timeline.to(material, {
        opacity: 0.8,
        duration: 0.5,
      })
      
      timeline.to(glowMaterial, {
        opacity: 0.4,
        duration: 0.5,
      }, 0)

      // Arc travel - 3 SECONDS
      timeline.to(material, {
        opacity: 1.0,
        duration: 3,
        ease: 'power1.inOut',
        onStart: () => {
          if (isFromMe || isToMe) playPing()
        },
      })
      
      // Shimmer
      timeline.to(glowMaterial, {
        opacity: 0.7,
        duration: 1.5,
        yoyo: true,
        repeat: 1,
        ease: 'sine.inOut',
      }, 0.5)

      // After travel, fade to 10% over 1 second
      timeline.to(material, {
        opacity: 0.1,
        duration: 1,
      })
      
      timeline.to(glowMaterial, {
        opacity: 0.05,
        duration: 1,
      }, '-=1')

      // End ripple at receiver
      createRipple(ping.to_lat, ping.to_lng, 3.5)
    })
  }, [globe, pings, myPresence])

  return null
}