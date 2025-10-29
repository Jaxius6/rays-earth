'use client'

import { useEffect, useState } from 'react'

/**
 * Off-screen ARIA live region for accessibility
 * Announces state changes to screen readers without visible text
 */
export default function AriaAnnouncer() {
  const [message, setMessage] = useState<string>('')

  useEffect(() => {
    // Listen for custom events to announce
    const handleAnnounce = (event: CustomEvent<string>) => {
      setMessage(event.detail)
      // Clear after a delay so the same message can be announced again
      setTimeout(() => setMessage(''), 1000)
    }

    window.addEventListener('aria-announce' as any, handleAnnounce)
    
    return () => {
      window.removeEventListener('aria-announce' as any, handleAnnounce)
    }
  }, [])

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  )
}

/**
 * Helper function to announce messages
 */
export function announce(message: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('aria-announce', { detail: message }))
  }
}