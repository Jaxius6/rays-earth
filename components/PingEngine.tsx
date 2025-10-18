'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import gsap from 'gsap'
import { Ping } from '@/lib/supabase-browser'
import { interpolateGreatCircle, latLngToVector3 } from '@/lib/geo'
import { playPing, playRipple } from '@/lib/audio'

interface PingEngineProps {
  globe: any
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

      // Calculate arc path
      const arcPoints = interpolateGreatCircle(
        ping.from_lat,
        ping.from_lng,
        ping.to_lat,
        ping.to_lng,
        50
      )

      const positions: THREE.Vector3[] = arcPoints.map((point) => {
        const pos = latLngToVector3(point.lat, point.lng, globeRadius + 2)
        return new THREE.Vector3(pos.x, pos.y, pos.z)
      })

      // Create curve
      const curve = new THREE.CatmullRomCurve3(positions)
      const points = curve.getPoints(100)
      const geometry = new THREE.BufferGeometry().setFromPoints(points)

      // Create arc material
      const material = new THREE.LineBasicMaterial({
        color: 0xffb300,
        transparent: true,
        opacity: 0,
        linewidth: 2,
      })

      const arc = new THREE.Line(geometry, material)
      globe.add(arc)

      // Check if this ping involves the current user
      const isFromMe = myPresence && 
        Math.abs(ping.from_lat - myPresence.lat) < 0.01 && 
        Math.abs(ping.from_lng - myPresence.lng) < 0.01
      
      const isToMe = myPresence && 
        Math.abs(ping.to_lat - myPresence.lat) < 0.01 && 
        Math.abs(ping.to_lng - myPresence.lng) < 0.01

      // Create ripples at endpoints
      const createRipple = (lat: number, lng: number, delay: number) => {
        const pos = latLngToVector3(lat, lng, globeRadius + 1)
        const rippleGeometry = new THREE.RingGeometry(0.5, 1, 32)
        const rippleMaterial = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.8,
          side: THREE.DoubleSide,
        })
        
        const ripple = new THREE.Mesh(rippleGeometry, rippleMaterial)
        ripple.position.set(pos.x, pos.y, pos.z)
        ripple.lookAt(0, 0, 0)
        globe.add(ripple)

        // Animate ripple expansion
        gsap.to(ripple.scale, {
          x: 3,
          y: 3,
          z: 3,
          duration: 1,
          delay,
          ease: 'power2.out',
        })

        gsap.to(rippleMaterial, {
          opacity: 0,
          duration: 1,
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

      // Animation timeline
      const timeline = gsap.timeline({
        onComplete: () => {
          globe.remove(arc)
          geometry.dispose()
          material.dispose()
          activeArcs.delete(ping.id)
        },
      })

      // Start ripple at sender
      createRipple(ping.from_lat, ping.from_lng, 0)
      if (isFromMe) playRipple()

      // Fade in arc
      timeline.to(material, {
        opacity: 0.6,
        duration: 0.2,
      })

      // Arc travel animation using dash offset
      timeline.to(material, {
        opacity: 0.8,
        duration: 1.5,
        ease: 'power1.inOut',
        onStart: () => {
          if (isFromMe || isToMe) playPing()
        },
      })

      // Fade out arc
      timeline.to(material, {
        opacity: 0,
        duration: 0.3,
      })

      // End ripple at receiver
      createRipple(ping.to_lat, ping.to_lng, 1.7)
    })
  }, [globe, pings, myPresence])

  return null // This component doesn't render DOM elements
}