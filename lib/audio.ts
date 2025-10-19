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
 * Generate and play ethereal hum during arc travel
 */
export function playArcHum() {
  if (!isUnlocked || !audioContext) return
  
  try {
    const ctx = audioContext!
    const now = ctx.currentTime
    
    // Deep ethereal drone with subtle movement
    const fundamental = 110 // A2 - very low, grounding
    
    // Create warm pad-like sound with multiple oscillators
    const oscillators = [
      { freq: fundamental, detune: 0, gain: 0.15 },
      { freq: fundamental * 1.5, detune: -5, gain: 0.08 }, // Perfect fifth
      { freq: fundamental * 2, detune: 3, gain: 0.06 }, // Octave
      { freq: fundamental * 3, detune: -2, gain: 0.03 }, // Two octaves + fifth
    ]
    
    oscillators.forEach(({ freq, detune, gain }) => {
      const osc = ctx.createOscillator()
      const gainNode = ctx.createGain()
      
      // Use triangle wave for warm, organic quality
      osc.type = 'triangle'
      osc.frequency.value = freq
      osc.detune.value = detune
      
      osc.connect(gainNode)
      gainNode.connect(ctx.destination)
      
      // Slow fade in and out
      gainNode.gain.setValueAtTime(0, now)
      gainNode.gain.linearRampToValueAtTime(gain, now + 0.3)
      gainNode.gain.setValueAtTime(gain, now + 4.7)
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 5.0)
      
      osc.start(now)
      osc.stop(now + 5.0)
    })
  } catch (error) {
    console.warn('Failed to play arc hum:', error)
  }
}

/**
 * Generate and play soulful bong - deep, warm, calming tone
 */
export function playBong() {
  if (!isUnlocked || !audioContext) return
  
  try {
    const ctx = audioContext!
    const now = ctx.currentTime
    
    // Deep singing bowl / temple bell sound
    const fundamental = 196 // G3 - warm, grounding
    
    // Fewer harmonics for cleaner, more soulful sound
    const partials = [
      { freq: fundamental, gain: 0.25 },
      { freq: fundamental * 2.4, gain: 0.12 }, // Slightly detuned for character
      { freq: fundamental * 3.8, gain: 0.06 }, // More organic intervals
    ]
    
    partials.forEach(({ freq, gain }) => {
      const osc = ctx.createOscillator()
      const gainNode = ctx.createGain()
      
      // Sine wave for pure, calming tone
      osc.type = 'sine'
      osc.frequency.value = freq
      
      osc.connect(gainNode)
      gainNode.connect(ctx.destination)
      
      // Gentle attack, long sustain - like a singing bowl
      gainNode.gain.setValueAtTime(0, now)
      gainNode.gain.linearRampToValueAtTime(gain, now + 0.05)
      gainNode.gain.exponentialRampToValueAtTime(gain * 0.3, now + 0.8)
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 2.5)
      
      osc.start(now)
      osc.stop(now + 2.5)
    })
  } catch (error) {
    console.warn('Failed to play bong:', error)
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