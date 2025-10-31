# Arc Animation System

This document describes how the ping arc animations work in rays.earth.

## Overview

When a user clicks on another presence dot, a luminous arc is drawn between the two points using a **clock wipe** drawing effect.

## Arc Structure

Each arc consists of:
- **Main tube** (`TubeGeometry`) - The primary visible arc (0.6 radius)
- **Glow tube** (`TubeGeometry`) - A wider outer glow (1.0 radius)
- **Ripple effects** - Warping rings at start/end points

## Arc Path Calculation

1. **Great circle interpolation** - 100 points calculated along the shortest path on the sphere
2. **Variable height boost** - Arc height varies based on distance between points:
   - Close connections (0-500km): 20% of max height = 12 units
   - Far connections (10,000km+): 100% of max height = 60 units
   - Linear interpolation between these thresholds
   - Uses `sin(t * PI)` curve where `t` goes from 0 to 1
   - Start/end points are exactly at presence dot positions (globeRadius)
3. **Smooth curve** - CatmullRom curve with 200 final points for smoothness

## Animation Phases

### Phase 1: Clock Wipe Drawing (0-3 seconds)

**What happens:**
- Tube progressively reveals along arc path from start to end
- Uses Three.js `setDrawRange()` to control vertex rendering
- Starts at 0 vertices, progressively reveals up to total vertex count
- Tube is fully visible (0.8 opacity, orange color #ffb300)
- Glow tube is HIDDEN (opacity = 0)
- Start ripple plays immediately at sender location (3 concentric warping rings)

**Purpose:** Create the feeling of energy drawing/traveling from sender to receiver

**Technical details:**
- Uses manual `requestAnimationFrame` loop for precise control
- `progress` goes from 0 to 1 over 3000ms
- Vertex count = `floor(progress * totalVertices)`
- `tubeGeometry.setDrawRange(0, vertexCount)` controls visibility

### Phase 2: Glow & Pulse (3-8 seconds)

**What happens:**
- Clock wipe completes, full tube now visible
- Glow tube appears with pulsating effect (60% base opacity)
- Pulse formula: `sin(time * 0.01) * 0.3 + 0.7`
- End ripple plays at receiver location
- `playBong()` sound effect triggers at 3 seconds

**Purpose:** Celebrate the connection with a glowing, pulsing effect

**Technical details:**
- Separate `animateGlow()` RAF loop
- Lasts 5000ms (from 3s to 8s)
- Main tube stays solid, only glow tube pulses

### Phase 3: Fade to White (8-18 seconds)

**What happens:**
- Arc color transitions from orange (#ffb300) to white (#ffffff) over 10 seconds
- Arc opacity fades from 80% to 10% over 10 seconds
- Glow opacity fades proportionally
- Arc becomes a persistent white trace

**Purpose:** Leave a subtle trace of the connection

**Technical details:**
- Uses GSAP timeline for smooth color/opacity transitions
- Arc stored in `persistentArcs` map after this phase
- Subtle pulsation continues on glow tube

### Phase 4: Long Fade (18 seconds - 24 hours)

**What happens:**
- Arc remains visible at 10% white
- Opacity gradually decreases from 10% to 0% over 24 hours
- Arc deleted from globe when fully faded

**Purpose:** Maintain a ghost of recent connections

**Technical details:**
- `updateOpacities()` runs every 1 second
- Calculates `ageHours / 24` to determine fade progress
- Final opacity: `max(0, 0.1 * (1 - fadeProgress))`

## Ripple Effects

### Start Ripple (Sender)
- 3 concentric rings
- Warping animation with sin/cos noise
- White color (#ffffff)
- Staggered by 150ms each
- Lasts 1.5 seconds per ring
- Triggers immediately when ping is sent

### End Ripple (Receiver)
- 3 concentric rings
- Warping animation with sin/cos noise
- Orange color (#ffb300)
- Triggers at 3-second mark (when clock wipe completes)
- Staggered by 150ms each
- Lasts 1.5 seconds per ring

**Warping effect:**
```javascript
const baseScale = 1 + elapsed * 4
const warpX = Math.sin(elapsed * 8 + i) * 0.3
const warpY = Math.cos(elapsed * 6 + i * 0.5) * 0.2
ripple.scale.set(baseScale + warpX, baseScale + warpY, 1)
```

## Audio Cues

1. **Arc hum** - Deep ethereal drone (110Hz triangle wave) plays when arc starts
   - Only plays if sender or receiver is current user
   - Lasts 5 seconds
   - Fades in over 0.3s, out over 5s

2. **Bong** - Pure sine wave tone at receiver
   - Plays for EVERYONE when clock wipe completes (3 second mark)
   - Frequency progresses through scale on repeated clicks (A2-A4)
   - Lasts 1.5 seconds with gentle fade

## Performance Notes

- No particles used (previous "marching ants" system removed)
- Clock wipe uses efficient vertex-level drawing via `setDrawRange()`
- Two tube geometries per arc (main + glow)
- Clean disposal of geometries after 24 hours
- RAF loops properly cleaned up when arcs are removed

## Code Location

All arc logic is in: `components/PingEngine.tsx`

Key functions:
- `animateClockWipe()` - Phase 1 clock wipe drawing loop
- `startGlowPhase()` - Phase 2 glow/pulse
- `startFadeToWhite()` - Phase 3 white fade
- `updateOpacities()` - Phase 4 long fade (24-hour decay)
- `createRipple()` - Ripple effect generator

## Implementation Notes

1. **Clock wipe** is the key visual feature - progressive vertex reveal creates smooth drawing effect
2. Arc height varies by distance for visual interest (close = subtle, far = dramatic)
3. Clean phase separation - each phase waits for previous to complete
4. RAF loops properly managed to prevent memory leaks
5. GSAP handles smooth color/opacity transitions in fade phase
