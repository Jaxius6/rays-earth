'use client'

import { useState, useEffect } from 'react'
import { unlockAudio, isAudioUnlocked } from '@/lib/audio'

/**
 * Invisible overlay that unlocks audio on first user interaction
 * Disappears after first tap/click
 */
export default function AudioGate() {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    // Check if already unlocked
    if (isAudioUnlocked()) {
      setIsVisible(false)
    }
  }, [])

  const handleInteraction = async () => {
    const success = await unlockAudio()
    if (success) {
      setIsVisible(false)
    }
  }

  if (!isVisible) return null

  return (
    <div
      onClick={handleInteraction}
      onTouchStart={handleInteraction}
      className="fixed inset-0 z-50 cursor-pointer"
      style={{ 
        background: 'transparent',
        WebkitTapHighlightColor: 'transparent'
      }}
      role="button"
      tabIndex={0}
      aria-label="Tap to enable sound"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleInteraction()
        }
      }}
    >
      {/* Completely invisible but interactive */}
    </div>
  )
}