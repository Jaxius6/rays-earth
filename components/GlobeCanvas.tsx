'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

interface GlobeCanvasProps {
  onGlobeReady?: (globe: THREE.Group) => void
}

/**
 * Three.js canvas component rendering the 3D Earth
 * Pure Three.js implementation - no external globe library
 */
export default function GlobeCanvas({ onGlobeReady }: GlobeCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const globeRef = useRef<THREE.Group | null>(null)
  const frameIdRef = useRef<number>(0)

  useEffect(() => {
    if (!mountRef.current) return

    const container = mountRef.current
    const width = window.innerWidth
    const height = window.innerHeight

    // Scene setup
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000000)
    sceneRef.current = scene

    // Camera setup
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000)
    camera.position.z = 300
    cameraRef.current = camera
    scene.add(camera) // ADD CAMERA TO SCENE - CRITICAL!

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Create globe group (will contain Earth AND stars)
    const globeGroup = new THREE.Group()
    
    // Add subtle starfield that rotates with globe
    const starsGeometry = new THREE.BufferGeometry()
    const starCount = 3000
    const positions = new Float32Array(starCount * 3)
    
    for (let i = 0; i < starCount * 3; i += 3) {
      // Random position in sphere - closer and within camera range
      const radius = 400 + Math.random() * 300 // 400-700 units away
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(Math.random() * 2 - 1)
      
      positions[i] = radius * Math.sin(phi) * Math.cos(theta)
      positions[i + 1] = radius * Math.sin(phi) * Math.sin(theta)
      positions[i + 2] = radius * Math.cos(phi)
    }
    
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const starsMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.8, // Smaller, more subtle stars
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: false,
    })
    
    const stars = new THREE.Points(starsGeometry, starsMaterial)
    globeGroup.add(stars) // Add to globe group so they rotate together
    
    // Create sphere geometry (Earth)
    const geometry = new THREE.SphereGeometry(100, 48, 48)
    
    // Start with grey, then load texture
    const material = new THREE.MeshPhongMaterial({
      color: 0x444444,
      emissive: 0x111111,
      shininess: 5,
    })

    // Load Earth texture asynchronously (won't block initial render)
    const textureLoader = new THREE.TextureLoader()
    textureLoader.load(
      'https://unpkg.com/three-globe@2.31.1/example/img/earth-blue-marble.jpg',
      (texture) => {
        // Convert to greyscale with very clear details
        material.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            `
            #ifdef USE_MAP
              vec4 sampledDiffuseColor = texture2D( map, vMapUv );
              float grey = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));
              diffuseColor *= vec4(vec3(grey * 0.9), sampledDiffuseColor.a);
            #endif
            `
          )
        }
        material.map = texture
        material.needsUpdate = true
      }
    )

    const sphere = new THREE.Mesh(geometry, material)
    globeGroup.add(sphere)

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    scene.add(ambientLight)
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4)
    directionalLight.position.set(5, 3, 5)
    scene.add(directionalLight)

    scene.add(globeGroup)
    globeRef.current = globeGroup

    // Notify parent that globe is ready
    if (onGlobeReady) {
      onGlobeReady(globeGroup)
    }

    // Controls state
    let isDragging = false
    let previousMousePosition = { x: 0, y: 0 }
    let rotation = { x: 0, y: 0 }
    let targetRotation = { x: 0, y: 0 }
    const autoRotateSpeed = 0.001

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
    container.addEventListener('touchstart', handlePointerDown, { passive: true })
    container.addEventListener('touchmove', handlePointerMove, { passive: true })
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

      globeGroup.rotation.x = rotation.x
      globeGroup.rotation.y = rotation.y

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
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement)
        }
      }
      
      geometry.dispose()
      material.dispose()
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