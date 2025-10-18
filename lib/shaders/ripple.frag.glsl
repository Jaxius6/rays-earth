/**
 * Fragment shader for expanding ripple effect
 * Creates animated ring that expands outward with noise-modulated edge
 */

uniform vec3 rippleColor;
uniform float progress; // 0 to 1 animation progress
uniform float maxRadius;
uniform float time;

varying vec2 vUv;

// Simple noise function for edge modulation
float noise(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 center = vec2(0.5, 0.5);
  float dist = distance(vUv, center);
  
  // Current ripple radius based on progress
  float currentRadius = progress * maxRadius;
  
  // Ring thickness (gets thinner as it expands)
  float thickness = 0.05 * (1.0 - progress * 0.5);
  
  // Distance from current ring position
  float ringDist = abs(dist - currentRadius);
  
  // Create sharp ring with smooth edges
  float ring = 1.0 - smoothstep(0.0, thickness, ringDist);
  
  // Add noise to edge for organic feel
  float noiseVal = noise(vUv * 20.0 + time);
  ring *= 0.8 + 0.2 * noiseVal;
  
  // Fade out as ripple expands
  float fadeOut = 1.0 - progress;
  ring *= fadeOut;
  
  // Apply color
  vec3 finalColor = rippleColor * ring;
  float alpha = ring * fadeOut;
  
  gl_FragColor = vec4(finalColor, alpha);
}