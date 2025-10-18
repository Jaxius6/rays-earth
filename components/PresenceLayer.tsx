'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { Presence } from '@/lib/supabase-browser'
import { calculateDecay, latLngToVector3 } from '@/lib/geo'

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
        
        // Create point geometry
        const geometry = new THREE.SphereGeometry(1.5, 16, 16)
        
        // Different color for online vs offline
        const color = presence.is_online ? 0xffffff : 0xffb300
        const material = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: decay,
        })
        
        point = new THREE.Mesh(geometry, material)
        point.position.set(position.x, position.y, position.z)
        point.userData = { presence }
        
        globe.add(point)
        existingPoints.set(presence.id, point)
      } else {
        // Update existing point
        const material = point.material as THREE.MeshBasicMaterial
        material.opacity = decay
        const color = presence.is_online ? 0xffffff : 0xffb300
        material.color.setHex(color)
        point.userData = { presence }
        
        // Apply hover effect
        const isHovered = hoveredId === presence.id
        point.scale.set(isHovered ? 1.5 : 1, isHovered ? 1.5 : 1, isHovered ? 1.5 : 1)
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
        setHoveredId(presence.id)
        document.body.style.cursor = 'pointer'
      } else {
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
        console.log('Presence clicked!', presence)
        onPresenceClick(presence)
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('click', handleClick)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('click', handleClick)
      document.body.style.cursor = 'default'
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