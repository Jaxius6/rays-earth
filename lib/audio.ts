/**
 * Audio management for rays.earth using Howler.js
 * Handles mobile gesture unlock and sound playback
 */

import { Howl } from 'howler'

let audioContext: AudioContext | null = null
let isUnlocked = false

// Sound instances
let rippleSound: Howl | null = null
let pingSound: Howl | null = null

/**
 * Initialize audio system
 */
export function initializeAudio() {
  if (typeof window === 'undefined') return

  // Create Howl instances
  rippleSound = new Howl({
    src: ['/audio/ripple.wav'],
    volume: 0.3,
    preload: true,
  })

  pingSound = new Howl({
    src: ['/audio/ping.wav'],
    volume: 0.4,
    preload: true,
  })
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
 * Play ripple sound effect
 */
export function playRipple() {
  if (!isUnlocked || !rippleSound) return
  
  try {
    rippleSound.play()
  } catch (error) {
    console.warn('Failed to play ripple sound:', error)
  }
}

/**
 * Play ping sound effect
 */
export function playPing() {
  if (!isUnlocked || !pingSound) return
  
  try {
    pingSound.play()
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
 * Set audio volumes (0-1 range)
 */
export function setVolume(rippleVol: number, pingVol: number) {
  if (rippleSound) rippleSound.volume(rippleVol)
  if (pingSound) pingSound.volume(pingVol)
}

/**
 * Stop all sounds
 */
export function stopAllSounds() {
  if (rippleSound) rippleSound.stop()
  if (pingSound) pingSound.stop()
}

/**
 * Cleanup audio resources
 */
export function cleanupAudio() {
  if (rippleSound) {
    rippleSound.unload()
    rippleSound = null
  }
  if (pingSound) {
    pingSound.unload()
    pingSound = null
  }
  if (audioContext) {
    audioContext.close()
    audioContext = null
  }
  isUnlocked = false
}