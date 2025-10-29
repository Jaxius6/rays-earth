'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { Presence } from '@/lib/supabase-browser'
import { calculateDecay, latLngToVector3 } from '@/lib/geo'
import { playHoverSound } from '@/lib/audio'

interface PresenceLayerProps {
  globe: THREE.Group
  presences: Presence[]
  onPresenceClick?: (presence: Presence) => void
}

/**
 * Manages rendering of presence dots on the globe
 * Handles brightness decay, hover effects, and click interactions
 */
export default function PresenceLayer({ globe, presences, onPresenceClick }: PresenceLayerProps) {
  const pointsRef = useRef<Map<string, THREE.Mesh>>(new Map())
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster())
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2())
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const hoverRippleRef = useRef<THREE.Mesh | null>(null)
  const animationFrameRef = useRef<number>(0)
  const breathingAnimationRef = useRef<number>(0)

  useEffect(() => {
    if (!globe) return

    const globeRadius = 100
    const existingPoints = pointsRef.current

    // Update or create points for each presence
    presences.forEach((presence) => {
      const decay = calculateDecay(presence.last_active, presence.is_online)
      
      // Remove fully faded presences
      if (decay <= 0) {
        const point = existingPoints.get(presence.id)
        if (point) {
          globe.remove(point)
          existingPoints.delete(presence.id)
        }
        return
      }

      let point = existingPoints.get(presence.id)

      // Create new point if doesn't exist
      if (!point) {
        const position = latLngToVector3(presence.lat, presence.lng, globeRadius + 2)

        // Smaller dots - online dots are tiny but glow
        const size = presence.is_online ? 0.8 : 0.6
        const geometry = new THREE.SphereGeometry(size, 16, 16)

        // Online dots glow with emissive material
        const material = presence.is_online
          ? new THREE.MeshStandardMaterial({
              color: 0xffffff,
              emissive: 0xffffff,
              emissiveIntensity: 2.0,
              transparent: true,
              opacity: decay,
            })
          : new THREE.MeshBasicMaterial({
              color: 0xffffff,
              transparent: true,
              opacity: 0.1, // Offline starts at 10%
            })

        point = new THREE.Mesh(geometry, material)
        point.position.set(position.x, position.y, position.z)
        point.userData = { presence, isClickable: presence.is_online, startTime: Date.now() }
        
        globe.add(point)
        existingPoints.set(presence.id, point)
      } else {
        // Update existing point
        const material = point.material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial

        // Online users: full decay, Offline users: 10% max, fading to 0%
        let finalOpacity = presence.is_online ? decay : Math.max(0, 0.1 * decay)

        material.opacity = finalOpacity
        material.color.setHex(0xffffff) // Always white

        // Update emissive for online dots
        if (presence.is_online && 'emissive' in material) {
          material.emissiveIntensity = 2.0
        }

        point.userData = { presence, isClickable: presence.is_online }

        // NO automatic pulsing - only on hover
        // Keep dots at base scale unless hovered
        const isHovered = hoveredId === presence.id
        if (presence.is_online) {
          const baseScale = 1.0
          point.scale.set(baseScale, baseScale, baseScale)
        } else {
          // Static scale for offline dots
          const baseScale = 0.67
          point.scale.set(baseScale, baseScale, baseScale)
        }
      }
    })

    // Remove points that no longer exist in presences
    existingPoints.forEach((point, id) => {
      if (!presences.find(p => p.id === id)) {
        globe.remove(point)
        point.geometry.dispose()
        if (point.material instanceof THREE.Material) {
          point.material.dispose()
        }
        existingPoints.delete(id)
      }
    })

    // Handle hover
    const handleMouseMove = (event: MouseEvent) => {
      mouseRef.current.x = (event.clientX / window.innerWidth) * 2 - 1
      mouseRef.current.y = -(event.clientY / window.innerHeight) * 2 + 1

      // Get camera - it's in the scene, not globe's parent
      const scene = globe.parent as THREE.Scene
      if (!scene) return
      
      // Find camera in scene
      const camera = scene.children.find(child => child instanceof THREE.PerspectiveCamera) as THREE.Camera
      if (!camera) return

      raycasterRef.current.setFromCamera(mouseRef.current, camera)
      const intersects = raycasterRef.current.intersectObjects(Array.from(existingPoints.values()))
      
      if (intersects.length > 0) {
        const clickedPoint = intersects[0].object as THREE.Mesh
        const presence = clickedPoint.userData.presence as Presence
        const isClickable = clickedPoint.userData.isClickable as boolean
        
        // Only show hover effects for clickable (online) users
        if (isClickable && hoveredId !== presence.id) {
          setHoveredId(presence.id)
          playHoverSound()
          
          // Create beautiful warping ripple on hover
          if (hoverRippleRef.current) {
            globe.remove(hoverRippleRef.current)
            hoverRippleRef.current.geometry.dispose()
            ;(hoverRippleRef.current.material as THREE.Material).dispose()
          }
          
          const pos = latLngToVector3(presence.lat, presence.lng, 102.5)
          const rippleGeometry = new THREE.RingGeometry(0.5, 1.5, 32)
          const rippleMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide,
          })
          
          const ripple = new THREE.Mesh(rippleGeometry, rippleMaterial)
          ripple.position.set(pos.x, pos.y, pos.z)
          
          const normal = new THREE.Vector3(pos.x, pos.y, pos.z).normalize()
          ripple.lookAt(normal.x * 200, normal.y * 200, normal.z * 200)
          
          globe.add(ripple)
          hoverRippleRef.current = ripple
          
          // Animate ripple with warping effect
          let startTime = Date.now()
          const animateRipple = () => {
            const elapsed = (Date.now() - startTime) / 1000
            if (elapsed > 0.8 || hoveredId !== presence.id) {
              if (hoverRippleRef.current) {
                globe.remove(hoverRippleRef.current)
                hoverRippleRef.current.geometry.dispose()
                ;(hoverRippleRef.current.material as THREE.Material).dispose()
                hoverRippleRef.current = null
              }
              return
            }
            
            // Warping scale with noise-like variation
            const baseScale = 1 + elapsed * 3
            const warp = Math.sin(elapsed * 10) * 0.2
            ripple.scale.set(baseScale + warp, baseScale - warp * 0.5, 1)
            
            // Fade out
            rippleMaterial.opacity = 0.6 * (1 - elapsed / 0.8)
            
            animationFrameRef.current = requestAnimationFrame(animateRipple)
          }
          animateRipple()
        }
        
        document.body.style.cursor = 'pointer'
      } else {
        if (hoveredId) {
          if (hoverRippleRef.current) {
            globe.remove(hoverRippleRef.current)
            hoverRippleRef.current.geometry.dispose()
            ;(hoverRippleRef.current.material as THREE.Material).dispose()
            hoverRippleRef.current = null
          }
        }
        setHoveredId(null)
        document.body.style.cursor = 'default'
      }
    }

    // Handle click interactions
    const handleClick = (event: MouseEvent) => {
      if (!onPresenceClick) return

      mouseRef.current.x = (event.clientX / window.innerWidth) * 2 - 1
      mouseRef.current.y = -(event.clientY / window.innerHeight) * 2 + 1

      const scene = globe.parent as THREE.Scene
      if (!scene) return
      
      const camera = scene.children.find(child => child instanceof THREE.PerspectiveCamera) as THREE.Camera
      if (!camera) return

      raycasterRef.current.setFromCamera(mouseRef.current, camera)
      const intersects = raycasterRef.current.intersectObjects(Array.from(existingPoints.values()))
      
      if (intersects.length > 0) {
        const clickedPoint = intersects[0].object as THREE.Mesh
        const presence = clickedPoint.userData.presence as Presence
        const isClickable = clickedPoint.userData.isClickable as boolean
        
        // Only trigger click if user is online (clickable)
        if (isClickable) {
          console.log('Presence clicked!', presence)
          onPresenceClick(presence)
        } else {
          console.log('Offline user clicked - ignoring')
        }
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('click', handleClick)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('click', handleClick)
      document.body.style.cursor = 'default'
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (hoverRippleRef.current) {
        globe.remove(hoverRippleRef.current)
        hoverRippleRef.current.geometry.dispose()
        ;(hoverRippleRef.current.material as THREE.Material).dispose()
        hoverRippleRef.current = null
      }
    }

    // Continuous breathing animation for active dots
    const animateBreathing = () => {
      const time = Date.now() * 0.001
      const breathe = 0.85 + Math.sin(time * 1.5) * 0.15 // Subtle breathing 0.7-1.0

      existingPoints.forEach((point, id) => {
        const presence = point.userData.presence as Presence
        if (!presence || !presence.is_online) return

        const material = point.material as THREE.MeshStandardMaterial
        if ('emissiveIntensity' in material) {
          // Breathing glow effect
          material.emissiveIntensity = 1.5 + breathe * 0.8
        }
      })

      breathingAnimationRef.current = requestAnimationFrame(animateBreathing)
    }

    breathingAnimationRef.current = requestAnimationFrame(animateBreathing)

    return () => {
      cancelAnimationFrame(breathingAnimationRef.current)
    }
  }, [globe, presences, onPresenceClick, hoveredId])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      pointsRef.current.forEach((point) => {
        if (globe) {
          globe.remove(point)
        }
        point.geometry.dispose()
        if (point.material instanceof THREE.Material) {
          point.material.dispose()
        }
      })
      pointsRef.current.clear()
    }
  }, [globe])

  return null // This component doesn't render DOM elements
}