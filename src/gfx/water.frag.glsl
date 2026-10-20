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
uniform vec4 uAnchors[10]; // x, y, code, baseAlpha (0.25) — точки-якоря цифр
uniform float uFlashDigit; // цифра, которая только что сыграла (-1 = никакая)
uniform float uFlashTime;  // часы момента вспышки якоря

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
  // Перекрывающиеся кольца НЕ складываются: по яркости берётся максимум,
  // цвет усредняется по вкладу. Иначе 24 кольца дают молочную паутину.
  float ringMax = 0.0;        // самая яркая линия в этой точке
  float ringWeightSum = 0.0;  // сумма вкладов — для усреднения цвета
  vec3 ringHue = vec3(0.0);
  float ringCrowd = 0.0;      // сколько колец перекрылось здесь
  float ballField = 0.0;
  float coreField = 0.0;
  float glowMax = 0.0;
  float glowWeightSum = 0.0;
  vec3 glowHue = vec3(0.0);

  // Предварительный проход: считаем активные капли. От их числа зависит
  // толщина и яркость колец — при many drops они не должны слипаться.
  float dropCount = 0.0;
  for (int i = 0; i < 24; i++) {
    if (uDrops[i].w > 0.0) dropCount += 1.0;
  }
  // Плотность: 1 капля — кольцо как в одиночном случае; 24 капли — линия
  // примерно вдвое тоньше и в 1.6 раза тише (density ≈ 0.34).
  float density = 1.0 / (1.0 + 0.085 * max(dropCount - 1.0, 0.0));
  float ringWidth = mix(135.0, 330.0, 1.0 - density);   // тоньше при тесноте
  float ringGain = mix(1.0, 0.42, 1.0 - density);      // и тише

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
    // расширение насыщается: кольцо не расползается на весь экран.
    // Потолок 0.11 — радиус меньше четверти кадра, кольца не слипаются.
    float radius = 0.018 + 0.092 * (1.0 - exp(-age * 0.26));
    float ringR = exp(-pow((r - radius) * ringWidth, 2.0));
    // второй, более слабый эхо-фронт — глубина, без «каши»
    float echoR = exp(-pow((r - radius * 1.75) * (ringWidth * 1.22), 2.0));
    float ringLife = exp(-age * 0.40);
    float rings = (ringR + 0.20 * echoR) * weight * damp * ringLife * ringGain;
    // максимум вместо суммы: перекрытые кольца остаются тонкими линиями
    ringMax = max(ringMax, rings);
    ringWeightSum += rings;
    ringHue += dc * rings;
    // «теснота»: кольца, попавшие в этот пиксель, приглушают друг друга
    ringCrowd += smoothstep(0.35, 1.0, rings);

    // --- ядро капли: крошечная яркая точка ---
    // медленное затухание, чтобы ядро оставалось «якорем» капли
    coreField = max(coreField, exp(-r * 85.0) * exp(-age * 0.55) * weight);

    // --- метабол: компактное ядро, не заливает кадр ---
    float m = weight * (0.85 + 0.25 * sin(t * 1.7 + code)) * exp(-r * 48.0) / (r * r * 320.0 + 0.30);
    ballField += m * exp(-age * 0.45);

    // --- локальная аура: узкая, не заливает кадр ---
    float g = exp(-r * 42.0) * weight * exp(-age * 0.8) * damp * ringGain;
    glowMax = max(glowMax, g);
    glowWeightSum += g;
    glowHue += dc * g;
  }

  // --- точки-якоря цифр (всегда видны, едва заметно) ----------------------
  // Играющая цифра вспыхивает на ~600 мс.
  for (int j = 0; j < 10; j++) {
    vec4 a = uAnchors[j];
    if (a.w <= 0.0) continue;
    float code = a.z;
    vec3 dc = paletteColor(code);
    vec2 ap = (a.xy - 0.5) * vec2(aspect, 1.0);
    float ar = length(p - ap);
    float alpha = a.w; // 0.25 базовая
    float flash = 1.0;
    if (uFlashDigit >= 0.0 && float(j) == uFlashDigit) {
      float age = uTime - uFlashTime;
      if (age >= 0.0 && age < 0.6) {
        flash = 1.0 + 4.0 * exp(-age / 0.10); // пик ~600 мс, потом затухает
      }
    }
    float dot = exp(-ar * 95.0) * alpha * flash * 0.9;
    col += dc * dot * 0.5;
    col += vec3(0.92, 0.97, 1.0) * dot * 0.3;
  }

  // кольца: тонкая светящаяся линия, окрашенная цветом цифры.
  // Яркость = максимум вкладов (не сумма), цвет = взвешенное среднее.
  vec3 ringCol = ringHue / max(ringWeightSum, 0.0001);
  // перекрытие гасит кольца: в тесноте линии тоньше и тусклее
  float crowd = 1.0 / (1.0 + 0.55 * max(ringCrowd - 1.0, 0.0));
  float ringPos = 1.0 - exp(-ringMax * 1.6);
  float ringGlow = ringPos * ringPos * crowd;
  col += ringCol * ringPos * 0.78 * crowd + vec3(0.92, 0.97, 1.0) * ringGlow * 0.20;

  // ядро капли — самая яркая точка, чёткая граница
  col += vec3(0.92, 0.97, 1.0) * coreField * 1.45;

  // metaballs: маленькие тёплые пятна у ядер, сливаются при близости
  float blob = smoothstep(0.85, 1.8, ballField);
  vec3 blobTint = mix(vec3(0.10, 0.30, 0.52), vec3(0.42, 0.64, 0.95), clamp(ballField * 0.5, 0.0, 1.0));
  col += blobTint * blob * (0.10 + 0.10 * uPulse);

  // --- 5. аура: локальное свечение, максимум вместо суммы (без пелены) ---
  vec3 glowSat = vec3(1.0) - exp(-glowMax * 2.2);
  vec3 glowCol = glowHue / max(glowWeightSum, 0.0001);
  col += glowCol * glowSat * (0.5 + 0.5 * uPulse) * 0.13;

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
