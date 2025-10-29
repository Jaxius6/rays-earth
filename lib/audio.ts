/**
 * Audio management for rays.earth using Web Audio API
 * Handles mobile gesture unlock and sound generation
 */

let audioContext: AudioContext | null = null
let isUnlocked = false
let bongClickCount = 0
let lastBongTime = 0

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
 * Generate and play soft "woosh" hover sound - organic and gentle
 */
export function playHoverSound() {
  if (!isUnlocked || !audioContext) return

  try {
    const ctx = audioContext!
    const now = ctx.currentTime

    // Create a soft woosh using filtered noise
    const osc = ctx.createOscillator()
    const gainNode = ctx.createGain()
    const filter = ctx.createBiquadFilter()

    // Sweep from low to high for "woosh" effect
    osc.type = 'sine'
    osc.frequency.setValueAtTime(150, now)
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.15)

    // Low-pass filter for softness
    filter.type = 'lowpass'
    filter.frequency.value = 1200
    filter.Q.value = 0.5

    osc.connect(filter)
    filter.connect(gainNode)
    gainNode.connect(ctx.destination)

    // Very gentle envelope - quiet woosh
    gainNode.gain.setValueAtTime(0, now)
    gainNode.gain.linearRampToValueAtTime(0.008, now + 0.03) // Very quiet
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15)

    osc.start(now)
    osc.stop(now + 0.15)
  } catch (error) {
    console.warn('Failed to play hover sound:', error)
  }
}

/**
 * Generate and play ethereal hum during arc travel - QUIETER
 */
export function playArcHum() {
  if (!isUnlocked || !audioContext) return
  
  try {
    const ctx = audioContext!
    const now = ctx.currentTime
    
    // Deep ethereal drone with subtle movement
    const fundamental = 110 // A2 - very low, grounding
    
    // Create warm pad-like sound with multiple oscillators - REDUCED VOLUME
    const oscillators = [
      { freq: fundamental, detune: 0, gain: 0.06 }, // Was 0.15
      { freq: fundamental * 1.5, detune: -5, gain: 0.03 }, // Was 0.08
      { freq: fundamental * 2, detune: 3, gain: 0.02 }, // Was 0.06
      { freq: fundamental * 3, detune: -2, gain: 0.01 }, // Was 0.03
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
 * Generate and play soulful bong - SINGLE, QUIETER, with harmonization
 */
export function playBong() {
  if (!isUnlocked || !audioContext) return
  
  try {
    const ctx = audioContext!
    const now = ctx.currentTime
    
    // Reset counter after 5 seconds of no bongs
    if (Date.now() - lastBongTime > 5000) {
      bongClickCount = 0
    }
    bongClickCount++
    lastBongTime = Date.now()
    
    // Extended harmonic progression - lower start, higher end
    const baseFreqs = [
      110, // A2 - very low
      147, // D3
      165, // E3
      196, // G3
      220, // A3
      247, // B3
      294, // D4
      330, // E4
      392, // G4
      440  // A4 - high
    ]
    const freqIndex = Math.min(bongClickCount - 1, baseFreqs.length - 1)
    const fundamental = baseFreqs[freqIndex]
    
    // SINGLE oscillator for clean, pure sound - MUCH QUIETER
    const osc = ctx.createOscillator()
    const gainNode = ctx.createGain()
    
    // Sine wave for pure, calming tone
    osc.type = 'sine'
    osc.frequency.value = fundamental
    
    osc.connect(gainNode)
    gainNode.connect(ctx.destination)
    
    // Gentle attack, medium sustain - QUIETER (was 0.25)
    gainNode.gain.setValueAtTime(0, now)
    gainNode.gain.linearRampToValueAtTime(0.12, now + 0.05)
    gainNode.gain.exponentialRampToValueAtTime(0.04, now + 0.6)
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.5)
    
    osc.start(now)
    osc.stop(now + 1.5)
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