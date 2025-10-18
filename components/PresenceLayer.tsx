'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { Presence } from '@/lib/supabase-browser'
import { calculateDecay, latLngToVector3 } from '@/lib/geo'

interface PresenceLayerProps {
  globe: any
  presences: Presence[]
  onPresenceClick?: (presence: Presence) => void
}

/**
 * Manages rendering of presence dots on the globe
 * Handles brightness decay and click interactions
 */
export default function PresenceLayer({ globe, presences, onPresenceClick }: PresenceLayerProps) {
  const pointsRef = useRef<Map<string, THREE.Mesh>>(new Map())
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster())
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2())

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
        const position = latLngToVector3(presence.lat, presence.lng, globeRadius)
        
        // Create point geometry
        const geometry = new THREE.SphereGeometry(0.5, 16, 16)
        
        // Different material for online vs offline
        const material = new THREE.MeshBasicMaterial({
          color: presence.is_online ? 0xffffff : 0xffb300,
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
        material.color.setHex(presence.is_online ? 0xffffff : 0xffb300)
        point.userData = { presence }
      }
    })

    // Remove points that no longer exist in presences
    existingPoints.forEach((point, id) => {
      if (!presences.find(p => p.id === id)) {
        globe.remove(point)
        existingPoints.delete(id)
      }
    })

    // Handle click interactions
    const handleClick = (event: MouseEvent) => {
      if (!onPresenceClick) return

      // Calculate mouse position in normalized device coordinates
      mouseRef.current.x = (event.clientX / window.innerWidth) * 2 - 1
      mouseRef.current.y = -(event.clientY / window.innerHeight) * 2 + 1

      // Find camera from globe's parent scene
      const scene = globe.parent
      if (!scene) return
      
      const camera = scene.children.find((child: any) => child.isCamera)
      if (!camera) return

      // Raycast to find clicked presence
      raycasterRef.current.setFromCamera(mouseRef.current, camera as THREE.Camera)
      
      const intersects = raycasterRef.current.intersectObjects(Array.from(existingPoints.values()))
      
      if (intersects.length > 0) {
        const clickedPoint = intersects[0].object as THREE.Mesh
        const presence = clickedPoint.userData.presence as Presence
        onPresenceClick(presence)
      }
    }

    window.addEventListener('click', handleClick)

    return () => {
      window.removeEventListener('click', handleClick)
    }
  }, [globe, presences, onPresenceClick])

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