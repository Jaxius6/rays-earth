/**
 * Audio management for rays.earth using Web Audio API
 * Handles mobile gesture unlock and sound generation
 */

let audioContext: AudioContext | null = null
let isUnlocked = false

/**
 * Initialize audio system
 */
export function initializeAudio() {
  if (typeof window === 'undefined') return
  
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
  if (AudioContextClass && !audioContext) {
    audioContext = new AudioContextClass()
  }
}

/**
 * Unlock audio context on user gesture (required for mobile)
 */
export function unlockAudio(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)
  
  return new Promise((resolve) => {
    if (isUnlocked) {
      resolve(true)
      return
    }

    // Create AudioContext if needed
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      if (AudioContextClass) {
        audioContext = new AudioContextClass()
      }
    }

    // Resume AudioContext on mobile
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume().then(() => {
        isUnlocked = true
        resolve(true)
      }).catch(() => {
        resolve(false)
      })
    } else {
      isUnlocked = true
      resolve(true)
    }
  })
}

/**
 * Generate and play ripple sound effect - soft percussive click
 */
export function playRipple() {
  if (!isUnlocked || !audioContext) return
  
  try {
    const now = audioContext.currentTime
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    
    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)
    
    // Soft click sound
    oscillator.frequency.value = 800
    oscillator.type = 'sine'
    
    // Quick fade out
    gainNode.gain.setValueAtTime(0.15, now)
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1)
    
    oscillator.start(now)
    oscillator.stop(now + 0.1)
  } catch (error) {
    console.warn('Failed to play ripple sound:', error)
  }
}

/**
 * Generate and play ping sound effect - warm tone
 */
export function playPing() {
  if (!isUnlocked || !audioContext) return
  
  try {
    const now = audioContext.currentTime
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    
    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)
    
    // Warm C note (523 Hz)
    oscillator.frequency.value = 523
    oscillator.type = 'sine'
    
    // Gentle fade in and out
    gainNode.gain.setValueAtTime(0, now)
    gainNode.gain.linearRampToValueAtTime(0.2, now + 0.05)
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
    
    oscillator.start(now)
    oscillator.stop(now + 0.3)
  } catch (error) {
    console.warn('Failed to play ping sound:', error)
  }
}

/**
 * Check if audio is unlocked
 */
export function isAudioUnlocked(): boolean {
  return isUnlocked
}

/**
 * Set audio volumes (0-1 range) - Not applicable for Web Audio API generated sounds
 */
export function setVolume(rippleVol: number, pingVol: number) {
  // Web Audio API sounds are generated on-the-fly, no persistent volume control needed
}

/**
 * Stop all sounds - Not applicable for Web Audio API generated sounds
 */
export function stopAllSounds() {
  // Web Audio API sounds are short-lived and stop automatically
}

/**
 * Cleanup audio resources
 */
export function cleanupAudio() {
  if (audioContext) {
    audioContext.close()
    audioContext = null
  }
  isUnlocked = false
}