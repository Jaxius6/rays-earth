/**
 * Fragment shader for glowing presence dots
 * Creates soft bloom effect with customizable color and intensity
 */

uniform vec3 glowColor;
uniform float intensity;
uniform float time;

varying vec2 vUv;

void main() {
  // Calculate distance from center
  vec2 center = vec2(0.5, 0.5);
  float dist = distance(vUv, center);
  
  // Create radial gradient with soft falloff
  float glow = 1.0 - smoothstep(0.0, 0.5, dist);
  
  // Add subtle pulsing effect
  float pulse = 0.95 + 0.05 * sin(time * 2.0);
  glow *= pulse;
  
  // Apply intensity and color
  vec3 finalColor = glowColor * glow * intensity;
  
  // Alpha gradient for soft edges
  float alpha = glow * intensity;
  
  gl_FragColor = vec4(finalColor, alpha);
}