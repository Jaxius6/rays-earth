/**
 * Unit tests for geo utilities
 */

import {
  roundCoordinates,
  haversineDistance,
  toRadians,
  toDegrees,
  calculateDecay,
} from '../lib/geo'

describe('Geo Utilities', () => {
  describe('roundCoordinates', () => {
    it('should round coordinates to 2 decimal places', () => {
      const result = roundCoordinates(37.123456, -122.987654)
      expect(result).toEqual({ lat: 37.12, lng: -122.99 })
    })

    it('should handle edge cases', () => {
      const result = roundCoordinates(0.001, -0.001)
      expect(result).toEqual({ lat: 0, lng: 0 })
    })
  })

  describe('haversineDistance', () => {
    it('should calculate distance between two points', () => {
      // New York to London (approximately 5570 km)
      const distance = haversineDistance(40.7128, -74.006, 51.5074, -0.1278)
      expect(distance).toBeGreaterThan(5500)
      expect(distance).toBeLessThan(5600)
    })

    it('should return 0 for same coordinates', () => {
      const distance = haversineDistance(0, 0, 0, 0)
      expect(distance).toBe(0)
    })
  })

  describe('angle conversions', () => {
    it('should convert degrees to radians', () => {
      expect(toRadians(180)).toBeCloseTo(Math.PI)
      expect(toRadians(90)).toBeCloseTo(Math.PI / 2)
      expect(toRadians(0)).toBe(0)
    })

    it('should convert radians to degrees', () => {
      expect(toDegrees(Math.PI)).toBeCloseTo(180)
      expect(toDegrees(Math.PI / 2)).toBeCloseTo(90)
      expect(toDegrees(0)).toBe(0)
    })
  })

  describe('calculateDecay', () => {
    it('should return 1 for online users', () => {
      const decay = calculateDecay(new Date().toISOString(), true)
      expect(decay).toBe(1)
    })

    it('should calculate decay for offline users', () => {
      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
      const decay = calculateDecay(twelveHoursAgo, false)
      expect(decay).toBeCloseTo(0.5, 1)
    })

    it('should return 0 for users offline more than 24 hours', () => {
      const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
      const decay = calculateDecay(twentyFiveHoursAgo, false)
      expect(decay).toBe(0)
    })
  })
})