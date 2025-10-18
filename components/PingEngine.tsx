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

/**
 * Manages ping arc animations between users
 * Synchronized animations with audio cues
 */
export default function PingEngine({ globe, pings, myPresence }: PingEngineProps) {
  const activeArcsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!globe || pings.length === 0) return

    const globeRadius = 100
    const activeArcs = activeArcsRef.current

    pings.forEach((ping) => {
      // Skip if already animating
      if (activeArcs.has(ping.id)) return

      activeArcs.add(ping.id)

      // Calculate arc path with higher curve
      const arcPoints = interpolateGreatCircle(
        ping.from_lat,
        ping.from_lng,
        ping.to_lat,
        ping.to_lng,
        50
      )

      // Make arc loop higher above globe
      const positions: THREE.Vector3[] = arcPoints.map((point, index) => {
        const t = index / (arcPoints.length - 1) // 0 to 1
        // Parabolic curve - highest in middle
        const heightBoost = Math.sin(t * Math.PI) * 40 // Up to 40 units higher
        const pos = latLngToVector3(point.lat, point.lng, globeRadius + 4 + heightBoost)
        return new THREE.Vector3(pos.x, pos.y, pos.z)
      })

      // Create smooth curve
      const curve = new THREE.CatmullRomCurve3(positions, false, 'catmullrom', 0.5)
      const points = curve.getPoints(100)
      const geometry = new THREE.BufferGeometry().setFromPoints(points)

      // Create thicker, shimmering arc material
      const material = new THREE.LineBasicMaterial({
        color: 0xffb300,
        transparent: true,
        opacity: 0,
        linewidth: 4, // Thicker line
      })

      const arc = new THREE.Line(geometry, material)
      globe.add(arc)
      
      // Add shimmer effect with a glow layer
      const glowMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        linewidth: 6,
      })
      const glowArc = new THREE.Line(geometry.clone(), glowMaterial)
      globe.add(glowArc)

      // Check if this ping involves the current user
      const isFromMe = myPresence && 
        Math.abs(ping.from_lat - myPresence.lat) < 0.01 && 
        Math.abs(ping.from_lng - myPresence.lng) < 0.01
      
      const isToMe = myPresence && 
        Math.abs(ping.to_lat - myPresence.lat) < 0.01 && 
        Math.abs(ping.to_lng - myPresence.lng) < 0.01

      // Create ripples at endpoints - VISIBLE and ANIMATED
      const createRipple = (lat: number, lng: number, delay: number) => {
        const pos = latLngToVector3(lat, lng, globeRadius + 2.5) // Right on dot surface
        const rippleGeometry = new THREE.RingGeometry(1, 2, 32) // Bigger initial size
        const rippleMaterial = new THREE.MeshBasicMaterial({
          color: 0xffb300, // Amber like arcs
          transparent: true,
          opacity: 1.0, // Start fully visible
          side: THREE.DoubleSide,
        })
        
        const ripple = new THREE.Mesh(rippleGeometry, rippleMaterial)
        ripple.position.set(pos.x, pos.y, pos.z)
        
        // Point ripple outward from globe center
        const normal = new THREE.Vector3(pos.x, pos.y, pos.z).normalize()
        ripple.lookAt(normal.x * 200, normal.y * 200, normal.z * 200)
        
        globe.add(ripple)
        
        console.log('Created ripple at:', lat, lng, 'with delay:', delay)

        // Animate ripple expansion - MORE VISIBLE
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

        // Play ripple sound if user is involved
        if ((isFromMe || isToMe) && delay > 0) {
          setTimeout(() => playRipple(), delay * 1000)
        }
      }

      // Animation timeline - LONGER and SHIMMERING
      const timeline = gsap.timeline({
        onComplete: () => {
          globe.remove(arc)
          globe.remove(glowArc)
          geometry.dispose()
          material.dispose()
          glowMaterial.dispose()
          activeArcs.delete(ping.id)
        },
      })

      // Start ripple at sender
      createRipple(ping.from_lat, ping.from_lng, 0)
      if (isFromMe) playRipple()

      // Fade in arc slowly
      timeline.to(material, {
        opacity: 0.7,
        duration: 0.5,
      })
      
      // Fade in glow arc
      timeline.to(glowMaterial, {
        opacity: 0.3,
        duration: 0.5,
      }, 0) // Start at same time

      // Arc travel animation - MUCH SLOWER
      timeline.to(material, {
        opacity: 0.9,
        duration: 3, // 3 seconds to travel
        ease: 'power1.inOut',
        onStart: () => {
          if (isFromMe || isToMe) playPing()
        },
      })
      
      // Shimmer effect - pulsing glow
      timeline.to(glowMaterial, {
        opacity: 0.6,
        duration: 1.5,
        yoyo: true,
        repeat: 1,
        ease: 'sine.inOut',
      }, 0.5) // Slight delay

      // Fade out arc
      timeline.to(material, {
        opacity: 0,
        duration: 0.8,
      })
      
      // Fade out glow
      timeline.to(glowMaterial, {
        opacity: 0,
        duration: 0.8,
      }, '-=0.8') // At same time

      // End ripple at receiver - delayed to match slower arc
      createRipple(ping.to_lat, ping.to_lng, 3.5)
    })
  }, [globe, pings, myPresence])

  return null // This component doesn't render DOM elements
}