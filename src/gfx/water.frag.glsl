#version 300 es
precision highp float;

/**
 * π · Aura — рендер поверхности воды (Phase 2).
 * Слои: дно с цифрами π → преломление по нормали поверхности → каустика →
 * френель (отражение неба на склонах) → блик солнца → туман вглубь.
 */

out vec4 fragColor;

uniform sampler2D uState;   // R=высота, G=скорость, BA=нормаль (x, z)
uniform sampler2D uFloor;   // плитки с цифрами π
uniform vec2 uRes;
uniform vec2 uFloorSize;    // колонки, ряды плиток
uniform float uTime;
uniform float uPerturb;     // сила преломления дна
uniform vec3 uLight;        // направление света (солнце)
uniform vec3 uSky;          // цвет неба для френеля
uniform vec3 uWaterDeep;    // цвет глубины по краям

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    v += amp * noise(p);
    p = p * 2.03 + 17.7;
    amp *= 0.5;
  }
  return v;
}

void main() {
  vec2 frag = gl_FragCoord.xy / uRes;
  vec2 p = frag;

  vec4 s = texture(uState, p);
  vec2 ba = s.ba;

  vec2 floorUv = p + ba * uPerturb;
  floorUv = fract(floorUv * vec2(uFloorSize.x, uFloorSize.y)) / uFloorSize;
  vec3 col = texture(uFloor, floorUv).rgb;

  float caust = caustic(p, uTime);
  col += caust * 0.45;
  col += 4.0 * length(ba) * caust;

  float ny = sqrt(max(0.0, 1.0 - dot(ba, ba)));
  vec3 N = normalize(vec3(ba.x, ny, ba.y));

  float fres = pow(1.0 - N.y, 3.0);
  col = mix(col, uSky, fres * 0.55);

  vec3 viewDir = vec3(0.0, 1.0, 0.0);
  vec3 reflectDir = reflect(-uLight, N);
  float spec = pow(max(dot(reflectDir, viewDir), 0.0), 64.0);
  col += vec3(1.0, 0.95, 0.85) * spec * 0.9;

  float depth = smoothstep(0.2, 1.0, p.y);
  col = mix(col, uWaterDeep, depth * 0.5);

  fragColor = vec4(col, 1.0);
}

float caustic(vec2 uv, float t) {
  vec2 p = uv * 3.0 + vec2(t * 0.04, t * 0.025);
  float c1 = fbm(p);
  float c2 = fbm(p * 1.8 + 4.2);
  float net = smoothstep(0.35, 0.65, abs(c1 - c2) * 2.2);
  return net * net;
}

﻿
