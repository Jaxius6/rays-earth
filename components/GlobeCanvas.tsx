'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import ThreeGlobe from 'three-globe'

interface GlobeCanvasProps {
  onGlobeReady?: (globe: any) => void
}

/**
 * Three.js canvas component rendering the 3D Earth
 * No borders, labels, or UI chrome - just the globe
 */
export default function GlobeCanvas({ onGlobeReady }: GlobeCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const globeRef = useRef<any>(null)
  const frameIdRef = useRef<number>(0)

  useEffect(() => {
    if (!mountRef.current) return

    const container = mountRef.current
    const width = window.innerWidth
    const height = window.innerHeight

    // Scene setup
    const scene = new THREE.Scene()
    sceneRef.current = scene

    // Camera setup
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000)
    camera.position.z = 300
    cameraRef.current = camera

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Globe setup
    const globe = new ThreeGlobe()
      .globeImageUrl('//unpkg.com/three-globe/example/img/earth-dark.jpg')
      .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
      .showAtmosphere(false)
      .showGraticules(false)

    // Convert globe to greyscale
    globe.onGlobeReady(() => {
      const globeMaterial = globe.children[0].material as THREE.MeshPhongMaterial
      if (globeMaterial.map) {
        // Create greyscale shader
        const originalMap = globeMaterial.map
        globeMaterial.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            `
            #ifdef USE_MAP
              vec4 sampledDiffuseColor = texture2D( map, vUv );
              float grey = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));
              diffuseColor *= vec4(vec3(grey * 0.4), sampledDiffuseColor.a);
            #endif
            `
          )
        }
      }
    })

    scene.add(globe)
    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    scene.add(new THREE.DirectionalLight(0xffffff, 0.4))

    globeRef.current = globe

    // Notify parent that globe is ready
    if (onGlobeReady) {
      onGlobeReady(globe)
    }

    // Controls state
    let isDragging = false
    let previousMousePosition = { x: 0, y: 0 }
    let rotation = { x: 0, y: 0 }
    let targetRotation = { x: 0, y: 0 }
    let autoRotateSpeed = 0.0005

    // Mouse/touch controls
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      isDragging = true
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
      previousMousePosition = { x: clientX, y: clientY }
    }

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY

      const deltaX = clientX - previousMousePosition.x
      const deltaY = clientY - previousMousePosition.y

      targetRotation.y += deltaX * 0.005
      targetRotation.x += deltaY * 0.005
      targetRotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, targetRotation.x))

      previousMousePosition = { x: clientX, y: clientY }
    }

    const handlePointerUp = () => {
      isDragging = false
    }

    // Add event listeners
    container.addEventListener('mousedown', handlePointerDown)
    container.addEventListener('mousemove', handlePointerMove)
    container.addEventListener('mouseup', handlePointerUp)
    container.addEventListener('touchstart', handlePointerDown)
    container.addEventListener('touchmove', handlePointerMove)
    container.addEventListener('touchend', handlePointerUp)

    // Animation loop
    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate)

      // Smooth rotation with damping
      rotation.x += (targetRotation.x - rotation.x) * 0.1
      rotation.y += (targetRotation.y - rotation.y) * 0.1

      // Gentle auto-rotate when not dragging
      if (!isDragging) {
        targetRotation.y += autoRotateSpeed
      }

      globe.rotation.x = rotation.x
      globe.rotation.y = rotation.y

      renderer.render(scene, camera)
    }
    animate()

    // Handle resize
    const handleResize = () => {
      const width = window.innerWidth
      const height = window.innerHeight

      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }
    window.addEventListener('resize', handleResize)

    // Cleanup
    return () => {
      cancelAnimationFrame(frameIdRef.current)
      window.removeEventListener('resize', handleResize)
      container.removeEventListener('mousedown', handlePointerDown)
      container.removeEventListener('mousemove', handlePointerMove)
      container.removeEventListener('mouseup', handlePointerUp)
      container.removeEventListener('touchstart', handlePointerDown)
      container.removeEventListener('touchmove', handlePointerMove)
      container.removeEventListener('touchend', handlePointerUp)
      
      if (renderer) {
        renderer.dispose()
        container.removeChild(renderer.domElement)
      }
    }
  }, [onGlobeReady])

  return (
    <div
      ref={mountRef}
      className="fixed inset-0 w-full h-full"
      style={{ touchAction: 'none' }}
    />
  )
}