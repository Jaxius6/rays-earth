import { NextResponse } from 'next/server'

/**
 * Health check endpoint for uptime monitoring
 * Returns 200 OK with basic system info
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'rays.earth',
    version: '1.0.0',
  })
}