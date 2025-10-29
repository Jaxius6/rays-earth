# Arc Animation System

This document describes how the ping arc animations work in rays.earth.

## Overview

When a user clicks on another presence dot, a luminous arc is drawn between the two points with a complex 3-phase animation system.

## Arc Structure

Each arc consists of:
- **Main tube** (`TubeGeometry`) - The primary visible arc (0.6 radius)
- **Glow tube** (`TubeGeometry`) - A wider outer glow (1.0 radius)
- **Marching ants** - 40 small white particles that travel along the arc
- **Ripple effects** - Warping rings at start/end points

## Arc Path Calculation

1. **Great circle interpolation** - 100 points calculated along the shortest path on the sphere
2. **Height boost** - Arc peaks 60 units above the globe surface at midpoint
   - Uses `sin(t * PI)` curve where `t` goes from 0 to 1
   - Start/end points are exactly at presence dot positions (globeRadius + 2)
3. **Smooth curve** - CatmullRom curve with 200 final points for smoothness

## Animation Phases

### Phase 1: Drawing (0-5 seconds)

**What happens:**
- Arc tube material fades in from 0% to 100% opacity
- 40 "marching ants" particles animate along the revealed portion of the arc
- Particles are spread evenly with 30% of arc length between them
- Each particle fades in/out as it moves
- Glow tube is HIDDEN (opacity = 0)
- Start ripple plays immediately at sender location (3 concentric warping rings)

**Purpose:** Create the feeling of energy traveling from sender to receiver

**Technical details:**
- Uses manual `requestAnimationFrame` loop for precise control
- `revealProgress` goes from 0 to 1 over 5000ms
- Particles positioned at `progress - (particleOffset * 0.3)`
- Particles visible only when their position is between 0 and 1

### Phase 2: Glow & Pulse (5-10 seconds)

**What happens:**
- Drawing animation completes
- Marching ants become stationary at 40% opacity
- Glow tube appears with pulsating effect (60% base opacity)
- Both arc and ants pulse together: `sin(time * 0.01) * 0.3 + 0.7`
- End ripple plays at receiver location
- `playBong()` sound effect triggers

**Purpose:** Celebrate the connection with a glowing, pulsing effect

**Technical details:**
- Separate `animateGlow()` RAF loop
- Lasts 5000ms
- Ants remain visible but stop moving

### Phase 3: Fade to White (10+ seconds)

**What happens:**
- Arc color transitions from orange (#ffb300) to white (#ffffff) over 10 seconds
- Arc opacity fades from 100% to 10% over 10 seconds
- Glow opacity fades proportionally
- Marching ants fade to 15% opacity and turn white
- Arc becomes a persistent white trace

**Purpose:** Leave a subtle trace of the connection

**Technical details:**
- Uses GSAP timeline for smooth color/opacity transitions
- Arc stored in `persistentArcs` map after this phase
- Ants kept visible at 10% opacity

### Phase 4: Long Fade (10 seconds - 24 hours)

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

### End Ripple (Receiver)
- 3 concentric rings
- Warping animation with sin/cos noise
- Orange color (#ffb300)
- Triggers at 5-second mark (when arc completes)
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
   - Plays for EVERYONE when arc completes (5 second mark)
   - Frequency progresses through scale on repeated clicks (A2-A4)
   - Lasts 1.5 seconds with gentle fade

## Known Issues & Glitches

### Reported Issues:
1. **Arc animations "not quite right and glitchy"**
   - Possible timing issues between phases
   - RAF loops may conflict
   - Particles might disappear/flicker during phase transitions

### Potential Problems:
1. **Memory leaks** - Particles not cleaned up properly
2. **Phase transition gaps** - Brief moments where nothing is animating
3. **Multiple arcs** - Overlapping animations may interfere
4. **Performance** - 40 particles × multiple arcs = many objects

### Debug Points:
- Check console for "Invalid positions for arc" errors
- Verify particles are disposed when arc is removed
- Monitor RAF loop creation/cleanup
- Check for NaN values in position calculations

## Code Location

All arc logic is in: `components/PingEngine.tsx`

Key functions:
- `animateDrawing()` - Phase 1 drawing loop
- `startGlowPhase()` - Phase 2 glow/pulse
- `startFadeToWhite()` - Phase 3 white fade
- `updateOpacities()` - Phase 4 long fade
- `createRipple()` - Ripple effect generator

## Improvements Needed

1. Smoother phase transitions
2. Better particle cleanup
3. Reduce memory footprint
4. More predictable timing
5. Debug glitchy behavior
6. Consider using single RAF loop for all phases
7. Add error recovery for failed animations
