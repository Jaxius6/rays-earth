'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import gsap from 'gsap'

interface GlobeCanvasProps {
  onGlobeReady?: (globe: THREE.Group, controls: { centerOn: (lat: number, lng: number) => void }) => void
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

    // Camera setup - adjust for mobile
    const isMobile = width < 768
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000)
    camera.position.z = isMobile ? 400 : 300 // Further away on mobile for better view
    cameraRef.current = camera
    scene.add(camera) // ADD CAMERA TO SCENE - CRITICAL!

    // Renderer setup with higher quality settings
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3)) // Higher pixel ratio for sharper rendering
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.2
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Create globe group (will contain Earth AND stars)
    const globeGroup = new THREE.Group()
    
    // Enhanced starfield with varying sizes and subtle color
    const starsGeometry = new THREE.BufferGeometry()
    const starCount = 5000 // More stars for denser field
    const positions = new Float32Array(starCount * 3)
    const sizes = new Float32Array(starCount)
    const colors = new Float32Array(starCount * 3)

    for (let i = 0; i < starCount; i++) {
      // Random position in sphere - closer and within camera range
      const radius = 400 + Math.random() * 400 // 400-800 units away
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(Math.random() * 2 - 1)

      const i3 = i * 3
      positions[i3] = radius * Math.sin(phi) * Math.cos(theta)
      positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
      positions[i3 + 2] = radius * Math.cos(phi)

      // Varied star sizes - some tiny, some larger
      sizes[i] = Math.random() * 3 + 0.5 // 0.5-3.5 size range

      // Subtle warm/cool color variation
      const temp = Math.random()
      if (temp > 0.95) {
        // 5% blue-white stars
        colors[i3] = 0.9 + Math.random() * 0.1
        colors[i3 + 1] = 0.95 + Math.random() * 0.05
        colors[i3 + 2] = 1.0
      } else if (temp < 0.05) {
        // 5% warm orange stars
        colors[i3] = 1.0
        colors[i3 + 1] = 0.8 + Math.random() * 0.2
        colors[i3 + 2] = 0.7 + Math.random() * 0.2
      } else {
        // 90% white stars
        colors[i3] = 1.0
        colors[i3 + 1] = 1.0
        colors[i3 + 2] = 1.0
      }
    }

    starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    starsGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
    starsGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const starsMaterial = new THREE.PointsMaterial({
      size: 1.5,
      transparent: true,
      opacity: 1.0,
      sizeAttenuation: true, // Stars get smaller with distance
      vertexColors: true, // Use individual star colors
      blending: THREE.AdditiveBlending, // Additive blending for glow effect
    })

    const stars = new THREE.Points(starsGeometry, starsMaterial)
    globeGroup.add(stars) // Add to globe group so they rotate together
    
    // Create sphere geometry (Earth) with ULTRA high polygon count for maximum smoothness
    const geometry = new THREE.SphereGeometry(100, 256, 256) // Double the resolution!
    
    // Start with grey, then load texture - using StandardMaterial for better lighting
    const material = new THREE.MeshStandardMaterial({
      color: 0x444444,
      emissive: 0x111111,
      emissiveIntensity: 0.2,
      roughness: 0.9,
      metalness: 0.1,
    })

    // Load high-quality Earth textures asynchronously
    const textureLoader = new THREE.TextureLoader()

    // Main color texture - use 8k Blue Marble
    textureLoader.load(
      'https://unpkg.com/three-globe@2.31.1/example/img/earth-blue-marble.jpg',
      (texture) => {
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy() // Max quality filtering

        // Convert to greyscale with high contrast and detail
        material.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            `
            #ifdef USE_MAP
              vec4 sampledDiffuseColor = texture2D( map, vMapUv );
              float grey = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));
              // Enhanced contrast and brightness
              grey = pow(grey, 0.85) * 4.0; // Gamma correction + boost
              diffuseColor *= vec4(vec3(grey), sampledDiffuseColor.a);
            #endif
            `
          )
        }
        material.map = texture
        material.needsUpdate = true
      }
    )

    // Bump map for surface detail
    textureLoader.load(
      'https://unpkg.com/three-globe@2.31.1/example/img/earth-topology.png',
      (bumpTexture) => {
        bumpTexture.anisotropy = renderer.capabilities.getMaxAnisotropy()
        material.bumpMap = bumpTexture
        material.bumpScale = 0.8 // Subtle surface detail
        material.needsUpdate = true
      }
    )

    const sphere = new THREE.Mesh(geometry, material)
    globeGroup.add(sphere)

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0)
    directionalLight.position.set(5, 3, 5)
    scene.add(directionalLight)

    scene.add(globeGroup)
    globeRef.current = globeGroup

    // Controls state
    let isDragging = false
    let previousMousePosition = { x: 0, y: 0 }
    let rotation = { x: 0, y: 0 }
    let targetRotation = { x: 0, y: 0 }
    let lastInteractionTime = Date.now()
    let isAutoRotating = false
    const autoRotateSpeed = 0.0005 // Slower auto-rotate
    const INACTIVITY_DELAY = 5000 // 5 seconds

    // Zoom limits - prevent going behind stars (stars at 400-800 range)
    const minZoom = 200
    const maxZoom = 380 // Keep well in front of stars

    // Function to center camera on specific coordinates - USER'S POINT DEAD CENTER
    const centerOn = (lat: number, lng: number) => {
      // Convert lat/lng to rotation angles
      // Globe rotates OPPOSITE to bring point forward
      const targetY = -lng * (Math.PI / 180)  // Longitude: rotate opposite direction
      const targetX = -lat * (Math.PI / 180)  // Latitude: tilt opposite direction
      
      console.log(`Centering on user location: ${lat}, ${lng}`)
      
      // Smoothly animate to target
      gsap.to(targetRotation, {
        x: targetX,
        y: targetY,
        duration: 2.5,
        ease: 'power2.inOut',
        onStart: () => {
          console.log('Starting center animation')
        },
        onComplete: () => {
          console.log('Center animation complete - user location is now dead center')
          // Reset timer after centering animation completes
          lastInteractionTime = Date.now()
        }
      })
    }

    // Notify parent that globe is ready with controls
    if (onGlobeReady) {
      onGlobeReady(globeGroup, { centerOn })
    }

    // Mouse/touch controls
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      isDragging = true
      lastInteractionTime = Date.now()
      isAutoRotating = false
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
      previousMousePosition = { x: clientX, y: clientY }
    }

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return

      lastInteractionTime = Date.now()
      isAutoRotating = false
      
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY

      const deltaX = clientX - previousMousePosition.x
      const deltaY = clientY - previousMousePosition.y

      // Slower, heavier rotation for massive globe feel
      targetRotation.y += deltaX * 0.002
      targetRotation.x += deltaY * 0.002
      targetRotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, targetRotation.x))

      previousMousePosition = { x: clientX, y: clientY }
    }

    const handlePointerUp = () => {
      isDragging = false
      lastInteractionTime = Date.now()
    }

    // Handle zoom with mouse wheel - very subtle and smooth
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      lastInteractionTime = Date.now()
      isAutoRotating = false

      const zoomSpeed = 0.15 // Much slower, more subtle
      const delta = e.deltaY * zoomSpeed

      camera.position.z = Math.max(minZoom, Math.min(maxZoom, camera.position.z + delta))
    }

    // Add event listeners
    container.addEventListener('mousedown', handlePointerDown)
    container.addEventListener('mousemove', handlePointerMove)
    container.addEventListener('mouseup', handlePointerUp)
    container.addEventListener('touchstart', handlePointerDown, { passive: true })
    container.addEventListener('touchmove', handlePointerMove, { passive: true })
    container.addEventListener('touchend', handlePointerUp)
    container.addEventListener('wheel', handleWheel, { passive: false })

    // Animation loop
    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate)

      // Smooth rotation with damping
      rotation.x += (targetRotation.x - rotation.x) * 0.1
      rotation.y += (targetRotation.y - rotation.y) * 0.1

      // Auto-rotate only after 5 seconds of inactivity
      const timeSinceInteraction = Date.now() - lastInteractionTime
      if (!isDragging && timeSinceInteraction > INACTIVITY_DELAY) {
        if (!isAutoRotating) {
          isAutoRotating = true
        }
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
      container.removeEventListener('wheel', handleWheel)
      
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