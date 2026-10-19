#version 300 es
precision highp float;

/**
 * π · Aura — главный fragment shader (GLSL ES 3.00).
 * Слои: фон → caustics → кольца-волны → metaballs → glow → tone mapping + grain + виньетка.
 */

out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;      // часы синхронизации (секунды)
uniform float uDive;      // 0..1 — «ныряние» камеры
uniform float uMirror;    // 0..1 — точка Фейнмана: зеркальная вода + вспышка
uniform float uMotion;    // 1.0 или 0.5 — prefers-reduced-motion
uniform vec2 uTilt;       // наклон телефона (гироскоп), -1..1
uniform float uPulse;     // пульс ядра π в такт нотам
uniform vec4 uDrops[24];  // x, y, birth, code+weight (пустой слот: code+weight == 0)

const vec3 BG_TOP = vec3(0.039, 0.059, 0.141); // #0A0F24
const vec3 BG_BOTTOM = vec3(0.020, 0.024, 0.051); // #05060D

// --- шум ---------------------------------------------------------------

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
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
    v += amp * vnoise(p);
    p = p * 2.03 + 17.7;
    amp *= 0.5;
  }
  return v;
}

vec3 paletteColor(float code) {
  // палитра 0–9, распакованная из одного float в цикле (константный индекс не нужен)
  int i = int(clamp(code, 0.0, 9.0));
  vec3 cols[10] = vec3[10](
    vec3(0.169, 0.165, 0.561),
    vec3(0.184, 0.322, 0.816),
    vec3(0.122, 0.525, 0.878),
    vec3(0.078, 0.722, 0.839),
    vec3(0.122, 0.851, 0.737),
    vec3(0.486, 0.941, 0.800),
    vec3(0.714, 0.949, 0.894),
    vec3(0.776, 0.714, 1.000),
    vec3(0.906, 0.651, 0.949),
    vec3(1.000, 0.827, 0.933)
  );
  return cols[i];
}

void main() {
  vec2 frag = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / max(uRes.y, 1.0);
  // координаты с поправкой на пропорции экрана
  vec2 p = (frag - 0.5) * vec2(aspect, 1.0);

  float t = uTime * uMotion;
  float dive = uDive;

  // --- 1. фон: почти чёрный градиент + «дыхание» -----------------------
  float breathe = 0.5 + 0.5 * sin(t * 0.12);
  vec3 col = mix(BG_BOTTOM, BG_TOP, frag.y * (0.85 + 0.15 * breathe));
  col *= 1.0 - 0.25 * dive;

  // --- 2. caustics: световая сеть, очень низкая яркость ----------------
  vec2 cuv = p * (2.6 + 2.4 * dive) + uTilt * 0.25;
  cuv += vec2(t * 0.02, t * 0.013);
  float c1 = fbm(cuv);
  float c2 = fbm(cuv * 1.7 + 4.2 - vec2(t * 0.017, 0.0));
  float caustic = pow(abs(c1 - c2) * 2.0, 3.0);
  vec3 causticTint = mix(vec3(0.10, 0.22, 0.40), vec3(0.05, 0.12, 0.35), dive);
  col += causticTint * caustic * (0.16 - 0.08 * dive) * (1.0 - 0.8 * uMirror);

  // --- 3. кольца-волны + 4. metaballs ----------------------------------
  float ringField = 0.0;
  float ballField = 0.0;
  vec3 glow = vec3(0.0);

  for (int i = 0; i < 24; i++) {
    vec4 d = uDrops[i];
    float packed = d.w;
    if (packed <= 0.0) continue;
    float code = floor(packed);
    float weight = fract(packed);
    float age = uTime - d.z;
    if (age < 0.0) age = 0.0;

    vec2 dp = (d.xy - 0.5) * vec2(aspect, 1.0);
    float r = length(p - dp);
    float damp = (1.0 - 0.85 * uMirror);

    // кольцо: тонкий гребень (Ricker) — один яркий фронт + полутень по краям
    float dx = r - 0.22 * age;
    float q = dx * dx * 170.0; // ширина фронта ~0.11 по r
    float ring = (1.0 - q) * exp(-q) * exp(-0.55 * age);
    ringField += ring * weight * damp * exp(-r * 1.2);

    // метабол: 1/(r²+ε) с быстрым затуханием — светит только возле капли
    float m = weight * (0.30 + 0.12 * sin(t * 1.7 + code)) * exp(-r * 4.5) / (r * r * 10.0 + 0.30);
    ballField += m * exp(-age * 0.5);

    vec3 dc = paletteColor(code);
    glow += dc * exp(-r * 3.6) * weight * exp(-age * 0.55) * damp;
  }

  // кольца: тонкая светящаяся линия + мягкая тень изнутри кольца
  float ringPos = max(ringField, 0.0);
  float ringGlow = ringPos * ringPos;
  col += vec3(0.55, 0.75, 1.0) * ringPos * 0.30 + vec3(0.8, 0.9, 1.0) * ringGlow * 0.24;
  col *= 1.0 - 0.10 * clamp(-ringField, 0.0, 1.0);

  // metaballs: высокий порог — светятся только 2–3 слияющихся пятна
  float blob = smoothstep(0.85, 1.9, ballField);
  vec3 blobTint = mix(vec3(0.10, 0.28, 0.45), vec3(0.35, 0.55, 0.85), clamp(ballField * 0.4, 0.0, 1.0));
  col += blobTint * blob * (0.12 + 0.12 * uPulse);

  // --- 5. аура: аддитивное свечение ------------------------------------
  col += glow * (0.5 + 0.5 * uPulse) * 0.30;

  // --- зеркальность в точке Фейнмана + мягкая вспышка ------------------
  if (uMirror > 0.0) {
    // вода гасит волнение и отражает небо: холодный сдвиг
    float mirrorBand = smoothstep(0.0, 1.0, frag.y);
    col = mix(col, mix(col, vec3(0.04, 0.06, 0.11) + mirrorBand * 0.05, 0.6), uMirror);
    col += vec3(1.0, 0.98, 0.95) * 0.22 * uMirror; // мягкая белая вспышка
  }

  // --- 7. финал: tone mapping + зерно + виньетка ------------------------
  col = col / (col + vec3(0.85));            // мягкое сжатие яркости
  col = pow(col, vec3(0.95));

  float vig = smoothstep(1.35, 0.35, length(p));
  col *= mix(0.75, 1.0, vig);

  float grain = (hash21(gl_FragCoord.xy + fract(t) * 371.0) - 0.5) * 0.028;
  col += grain;

  fragColor = vec4(max(col, 0.0), 1.0);
}
