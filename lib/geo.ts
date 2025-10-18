/**
 * Geolocation and geodesic utilities for rays.earth
 */

/**
 * Round coordinates to 2 decimal places for privacy (~1-3km precision)
 */
export function roundCoordinates(lat: number, lng: number): { lat: number; lng: number } {
  return {
    lat: Math.round(lat * 100) / 100,
    lng: Math.round(lng * 100) / 100,
  }
}

/**
 * Calculate great circle distance between two points (Haversine formula)
 * Returns distance in kilometers
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371 // Earth's radius in km
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Convert degrees to radians
 */
export function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180)
}

/**
 * Convert radians to degrees
 */
export function toDegrees(radians: number): number {
  return radians * (180 / Math.PI)
}

/**
 * Calculate intermediate points along a great circle path
 * Returns array of {lat, lng} points
 */
export function interpolateGreatCircle(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  numPoints: number = 50
): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = []
  
  const lat1Rad = toRadians(lat1)
  const lng1Rad = toRadians(lng1)
  const lat2Rad = toRadians(lat2)
  const lng2Rad = toRadians(lng2)
  
  const d = haversineDistance(lat1, lng1, lat2, lng2) / 6371 // Angular distance in radians
  
  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints
    
    const a = Math.sin((1 - f) * d) / Math.sin(d)
    const b = Math.sin(f * d) / Math.sin(d)
    
    const x = a * Math.cos(lat1Rad) * Math.cos(lng1Rad) + b * Math.cos(lat2Rad) * Math.cos(lng2Rad)
    const y = a * Math.cos(lat1Rad) * Math.sin(lng1Rad) + b * Math.cos(lat2Rad) * Math.sin(lng2Rad)
    const z = a * Math.sin(lat1Rad) + b * Math.sin(lat2Rad)
    
    const latRad = Math.atan2(z, Math.sqrt(x * x + y * y))
    const lngRad = Math.atan2(y, x)
    
    points.push({
      lat: toDegrees(latRad),
      lng: toDegrees(lngRad),
    })
  }
  
  return points
}

/**
 * Convert lat/lng to 3D Cartesian coordinates (for Three.js)
 * Assumes sphere radius of 1
 */
export function latLngToVector3(lat: number, lng: number, radius: number = 1) {
  const phi = toRadians(90 - lat)
  const theta = toRadians(lng + 180)
  
  return {
    x: -radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.sin(theta),
  }
}

/**
 * Calculate decay factor based on time elapsed since last activity
 * Returns 0-1 where 1 is fully visible, 0 is invisible
 */
export function calculateDecay(lastActiveTimestamp: string, isOnline: boolean): number {
  if (isOnline) return 1
  
  const now = Date.now()
  const lastActive = new Date(lastActiveTimestamp).getTime()
  const ageMs = now - lastActive
  const ageHours = ageMs / (60 * 60 * 1000)
  
  // Linear decay over 24 hours
  return Math.max(0, 1 - ageHours / 24)
}

/**
 * Request user's geolocation with appropriate options
 */
export async function requestGeolocation(): Promise<GeolocationPosition | null> {
  if (!navigator.geolocation) {
    console.warn('Geolocation not supported')
    return null
  }
  
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      (error) => {
        console.warn('Geolocation denied or failed:', error.message)
        resolve(null)
      },
      {
        enableHighAccuracy: false,
        timeout: 6000,
        maximumAge: 300000, // Cache for 5 minutes
      }
    )
  })
}