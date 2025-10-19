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
 * Generate and play ripple sound effect - euphoric, crystalline chime
 */
export function playRipple() {
  if (!isUnlocked || !audioContext) return
  
  try {
    const now = audioContext.currentTime
    
    // Create layered harmonics for ethereal quality
    const frequencies = [880, 1320, 1760] // A5, E6, A6 - perfect fifth harmony
    
    frequencies.forEach((freq, index) => {
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()
      
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      
      oscillator.frequency.value = freq
      oscillator.type = 'sine'
      
      // Cascading volume for depth
      const volume = 0.08 * (1 - index * 0.3)
      gainNode.gain.setValueAtTime(0, now)
      gainNode.gain.linearRampToValueAtTime(volume, now + 0.02)
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.4)
      
      oscillator.start(now)
      oscillator.stop(now + 0.4)
    })
  } catch (error) {
    console.warn('Failed to play ripple sound:', error)
  }
}

/**
 * Generate and play ping sound effect - warm, resonant bell tone
 */
export function playPing() {
  if (!isUnlocked || !audioContext) return
  
  try {
    const now = audioContext.currentTime
    
    // Create bell-like sound with harmonics
    const fundamental = 523 // C5
    const harmonics = [
      { freq: fundamental, gain: 0.15 },
      { freq: fundamental * 2, gain: 0.08 }, // Octave
      { freq: fundamental * 3, gain: 0.04 }, // Perfect fifth
      { freq: fundamental * 4, gain: 0.02 }, // Two octaves
    ]
    
    harmonics.forEach(({ freq, gain }) => {
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()
      
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      
      oscillator.frequency.value = freq
      oscillator.type = 'sine'
      
      // Bell envelope - quick attack, long decay
      gainNode.gain.setValueAtTime(0, now)
      gainNode.gain.linearRampToValueAtTime(gain, now + 0.01)
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.8)
      
      oscillator.start(now)
      oscillator.stop(now + 0.8)
    })
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