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
  const glowsRef = useRef<Map<string, THREE.Mesh>>(new Map())
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
    const existingGlows = glowsRef.current

    // Update or create points for each presence
    presences.forEach((presence) => {
      const decay = calculateDecay(presence.last_active, presence.is_online)

      // Remove fully faded presences
      if (decay <= 0) {
        const point = existingPoints.get(presence.id)
        const glow = existingGlows.get(presence.id)
        if (point) {
          globe.remove(point)
          existingPoints.delete(presence.id)
        }
        if (glow) {
          globe.remove(glow)
          glow.geometry.dispose()
          ;(glow.material as THREE.Material).dispose()
          existingGlows.delete(presence.id)
        }
        return
      }

      let point = existingPoints.get(presence.id)
      let glow = existingGlows.get(presence.id)

      // Create new point if doesn't exist
      if (!point) {
        const position = latLngToVector3(presence.lat, presence.lng, globeRadius)

        // Core dot - solid white
        const size = presence.is_online ? 0.6 : 0.5
        const geometry = new THREE.SphereGeometry(size, 16, 16)
        const material = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: presence.is_online ? decay : 0.1,
        })

        point = new THREE.Mesh(geometry, material)
        point.position.set(position.x, position.y, position.z)
        point.userData = {
          presence,
          isClickable: presence.is_online,
          startTime: Date.now(),
          targetScale: 1.0,
          currentScale: 1.0
        }

        globe.add(point)
        existingPoints.set(presence.id, point)

        // Glow sphere - larger, additive blending, ONLY for online users
        if (presence.is_online) {
          const glowSize = size * 3.0 // 3x larger than core
          const glowGeometry = new THREE.SphereGeometry(glowSize, 16, 16)
          const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending, // KEY: Additive blending for visible glow
            depthWrite: false,
          })

          glow = new THREE.Mesh(glowGeometry, glowMaterial)
          glow.position.set(position.x, position.y, position.z)
          globe.add(glow)
          existingGlows.set(presence.id, glow)
        }
      } else {
        // Update existing point
        const material = point.material as THREE.MeshBasicMaterial

        // Online users: full decay, Offline users: 10% max, fading to 0%
        let finalOpacity = presence.is_online ? decay : Math.max(0, 0.1 * decay)

        material.opacity = finalOpacity
        material.color.setHex(0xffffff) // Always white

        point.userData = {
          ...point.userData,
          presence,
          isClickable: presence.is_online
        }

        // Update glow opacity
        if (glow) {
          const glowMaterial = glow.material as THREE.MeshBasicMaterial
          glowMaterial.opacity = 0.6 * decay
        }

        // Scale handled by pulsing animation - don't reset here
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

        // Also remove glow
        const glow = existingGlows.get(id)
        if (glow) {
          globe.remove(glow)
          glow.geometry.dispose()
          ;(glow.material as THREE.Material).dispose()
          existingGlows.delete(id)
        }
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

    return () => {
      // Cleanup will happen in separate effect
    }
  }, [globe, presences, onPresenceClick, hoveredId])

  // SEPARATE effect for continuous rhythmic glow pulse - runs independently
  useEffect(() => {
    if (!globe) return

    const existingPoints = pointsRef.current
    const existingGlows = glowsRef.current
    let animationId: number

    const animateGlowPulse = () => {
      const time = Date.now() * 0.001
      // Simple rhythmic pulse - smooth sine wave
      const pulse = Math.sin(time * 1.5) * 0.5 + 0.5 // 0 to 1, ~1.5 second cycle

      existingPoints.forEach((point, id) => {
        const presence = point.userData.presence as Presence
        if (!presence) return

        const glow = existingGlows.get(id)
        const isHovered = hoveredId === presence.id

        if (presence.is_online) {
          // Set target scale based on hover state - LARGER on hover
          const targetScale = isHovered ? 1.7 : 1.0

          // Initialize currentScale if not set
          if (!point.userData.currentScale) {
            point.userData.currentScale = 1.0
          }

          // Faster smooth lerp towards target scale (0.25 = faster lerp)
          point.userData.currentScale += (targetScale - point.userData.currentScale) * 0.25
          const s = point.userData.currentScale
          point.scale.set(s, s, s)

          // Glow sphere pulsates
          if (glow) {
            const glowMaterial = glow.material as THREE.MeshBasicMaterial

            if (isHovered) {
              // Hovered: bright constant glow (no pulsing), sync scale with dot
              glow.scale.set(s, s, s)
              glowMaterial.opacity = 0.9
            } else {
              // Not hovered: glow pulses rhythmically
              glow.scale.set(1.0, 1.0, 1.0)
              glowMaterial.opacity = 0.3 + pulse * 0.6 // 0.3 to 0.9
            }
          }
        } else {
          // Offline dots: static, smaller, no glow
          point.scale.set(0.6, 0.6, 0.6)
        }
      })

      animationId = requestAnimationFrame(animateGlowPulse)
    }

    // Start animation loop
    animationId = requestAnimationFrame(animateGlowPulse)
    console.log('Rhythmic glow pulse animation started')

    return () => {
      console.log('Rhythmic glow pulse animation stopped')
      cancelAnimationFrame(animationId)
    }
  }, [globe, hoveredId])

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

      glowsRef.current.forEach((glow) => {
        if (globe) {
          globe.remove(glow)
        }
        glow.geometry.dispose()
        if (glow.material instanceof THREE.Material) {
          glow.material.dispose()
        }
      })
      glowsRef.current.clear()
    }
  }, [globe])

  return null // This component doesn't render DOM elements
}