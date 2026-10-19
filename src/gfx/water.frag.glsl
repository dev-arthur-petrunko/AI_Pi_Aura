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

const vec3 BG_TOP = vec3(0.016, 0.024, 0.058); // #04060F — почти чёрный небосвод
const vec3 BG_BOTTOM = vec3(0.004, 0.006, 0.016); // #010104 — дно

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
  // жёсткая пороговая выборка: сеть света, а не равномерная дымка
  float caustic = smoothstep(0.22, 0.55, abs(c1 - c2) * 2.0);
  caustic *= caustic;
  vec3 causticTint = mix(vec3(0.06, 0.15, 0.30), vec3(0.03, 0.09, 0.26), dive);
  col += causticTint * caustic * (0.055 - 0.03 * dive) * (1.0 - 0.85 * uMirror);

  // --- 3. кольца-волны + 4. metaballs ----------------------------------
  float ringField = 0.0;
  vec3 ringTint = vec3(0.0);
  float ballField = 0.0;
  float coreField = 0.0;
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

    vec3 dc = paletteColor(code);

    // --- кольцо: тонкий яркий фронт (гауссиан), радиус растёт медленно ---
    // расширение насыщается: кольцо не расползается на весь экран
    float radius = 0.020 + 0.16 * (1.0 - exp(-age * 0.28));
    float ringR = exp(-pow((r - radius) * 135.0, 2.0));
    // второй, более слабый эхо-фронт — глубина, без «каши»
    float echoR = exp(-pow((r - radius * 1.75) * 165.0, 2.0));
    float ringLife = exp(-age * 0.40);
    float rings = (ringR + 0.20 * echoR) * weight * damp * ringLife;
    ringField += rings;
    ringTint += dc * rings;

    // --- ядро капли: крошечная яркая точка ---
    // медленное затухание, чтобы ядро оставалось «якорем» капли
    coreField += exp(-r * 85.0) * exp(-age * 0.55) * weight;

    // --- метабол: компактное ядро, не заливает кадр ---
    float m = weight * (0.85 + 0.25 * sin(t * 1.7 + code)) * exp(-r * 48.0) / (r * r * 320.0 + 0.30);
    ballField += m * exp(-age * 0.45);

    // --- локальная аура: узкая, не заливает кадр ---
    glow += dc * exp(-r * 42.0) * weight * exp(-age * 0.8) * damp;
  }

  // кольца: тонкая светящаяся линия, окрашенная цветом цифры.
  // Насыщающая кривая вместо линейной суммы: перекрывающиеся кольца
  // не складываются в молочную пелену, а остаются чёткими линиями.
  float ringSum = max(ringField, 0.0);
  float ringPos = 1.0 - exp(-ringSum * 1.6);
  float ringGlow = ringPos * ringPos;
  vec3 ringCol = ringTint / max(ringField, 0.0001);
  col += ringCol * ringPos * 0.78 + vec3(0.92, 0.97, 1.0) * ringGlow * 0.26;

  // ядро капли — самая яркая точка, чёткая граница
  col += vec3(0.92, 0.97, 1.0) * coreField * 1.45;

  // metaballs: маленькие тёплые пятна у ядер, сливаются при близости
  float blob = smoothstep(0.85, 1.8, ballField);
  vec3 blobTint = mix(vec3(0.10, 0.30, 0.52), vec3(0.42, 0.64, 0.95), clamp(ballField * 0.5, 0.0, 1.0));
  col += blobTint * blob * (0.10 + 0.10 * uPulse);

  // --- 5. аура: аддитивное свечение, насыщенное (без молочной пелены) ---
  vec3 glowSat = vec3(1.0) - exp(-glow * 2.2);
  col += glowSat * (0.5 + 0.5 * uPulse) * 0.09;

  // --- зеркальность в точке Фейнмана + мягкая вспышка ------------------
  if (uMirror > 0.0) {
    // вода гасит волнение и отражает небо: холодный сдвиг
    float mirrorBand = smoothstep(0.0, 1.0, frag.y);
    col = mix(col, mix(col, vec3(0.04, 0.06, 0.11) + mirrorBand * 0.05, 0.6), uMirror);
    col += vec3(1.0, 0.98, 0.95) * 0.22 * uMirror; // мягкая белая вспышка
  }

  // --- 7. финал: tone mapping + зерно + виньетка ------------------------
  // ACES-подобная кривая: чёрный остаётся чёрным, света не выжигаются
  col = col * (2.51 * col + 0.03) / (col * (2.43 * col + 0.59) + 0.14);

  float vig = smoothstep(1.30, 0.30, length(p));
  col *= mix(0.55, 1.0, vig);

  // зерно только в тенях — не «соль» на всём кадре
  float grain = (hash21(gl_FragCoord.xy + fract(t) * 371.0) - 0.5) * 0.012;
  col += grain * (1.0 - smoothstep(0.0, 0.25, dot(col, vec3(0.333))));

  fragColor = vec4(max(col, 0.0), 1.0);
}
