(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))n(s);new MutationObserver(s=>{for(const r of s)if(r.type==="childList")for(const o of r.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&n(o)}).observe(document,{childList:!0,subtree:!0});function e(s){const r={};return s.integrity&&(r.integrity=s.integrity),s.referrerPolicy&&(r.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?r.credentials="include":s.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function n(s){if(s.ep)return;s.ep=!0;const r=e(s);fetch(s.href,r)}})();const ct={major:[261.63,293.66,329.63,392,440,523.25,587.33,659.25,783.99,880],minor:[261.63,311.13,349.23,392,466.16,523.25,622.25,698.46,783.99,932.33]};function rt(i,t="major"){const e=Math.min(9,Math.max(0,Math.round(i)));return ct[t][e]}function pt(i,t="major"){const e=Math.min(9,Math.max(0,Math.floor(i*10)));return ct[t][e]}const gt=65.41,vt=12;class bt{nodes=[];running=!1;start(t,e){if(this.running)return;this.running=!0;const n=t.createGain();n.gain.value=0,n.gain.setValueAtTime(1e-4,t.currentTime),n.gain.linearRampToValueAtTime(.05,t.currentTime+4),n.connect(e);for(const[o,a]of[["sine",0],["triangle",4]]){const l=t.createOscillator();l.type=o,l.frequency.value=gt,l.detune.value=a;const c=t.createGain();c.gain.value=o==="sine"?1:.35,l.connect(c),c.connect(n),l.start(),this.nodes.push(l,c)}const s=t.createOscillator();s.type="sine",s.frequency.value=1/vt;const r=t.createGain();r.gain.value=.02,s.connect(r),r.connect(n.gain),s.start(),this.nodes.push(s,r,n)}stop(t=1.5){if(!this.running)return;this.running=!1;const e=this.nodes;this.nodes=[];const n=e[e.length-1];try{const r=n.context.currentTime;n.gain.cancelScheduledValues(r),n.gain.setValueAtTime(Math.max(n.gain.value,1e-4),r),n.gain.exponentialRampToValueAtTime(1e-4,r+t);for(const o of e){const a=o;if(typeof a.stop=="function"&&typeof a.start=="function")try{a.stop(r+t+.05)}catch{}}setTimeout(()=>{for(const o of e)try{o.disconnect()}catch{}},(t+.2)*1e3)}catch{}}}function wt(i,t=4.5){const e=i.sampleRate,n=Math.max(1,Math.floor(e*t)),s=i.createBuffer(2,n,e);for(let r=0;r<s.numberOfChannels;r++){const o=s.getChannelData(r);for(let a=0;a<n;a++){const l=a/n,c=Math.pow(1-l,2.2),m=Math.min(1,a/(e*.03));o[a]=(Math.random()*2-1)*c*m*.6}}return s}const yt=6;function q(i,t,e,n,s={}){const r=s.attack??.025,o=s.decay??2.5+Math.random()*1.5,a=Math.max(1e-4,s.gain??.18),l=s.detuneCents??yt,c=i.createGain();c.gain.setValueAtTime(1e-4,n),c.gain.linearRampToValueAtTime(a,n+r),c.gain.exponentialRampToValueAtTime(1e-4,n+r+o),c.connect(t);const m=[],v=(f,p,S=1)=>{const g=i.createOscillator();g.type=f,g.frequency.setValueAtTime(e*S,n),g.detune.setValueAtTime(p,n);const X=i.createGain();return X.gain.value=f==="sine"?1:.55,g.connect(X),X.connect(c),g.start(n),g.stop(n+r+o+.1),m.push(g),g};v("sine",-l),v("triangle",l),s.octave&&v("sine",l,2);let x=!1;const T=(f=.08)=>{if(x)return;x=!0;const p=i.currentTime;try{c.gain.cancelScheduledValues(p),c.gain.setValueAtTime(Math.max(c.gain.value,1e-4),p),c.gain.exponentialRampToValueAtTime(1e-4,p+f);for(const S of m)S.stop(p+f+.02),S.onended=()=>{try{S.disconnect()}catch{}};setTimeout(()=>{try{c.disconnect()}catch{}},(f+.1)*1e3)}catch{}};for(const f of m)f.onended=()=>{try{f.disconnect()}catch{}};return{stop:T}}const xt=12,Tt=.35,Mt=[523.25,659.25,783.99,880];class St{ctx=null;master=null;dry=null;voices=[];drone=new bt;scale="major";volume=.8;muted=!1;frozen=!1;lastDigit=-1;faded=!1;get ready(){return this.ctx!==null&&this.ctx.state==="running"}now(){return this.ctx?this.ctx.currentTime:performance.now()/1e3}init(){if(this.ctx)return;const t=window.AudioContext??window.webkitAudioContext;if(!t)return;const e=new t;this.ctx=e;const n=e.createGain();n.gain.value=this.muted?0:this.volume;const s=e.createDynamicsCompressor();s.threshold.value=-18,s.knee.value=24,s.ratio.value=4,s.attack.value=.005,s.release.value=.25;const r=e.createConvolver();r.buffer=wt(e,4.5);const o=e.createGain();o.gain.value=Tt;const a=e.createGain();a.gain.value=1,a.connect(s),r.connect(o),o.connect(s),s.connect(n),n.connect(e.destination),this.master=n,this.dry=a,this.drone.start(e,a),e.resume(),document.addEventListener("visibilitychange",this.onVisibility)}setScale(t){this.scale=t}setVolume(t){this.volume=Math.min(1,Math.max(0,t)),this.master&&this.ctx&&!this.muted&&this.master.gain.setTargetAtTime(this.volume,this.ctx.currentTime,.05)}setMuted(t){this.muted=t,this.master&&this.ctx&&this.master.gain.setTargetAtTime(t?0:this.volume,this.ctx.currentTime,.05)}get isMuted(){return this.muted}get currentScale(){return this.scale}playDigit(t,e,n=.16){if(!this.ctx||!this.dry||this.frozen)return;const s=this.ctx,r=Math.max(e??s.currentTime,s.currentTime),o=t===this.lastDigit;this.lastDigit=t;const a=rt(t,this.scale),l=q(s,this.dry,a,r,{gain:o?n*1.45:n,octave:o});this.track(l,r)}playX(t,e){if(!this.ctx||!this.dry)return;const n=Math.max(e??this.ctx.currentTime,this.ctx.currentTime);this.track(q(this.ctx,this.dry,pt(t,this.scale),n,{gain:.14}),n)}feynmanChord(){if(!this.ctx||!this.dry)return;const t=this.ctx,e=t.currentTime+.05;for(const n of Mt)this.track(q(t,this.dry,n,e,{gain:.12,decay:8,attack:.15}),e)}arpeggio(t){if(!this.ctx||!this.dry)return;const e=this.ctx;let n=e.currentTime+.1;for(const s of t)this.track(q(e,this.dry,rt(s,this.scale),n,{gain:.1,decay:3}),n),n+=.24}setFrozen(t){this.frozen=t,t||(this.lastDigit=-1)}track(t,e){for(this.voices.push({handle:t,startedAt:e});this.voices.length>xt;)this.voices.shift()?.handle.stop(.35);this.voices.length%8===0&&this.sweep()}sweep(){const t=this.ctx?.currentTime??0;this.voices=this.voices.filter(e=>t-e.startedAt<10)}onVisibility=()=>{!this.ctx||!this.master||(document.hidden?this.fadeTo(!0):this.fadeTo(!1))};fadeTo(t){if(!this.ctx||!this.master)return;const e=this.ctx,n=this.master.gain,s=t?1e-4:this.muted?0:this.volume;n.cancelScheduledValues(e.currentTime),n.setValueAtTime(Math.max(n.value,1e-4),e.currentTime),n.linearRampToValueAtTime(s,e.currentTime+.6),t?e.suspend().then(()=>{this.faded=!0}):this.faded&&(this.faded=!1,e.resume())}dispose(){document.removeEventListener("visibilitychange",this.onVisibility);for(const t of this.voices)t.handle.stop(.05);this.voices=[],this.drone.stop(.3),this.ctx?.close(),this.ctx=null}}const U=24;function Lt(i){const t=e=>{const n=Math.sin(e*12.9898)*43758.5453;return n-Math.floor(n)};return{x:.08+t(i+1)*.84,y:.12+t(i+7.13)*.76}}class kt{drops=[];add(t,e,n,s,r=.7){for(this.drops.push({x:t,y:e,birth:s,code:n,weight:r});this.drops.length>U;)this.drops.shift()}addAtIndex(t,e,n,s=.7){const r=Lt(t);this.add(r.x,r.y,e,n,s)}clear(){this.drops=[]}get count(){return this.drops.length}write(t){t.fill(0);const e=Math.min(this.drops.length,U);for(let n=0;n<e;n++){const s=this.drops[n],r=n*4;t[r]=s.x,t[r+1]=s.y,t[r+2]=s.birth,t[r+3]=s.code+Math.min(.99,Math.max(0,s.weight))}}}const Et=`#version 300 es\r
precision highp float;\r
\r
/**\r
 * π · Aura — главный fragment shader (GLSL ES 3.00).\r
 * Слои: фон → caustics → кольца-волны → metaballs → glow → tone mapping + grain + виньетка.\r
 */\r
\r
out vec4 fragColor;\r
\r
uniform vec2 uRes;\r
uniform float uTime;      // часы синхронизации (секунды)\r
uniform float uDive;      // 0..1 — «ныряние» камеры\r
uniform float uMirror;    // 0..1 — точка Фейнмана: зеркальная вода + вспышка\r
uniform float uMotion;    // 1.0 или 0.5 — prefers-reduced-motion\r
uniform vec2 uTilt;       // наклон телефона (гироскоп), -1..1\r
uniform float uPulse;     // пульс ядра π в такт нотам\r
uniform vec4 uDrops[24];  // x, y, birth, code+weight (пустой слот: code+weight == 0)\r
\r
const vec3 BG_TOP = vec3(0.039, 0.059, 0.141); // #0A0F24\r
const vec3 BG_BOTTOM = vec3(0.020, 0.024, 0.051); // #05060D\r
\r
// --- шум ---------------------------------------------------------------\r
\r
float hash21(vec2 p) {\r
  p = fract(p * vec2(123.34, 456.21));\r
  p += dot(p, p + 45.32);\r
  return fract(p.x * p.y);\r
}\r
\r
float vnoise(vec2 p) {\r
  vec2 i = floor(p);\r
  vec2 f = fract(p);\r
  vec2 u = f * f * (3.0 - 2.0 * f);\r
  float a = hash21(i);\r
  float b = hash21(i + vec2(1.0, 0.0));\r
  float c = hash21(i + vec2(0.0, 1.0));\r
  float d = hash21(i + vec2(1.0, 1.0));\r
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);\r
}\r
\r
float fbm(vec2 p) {\r
  float v = 0.0;\r
  float amp = 0.5;\r
  for (int i = 0; i < 4; i++) {\r
    v += amp * vnoise(p);\r
    p = p * 2.03 + 17.7;\r
    amp *= 0.5;\r
  }\r
  return v;\r
}\r
\r
vec3 paletteColor(float code) {\r
  // палитра 0–9, распакованная из одного float в цикле (константный индекс не нужен)\r
  int i = int(clamp(code, 0.0, 9.0));\r
  vec3 cols[10] = vec3[10](\r
    vec3(0.169, 0.165, 0.561),\r
    vec3(0.184, 0.322, 0.816),\r
    vec3(0.122, 0.525, 0.878),\r
    vec3(0.078, 0.722, 0.839),\r
    vec3(0.122, 0.851, 0.737),\r
    vec3(0.486, 0.941, 0.800),\r
    vec3(0.714, 0.949, 0.894),\r
    vec3(0.776, 0.714, 1.000),\r
    vec3(0.906, 0.651, 0.949),\r
    vec3(1.000, 0.827, 0.933)\r
  );\r
  return cols[i];\r
}\r
\r
void main() {\r
  vec2 frag = gl_FragCoord.xy / uRes;\r
  float aspect = uRes.x / max(uRes.y, 1.0);\r
  // координаты с поправкой на пропорции экрана\r
  vec2 p = (frag - 0.5) * vec2(aspect, 1.0);\r
\r
  float t = uTime * uMotion;\r
  float dive = uDive;\r
\r
  // --- 1. фон: почти чёрный градиент + «дыхание» -----------------------\r
  float breathe = 0.5 + 0.5 * sin(t * 0.12);\r
  vec3 col = mix(BG_BOTTOM, BG_TOP, frag.y * (0.85 + 0.15 * breathe));\r
  col *= 1.0 - 0.25 * dive;\r
\r
  // --- 2. caustics: световая сеть, очень низкая яркость ----------------\r
  vec2 cuv = p * (2.6 + 2.4 * dive) + uTilt * 0.25;\r
  cuv += vec2(t * 0.02, t * 0.013);\r
  float c1 = fbm(cuv);\r
  float c2 = fbm(cuv * 1.7 + 4.2 - vec2(t * 0.017, 0.0));\r
  float caustic = pow(abs(c1 - c2) * 2.0, 3.0);\r
  vec3 causticTint = mix(vec3(0.10, 0.22, 0.40), vec3(0.05, 0.12, 0.35), dive);\r
  col += causticTint * caustic * (0.16 - 0.08 * dive) * (1.0 - 0.8 * uMirror);\r
\r
  // --- 3. кольца-волны + 4. metaballs ----------------------------------\r
  float ringField = 0.0;\r
  float ballField = 0.0;\r
  vec3 glow = vec3(0.0);\r
\r
  for (int i = 0; i < 24; i++) {\r
    vec4 d = uDrops[i];\r
    float packed = d.w;\r
    if (packed <= 0.0) continue;\r
    float code = floor(packed);\r
    float weight = fract(packed);\r
    float age = uTime - d.z;\r
    if (age < 0.0) age = 0.0;\r
\r
    vec2 dp = (d.xy - 0.5) * vec2(aspect, 1.0);\r
    float r = length(p - dp);\r
    float damp = (1.0 - 0.85 * uMirror);\r
\r
    // кольцо: тонкий гребень (Ricker) — один яркий фронт + полутень по краям\r
    float dx = r - 0.22 * age;\r
    float q = dx * dx * 170.0; // ширина фронта ~0.11 по r\r
    float ring = (1.0 - q) * exp(-q) * exp(-0.55 * age);\r
    ringField += ring * weight * damp * exp(-r * 1.2);\r
\r
    // метабол: 1/(r²+ε) с быстрым затуханием — светит только возле капли\r
    float m = weight * (0.30 + 0.12 * sin(t * 1.7 + code)) * exp(-r * 4.5) / (r * r * 10.0 + 0.30);\r
    ballField += m * exp(-age * 0.5);\r
\r
    vec3 dc = paletteColor(code);\r
    glow += dc * exp(-r * 3.6) * weight * exp(-age * 0.55) * damp;\r
  }\r
\r
  // кольца: тонкая светящаяся линия + мягкая тень изнутри кольца\r
  float ringPos = max(ringField, 0.0);\r
  float ringGlow = ringPos * ringPos;\r
  col += vec3(0.55, 0.75, 1.0) * ringPos * 0.30 + vec3(0.8, 0.9, 1.0) * ringGlow * 0.24;\r
  col *= 1.0 - 0.10 * clamp(-ringField, 0.0, 1.0);\r
\r
  // metaballs: высокий порог — светятся только 2–3 слияющихся пятна\r
  float blob = smoothstep(0.85, 1.9, ballField);\r
  vec3 blobTint = mix(vec3(0.10, 0.28, 0.45), vec3(0.35, 0.55, 0.85), clamp(ballField * 0.4, 0.0, 1.0));\r
  col += blobTint * blob * (0.12 + 0.12 * uPulse);\r
\r
  // --- 5. аура: аддитивное свечение ------------------------------------\r
  col += glow * (0.5 + 0.5 * uPulse) * 0.30;\r
\r
  // --- зеркальность в точке Фейнмана + мягкая вспышка ------------------\r
  if (uMirror > 0.0) {\r
    // вода гасит волнение и отражает небо: холодный сдвиг\r
    float mirrorBand = smoothstep(0.0, 1.0, frag.y);\r
    col = mix(col, mix(col, vec3(0.04, 0.06, 0.11) + mirrorBand * 0.05, 0.6), uMirror);\r
    col += vec3(1.0, 0.98, 0.95) * 0.22 * uMirror; // мягкая белая вспышка\r
  }\r
\r
  // --- 7. финал: tone mapping + зерно + виньетка ------------------------\r
  col = col / (col + vec3(0.85));            // мягкое сжатие яркости\r
  col = pow(col, vec3(0.95));\r
\r
  float vig = smoothstep(1.35, 0.35, length(p));\r
  col *= mix(0.75, 1.0, vig);\r
\r
  float grain = (hash21(gl_FragCoord.xy + fract(t) * 371.0) - 0.5) * 0.028;\r
  col += grain;\r
\r
  fragColor = vec4(max(col, 0.0), 1.0);\r
}\r
`,At=`#version 300 es
layout(location = 0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;class Rt{canvas;gl=null;ctx2d=null;program=null;uLoc={};dropData=new Float32Array(U*4);scale=1;frameEma=16;frameCount=0;lost=!1;ripples;onResize;stats={fps:60,scale:1,mode:"webgl2"};constructor(t,e,n){this.canvas=t,this.ripples=e,this.onResize=n;const s=typeof matchMedia=="function"&&matchMedia("(prefers-reduced-motion: reduce)").matches;this.scale=s?.6:1,this.initGL(),this.bindContextEvents(),this.resize()}get renderScale(){return this.scale}get rendererStats(){return this.stats}setRenderScale(t){const e=Math.min(1,Math.max(.5,Math.round(t*10)/10));e!==this.scale&&(this.scale=e,this.resize())}initGL(){const t=this.canvas.getContext("webgl2",{antialias:!1,alpha:!1,depth:!1,stencil:!1,powerPreference:"high-performance"});if(!t){this.ctx2d=this.canvas.getContext("2d"),this.stats.mode="canvas2d";return}this.gl=t;const e=(a,l)=>{const c=t.createShader(a);return c?(t.shaderSource(c,l),t.compileShader(c),t.getShaderParameter(c,t.COMPILE_STATUS)?c:(console.error("shader:",t.getShaderInfoLog(c)),t.deleteShader(c),null)):null},n=e(t.VERTEX_SHADER,At),s=e(t.FRAGMENT_SHADER,Et);if(!n||!s){this.ctx2d=this.canvas.getContext("2d"),this.gl=null,this.stats.mode="canvas2d";return}const r=t.createProgram();if(!r)return;if(t.attachShader(r,n),t.attachShader(r,s),t.linkProgram(r),t.deleteShader(n),t.deleteShader(s),!t.getProgramParameter(r,t.LINK_STATUS)){console.error("link:",t.getProgramInfoLog(r)),t.deleteProgram(r),this.gl=null,this.ctx2d=this.canvas.getContext("2d"),this.stats.mode="canvas2d";return}this.program=r,t.useProgram(r);const o=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0);for(const a of["uRes","uTime","uDive","uMirror","uMotion","uTilt","uPulse","uDrops"])this.uLoc[a]=t.getUniformLocation(r,a)??t.getUniformLocation(r,`${a}[0]`)}bindContextEvents(){this.canvas.addEventListener("webglcontextlost",t=>{t.preventDefault(),this.lost=!0}),this.canvas.addEventListener("webglcontextrestored",()=>{this.gl=null,this.program=null,this.initGL(),this.lost=!1,this.resize()})}resize(){const t=Math.min(globalThis.devicePixelRatio||1,2),e=Math.max(1,Math.round(this.canvas.clientWidth*t*this.scale)),n=Math.max(1,Math.round(this.canvas.clientHeight*t*this.scale));(this.canvas.width!==e||this.canvas.height!==n)&&(this.canvas.width=e,this.canvas.height=n,this.gl?.viewport(0,0,e,n),this.onResize(e,n))}adapt(t){this.frameEma=this.frameEma*.95+t*.05,this.frameCount++,this.frameCount>=60&&(this.frameCount=0,this.frameEma>20?this.setRenderScale(this.scale-.1):this.frameEma<12&&this.scale<1&&this.setRenderScale(this.scale+.1)),this.stats.fps=Math.round(1e3/Math.max(this.frameEma,1)),this.stats.scale=this.scale}render(t){const e=performance.now();if(this.lost||this.gl===null&&this.ctx2d===null){this.adapt(performance.now()-e);return}this.gl&&this.program&&!this.gl.isContextLost()?this.renderGL(t):this.ctx2d&&this.render2D(t),this.adapt(performance.now()-e)}renderGL(t){const e=this.gl,n=this.program;!e||!n||(e.useProgram(n),e.uniform2f(this.uLoc.uRes,this.canvas.width,this.canvas.height),e.uniform1f(this.uLoc.uTime,t.time),e.uniform1f(this.uLoc.uDive,t.dive),e.uniform1f(this.uLoc.uMirror,t.mirror),e.uniform1f(this.uLoc.uMotion,t.motion),e.uniform2f(this.uLoc.uTilt,t.tilt[0],t.tilt[1]),e.uniform1f(this.uLoc.uPulse,t.pulse),this.ripples.write(this.dropData),e.uniform4fv(this.uLoc.uDrops,this.dropData),e.drawArrays(e.TRIANGLES,0,3))}render2D(t){const e=this.ctx2d;if(!e)return;const n=this.canvas.width,s=this.canvas.height,r=e.createLinearGradient(0,0,0,s);r.addColorStop(0,"#0A0F24"),r.addColorStop(1,"#05060D"),e.fillStyle=r,e.fillRect(0,0,n,s);const o=this.dropData;this.ripples.write(o);for(let a=0;a<U;a++){if(o[a*4+3]<=0)continue;const c=t.time-o[a*4+2];if(c<0)continue;const m=o[a*4]*n,v=(1-o[a*4+1])*s,x=Math.exp(-c*.5)*.5*(1-t.mirror*.85),T=Math.min(n,s)*.06+c*Math.min(n,s)*.22;e.strokeStyle=`rgba(140, 200, 255, ${Math.max(0,x)})`,e.lineWidth=Math.max(1,s*.004),e.beginPath(),e.arc(m,v,T,0,Math.PI*2),e.stroke(),e.fillStyle=`rgba(90, 150, 255, ${Math.max(0,x*.5)})`,e.beginPath(),e.arc(m,v,Math.min(n,s)*.03,0,Math.PI*2),e.fill()}}dispose(){this.gl&&this.program&&this.gl.deleteProgram(this.program),this.gl=null,this.ctx2d=null}}const Ct="6 дев’яток поспіль. π теж уміє дивувати",Dt="Ти чуєш цифру № {n}. Такої мелодії більше не буде",Ft="Ти вже чув(ла) {n} цифр. Сьогодні — далі",It={"intro.touch":"Торкнись, щоб почути нескінченність","hud.digit":"π · цифра {n}","menu.title":"Налаштування","menu.language":"Мова","menu.sound":"Звук","menu.scale":"Гама","menu.scale.major":"Мажор","menu.scale.minor":"Мінор","menu.speed":"Швидкість","menu.save":"Зберегти мить","menu.about":"Про π","menu.restart":"Почати спочатку","menu.restart.confirm":"Скинути позицію в π?","menu.close":"Закрити",feynman:Ct,infinite:Dt,resume:Ft,"about.text":"π = 3,14159… Її цифри ніколи не стають циклом, тому ця мелодія ніколи не повториться. Кожна цифра — одна нота й одна крапля світла.","save.caption":"π · цифра {n}","menu.pause":"Пауза","menu.resume":"Далі","gesture.freeze":"Останні 10 цифр"},Pt="Six nines in a row. π can be surprising too",Ot="You’re hearing digit № {n}. This melody will never play again",$t="You’ve already heard {n} digits. Today, we go further",_t={"intro.touch":"Touch to hear infinity","hud.digit":"π · digit {n}","menu.title":"Settings","menu.language":"Language","menu.sound":"Sound","menu.scale":"Scale","menu.scale.major":"Major","menu.scale.minor":"Minor","menu.speed":"Speed","menu.save":"Save this moment","menu.about":"About π","menu.restart":"Start over","menu.restart.confirm":"Reset your place in π?","menu.close":"Close",feynman:Pt,infinite:Ot,resume:$t,"about.text":"π = 3.14159… Its digits never fall into a loop, so this melody never repeats. Each digit is one note and one drop of light.","save.caption":"π · digit {n}","menu.pause":"Pause","menu.resume":"Resume","gesture.freeze":"Last 10 digits"},qt=["uk","en"],Gt={uk:It,en:_t};let k="uk";const tt=new Set;function Nt(){let i=null;try{i=globalThis.localStorage?.getItem("pi.lang")??null}catch{}return i==="uk"||i==="en"?i:(typeof navigator<"u"?(navigator.language??"").toLowerCase():"").startsWith("uk")?"uk":"en"}function lt(){return k}function Vt(i){if(qt.includes(i)){k=i;try{globalThis.localStorage?.setItem("pi.lang",i)}catch{}typeof document<"u"&&(document.documentElement.lang=i);for(const t of tt)t(i)}}function nt(i){return tt.add(i),()=>tt.delete(i)}function u(i,t){let e=Gt[k][i]??String(i);if(t)for(const[n,s]of Object.entries(t))e=e.split(`{${n}}`).join(String(s));return e}function st(i,t=k){return new Intl.NumberFormat(t==="uk"?"uk-UA":"en-US").format(i)}function zt(){return k=Nt(),typeof document<"u"&&(document.documentElement.lang=k),k}function*G(){let i=1n,t=0n,e=1n,n=1n,s=3n,r=3n;for(;;)if(4n*i+t-e<s*e){yield Number(s);const o=10n*(t-s*e);s=10n*(3n*i+t)/e-10n*s,i*=10n,t=o}else{const o=(2n*i+t)*r,a=(i*(7n*n)+2n+t*r)/(e*r);i*=n,e*=r,r+=2n,n+=1n,s=a,t=o}}const N="999999";class Ut{window="";foundAt=-1;push(t,e){return this.foundAt>=0?!1:(this.window+=String(t),this.window.length>N.length&&(this.window=this.window.slice(-N.length)),this.window===N?(this.foundAt=e-N.length+1,!0):!1)}get position(){return this.foundAt}reset(){this.window="",this.foundAt=-1}}const K=200,Bt=64,V="pi.index";function jt(i){try{return globalThis.localStorage?.getItem(i)??null}catch{return null}}function W(i,t){try{globalThis.localStorage?.setItem(i,t)}catch{}}class B{consumed=0;buffer=[];generator=null;worker=null;waiters=[];savedUpTo=0;constructor(t=B.loadIndex()){this.consumed=t,this.savedUpTo=t,this.start(t)}static loadIndex(){const t=jt(V),e=t===null?0:parseInt(t,10);return Number.isFinite(e)&&e>0?e:0}static resetIndex(){W(V,"0")}get index(){return this.consumed}get ahead(){return this.buffer.length}start(t){try{this.worker=new Worker(new URL(""+new URL("piWorker-CeISX1Zl.js",import.meta.url).href,import.meta.url),{type:"module"}),this.worker.onmessage=e=>{const n=e.data;n.type==="digits"&&(this.buffer.push(...n.digits),this.notify(),this.buffer.length<K&&this.requestMore())},this.worker.onerror=()=>{this.worker?.terminate(),this.worker=null,this.generator=G(),this.pumpMain()},this.worker.postMessage({type:"start",from:t})}catch{this.worker=null,this.generator=G(),this.pumpMain()}}requestMore(){this.worker?this.worker.postMessage({type:"need"}):this.pumpMain()}pumpMain(){this.generator||(this.generator=G());let t=0;for(;t<Bt;){const e=this.generator.next();if(e.done)break;this.buffer.push(e.value),t++}this.buffer.length<K&&t>0&&(typeof queueMicrotask=="function"?queueMicrotask(()=>this.pumpMain()):setTimeout(()=>this.pumpMain(),0)),this.notify()}take(){if(this.buffer.length===0)return this.requestMore(),null;const t=this.buffer.shift(),e=this.consumed;return this.consumed++,this.persist(),this.buffer.length<K&&this.requestMore(),{digit:t,index:e}}onDigits(t){this.waiters.push(t)}notify(){if(this.buffer.length===0)return;const t=this.waiters;this.waiters=[];for(const e of t)e(this.buffer[0],this.consumed)}persist(){this.consumed-this.savedUpTo>=10&&(this.savedUpTo=this.consumed,W(V,String(this.consumed)))}reset(){this.buffer=[],this.consumed=0,this.savedUpTo=0,B.resetIndex(),this.worker?this.worker.postMessage({type:"start",from:0}):(this.generator=G(),this.pumpMain())}flush(){W(V,String(this.consumed)),this.savedUpTo=this.consumed}dispose(){this.flush(),this.worker?.terminate(),this.worker=null}}const Yt=600,Xt=60;class Kt{cbs;started=!1;downX=0;downY=0;moved=!1;longTimer=0;longFired=!1;pointerId=-1;orientationAsked=!1;constructor(t,e){this.cbs=e,t.style.touchAction="none",t.addEventListener("pointerdown",this.onDown),t.addEventListener("pointermove",this.onMove),t.addEventListener("pointerup",this.onUp),t.addEventListener("pointercancel",this.onUp),document.addEventListener("keydown",this.onKey)}requestOrientation(){if(this.orientationAsked)return;this.orientationAsked=!0;const t=window.DeviceOrientationEvent;t&&typeof t.requestPermission=="function"?t.requestPermission().then(e=>{e==="granted"&&window.addEventListener("deviceorientation",this.onOrient)}).catch(()=>{}):t&&window.addEventListener("deviceorientation",this.onOrient)}onOrient=t=>{t.alpha===null||t.beta===null||this.cbs.onTilt(t.alpha,t.beta)};onDown=t=>{this.pointerId===-1&&(this.pointerId=t.pointerId,this.downX=t.clientX,this.downY=t.clientY,this.moved=!1,this.longFired=!1,this.started||(this.started=!0,this.cbs.onFirstTouch(),this.requestOrientation()),clearTimeout(this.longTimer),this.longTimer=window.setTimeout(()=>{this.moved||(this.longFired=!0,this.cbs.onFreeze())},Yt))};onMove=t=>{t.pointerId===this.pointerId&&(Math.abs(t.clientX-this.downX)>12||Math.abs(t.clientY-this.downY)>12)&&(this.moved=!0,clearTimeout(this.longTimer))};onUp=t=>{if(t.pointerId!==this.pointerId||(this.pointerId=-1,clearTimeout(this.longTimer),this.longFired))return;const e=t.clientX-this.downX,n=t.clientY-this.downY;if(Math.abs(n)>Xt&&Math.abs(n)>Math.abs(e)){this.cbs.onSwipe(n<0);return}if(this.moved)return;const s=t.currentTarget.getBoundingClientRect(),r=(t.clientX-s.left)/Math.max(s.width,1),o=1-(t.clientY-s.top)/Math.max(s.height,1);this.cbs.onTap(r,o)};onKey=t=>{const e=t.target;if(!(e&&(e.tagName==="INPUT"||e.tagName==="TEXTAREA"))){if(!this.started&&(t.key===" "||t.key==="Enter")){this.started=!0,this.cbs.onFirstTouch(),t.preventDefault();return}switch(t.key){case" ":t.preventDefault(),this.cbs.onFreeze();break;case"m":case"M":case"ь":case"Ь":this.cbs.onMenuToggle();break;case"ArrowRight":this.cbs.onSpeedKey(1);break;case"ArrowLeft":this.cbs.onSpeedKey(-1);break;case"Escape":this.cbs.onClose();break}}};dispose(){clearTimeout(this.longTimer),document.removeEventListener("keydown",this.onKey),window.removeEventListener("deviceorientation",this.onOrient)}}class Wt{root;intro;counter;toast;pulse;digit=0;toastTimer=0;constructor(t){this.root=t,this.root.innerHTML=`
      <div class="hud-intro" id="intro" role="status">
        <span class="hud-intro__text"></span>
      </div>
      <div class="hud-bottom">
        <span class="hud-counter" id="counter" aria-live="polite"></span>
        <button class="hud-menu-dot" id="menu-dot" aria-label="" aria-haspopup="dialog">◌</button>
      </div>
      <div class="hud-toast" id="toast" role="status" aria-live="polite"></div>
      <div class="hud-pulse" id="pulse" aria-hidden="true"></div>
    `,this.intro=t.querySelector("#intro"),this.counter=t.querySelector("#counter"),this.toast=t.querySelector("#toast"),this.pulse=t.querySelector("#pulse"),this.apply(),nt(()=>this.apply())}apply(){this.intro.querySelector(".hud-intro__text").textContent=u("intro.touch"),this.renderCounter(),this.root.querySelector("#menu-dot").setAttribute("aria-label",u("menu.title"))}renderCounter(){this.counter.textContent=u("hud.digit",{n:st(this.digit+1)})}get menuButton(){return this.root.querySelector("#menu-dot")}setDigit(t){this.digit=t,this.renderCounter()}hideIntro(){this.intro.classList.add("is-hidden")}showIntro(){this.intro.classList.remove("is-hidden")}flash(t,e,n=4200){this.toast.textContent=u(t,e),this.toast.classList.add("is-visible"),clearTimeout(this.toastTimer),this.toastTimer=window.setTimeout(()=>{this.toast.classList.remove("is-visible")},n)}flashRaw(t,e=900){this.toast.textContent=t,this.toast.classList.add("is-visible"),clearTimeout(this.toastTimer),this.toastTimer=window.setTimeout(()=>{this.toast.classList.remove("is-visible")},e)}beat(){this.pulse.classList.remove("is-beating"),this.pulse.offsetWidth,this.pulse.classList.add("is-beating")}setFrozenLabel(t){if(!t){this.toast.classList.remove("is-visible");return}this.toast.textContent=`${u("gesture.freeze")}: ${t.join(" · ")}`,this.toast.classList.add("is-visible")}}const b={volume:"pi.volume",muted:"pi.muted",scale:"pi.scale",speed:"pi.speed"};function H(i){try{return globalThis.localStorage?.getItem(i)??null}catch{return null}}function I(i,t){try{globalThis.localStorage?.setItem(i,t)}catch{}}function Ht(){const i=(t,e)=>{const n=H(t);if(n===null)return e;const s=parseFloat(n);return Number.isFinite(s)?s:e};return{volume:Math.min(1,Math.max(0,i(b.volume,.8))),muted:H(b.muted)==="1",scale:H(b.scale)==="minor"?"minor":"major",speed:Math.min(2,Math.max(.5,i(b.speed,1)))}}class Qt{sheet;backdrop;confirmTimer=0;actions;state;constructor(t,e,n){this.state=e,this.actions=n,this.backdrop=document.createElement("div"),this.backdrop.className="menu-backdrop",this.backdrop.id="menu-backdrop",this.sheet=document.createElement("section"),this.sheet.className="menu-sheet glass",this.sheet.id="menu-sheet",this.sheet.setAttribute("role","dialog"),this.sheet.setAttribute("aria-modal","true"),this.sheet.setAttribute("aria-hidden","true"),this.sheet.setAttribute("aria-label",u("menu.title")),t.appendChild(this.backdrop),t.appendChild(this.sheet),this.render(),nt(()=>this.render()),this.backdrop.addEventListener("click",()=>this.close()),document.addEventListener("keydown",this.onKey);let s=0;this.sheet.addEventListener("pointerdown",r=>{s=r.clientY},{passive:!0}),this.sheet.addEventListener("pointerup",r=>{r.clientY-s>70&&this.close()},{passive:!0})}get isOpen(){return this.sheet.classList.contains("is-open")}onKey=t=>{if(t.key==="Escape"&&this.isOpen){t.stopPropagation(),this.close();return}if(t.key==="Tab"&&this.isOpen){const e=this.sheet.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])');if(e.length===0)return;const n=e[0],s=e[e.length-1];t.shiftKey&&document.activeElement===n?(t.preventDefault(),s.focus()):!t.shiftKey&&document.activeElement===s&&(t.preventDefault(),n.focus())}};open(){this.sheet.classList.add("is-open"),this.backdrop.classList.add("is-visible"),this.sheet.setAttribute("aria-hidden","false"),this.sheet.querySelector("button, input")?.focus()}close(){this.sheet.classList.remove("is-open"),this.backdrop.classList.remove("is-visible"),this.sheet.setAttribute("aria-hidden","true")}toggle(){this.isOpen?this.close():this.open()}render(){const t=this.state,e=lt();this.sheet.setAttribute("aria-label",u("menu.title")),this.sheet.innerHTML=`
      <div class="menu-handle" aria-hidden="true"></div>
      <h2 class="menu-title">${u("menu.title")}</h2>

      <div class="menu-group">
        <span class="menu-label" id="lb-lang">${u("menu.language")}</span>
        <div class="segment" role="radiogroup" aria-labelledby="lb-lang">
          <button class="segment__btn ${e==="uk"?"is-active":""}" data-lang="uk" role="radio" aria-checked="${e==="uk"}">УКР</button>
          <button class="segment__btn ${e==="en"?"is-active":""}" data-lang="en" role="radio" aria-checked="${e==="en"}">ENG</button>
        </div>
      </div>

      <div class="menu-group">
        <span class="menu-label" id="lb-sound">${u("menu.sound")}</span>
        <div class="menu-row">
          <button class="icon-btn" id="btn-mute" aria-label="${u("menu.sound")}" aria-pressed="${t.muted}">${t.muted?"🔇":"🔊"}</button>
          <input type="range" id="volume" min="0" max="100" value="${Math.round(t.volume*100)}" aria-labelledby="lb-sound" />
        </div>
      </div>

      <div class="menu-group">
        <span class="menu-label" id="lb-scale">${u("menu.scale")}</span>
        <div class="segment" role="radiogroup" aria-labelledby="lb-scale">
          <button class="segment__btn ${t.scale==="major"?"is-active":""}" data-scale="major" role="radio" aria-checked="${t.scale==="major"}">${u("menu.scale.major")}</button>
          <button class="segment__btn ${t.scale==="minor"?"is-active":""}" data-scale="minor" role="radio" aria-checked="${t.scale==="minor"}">${u("menu.scale.minor")}</button>
        </div>
      </div>

      <div class="menu-group">
        <span class="menu-label" id="lb-speed">${u("menu.speed")} · <span id="speed-val">${Q(t.speed)}</span></span>
        <input type="range" id="speed" min="50" max="200" step="25" value="${Math.round(t.speed*100)}" aria-labelledby="lb-speed" />
      </div>

      <div class="menu-actions">
        <button class="text-btn" id="btn-save">${u("menu.save")}</button>
        <details class="about">
          <summary class="text-btn" id="btn-about">${u("menu.about")}</summary>
          <p class="about-text">${u("about.text")}</p>
        </details>
        <button class="text-btn text-btn--danger" id="btn-restart">${u("menu.restart")}</button>
      </div>

      <button class="menu-close" id="btn-close" aria-label="${u("menu.close")}">${u("menu.close")}</button>
    `,this.bind()}bind(){const t=o=>this.sheet.querySelector(o);t("#btn-close")?.addEventListener("click",()=>this.close()),this.sheet.querySelectorAll("[data-lang]").forEach(o=>o.addEventListener("click",()=>{const a=o.dataset.lang;Vt(a),this.actions.onLang(a)})),this.sheet.querySelectorAll("[data-scale]").forEach(o=>o.addEventListener("click",()=>{const a=o.dataset.scale;this.state.scale=a,I(b.scale,a),this.actions.onScale(a)}));const e=t("#volume");e?.addEventListener("input",()=>{const o=Number(e.value)/100;this.state.volume=o,o>0&&this.state.muted&&(this.state.muted=!1,I(b.muted,"0"),this.actions.onMute(!1)),I(b.volume,String(o)),this.actions.onVolume(o)}),t("#btn-mute")?.addEventListener("click",()=>{this.state.muted=!this.state.muted,I(b.muted,this.state.muted?"1":"0"),this.actions.onMute(this.state.muted),this.render()});const s=t("#speed");s?.addEventListener("input",()=>{const o=Number(s.value)/100;this.state.speed=o,I(b.speed,String(o));const a=t("#speed-val");a&&(a.textContent=Q(o)),this.actions.onSpeed(o)}),t("#btn-save")?.addEventListener("click",()=>{this.actions.onSave()});const r=t("#btn-restart");r?.addEventListener("click",()=>{r.classList.contains("is-confirming")?(clearTimeout(this.confirmTimer),this.actions.onRestart()):(r.classList.add("is-confirming"),r.textContent=u("menu.restart.confirm"),this.confirmTimer=window.setTimeout(()=>{r.classList.remove("is-confirming"),r.textContent=u("menu.restart")},4e3))})}setSpeedUi(t){this.state.speed=t;const e=this.sheet.querySelector("#speed-val");e&&(e.textContent=Q(t));const n=this.sheet.querySelector("#speed");n&&(n.value=String(Math.round(t*100)))}dispose(){document.removeEventListener("keydown",this.onKey),this.sheet.remove(),this.backdrop.remove()}}function Q(i){return`${String(Math.round(i*100)/100)}×`}async function Zt(i,t,e){t();const n=i,s=n.width,r=n.height,o=Math.round(r*.12),a=document.createElement("canvas");a.width=s,a.height=r+o;const l=a.getContext("2d");if(!l)return;l.fillStyle="#05060D",l.fillRect(0,0,a.width,a.height),l.drawImage(n,0,0);const c=Math.max(18,Math.round(r*.035));l.font=`200 ${c}px -apple-system, "SF Pro Display", Inter, system-ui, sans-serif`,l.textAlign="center",l.fillStyle="rgba(255,255,255,0.85)",l.fillText(u("save.caption",{n:st(e+1)}),s/2,r+o*.55),l.fillStyle="rgba(255,255,255,0.45)",l.font=`200 ${Math.round(c*.8)}px -apple-system, "SF Pro Display", Inter, system-ui, sans-serif`,l.fillText("π",s/2,r+o*.85);const m=await new Promise(S=>a.toBlob(g=>S(g),"image/png"));if(!m)return;const v=`pi-aura-${e+1}.png`,x=new File([m],v,{type:"image/png"}),T=navigator;if(T.canShare&&T.share&&T.canShare({files:[x]}))try{await T.share({files:[x],title:"π · Aura"});return}catch{}const f=URL.createObjectURL(m),p=document.createElement("a");p.href=f,p.download=v,p.click(),setTimeout(()=>URL.revokeObjectURL(f),5e3)}zt();const Z=.25,Jt=1.5,te=.12,ut=document.getElementById("app"),it=document.getElementById("water"),J=document.getElementById("core"),_=Ht(),ht=typeof matchMedia=="function"&&matchMedia("(prefers-reduced-motion: reduce)").matches,C=new kt,O=new Rt(it,C,()=>{}),h=new St,d=new Wt(ut),y=new B,dt=new Ut;let L=_.speed,F=!1,M=!1,w=0,et=0,E=0,j=performance.now(),A=0,z=-1,Y=[0,0],P=[0,0];const D=[];let ot=0;const R=()=>{const i=h.ctx;return i?i.state!=="running"?(et=performance.now()/1e3-i.currentTime,performance.now()/1e3):i.currentTime+et:performance.now()/1e3},$=new Qt(ut,_,{onVolume:i=>h.setVolume(i),onMute:i=>h.setMuted(i),onScale:i=>h.setScale(i),onSpeed:i=>{L=i},onSave:()=>{Zt(it,mt,y.index),$.close()},onRestart:()=>{y.reset(),dt.reset(),D.length=0,d.setDigit(0),E=R()+.3},onLang:()=>{}});h.setScale(_.scale);h.setVolume(_.volume);h.setMuted(_.muted);nt(()=>{y.index>0&&d.setDigit(y.index-1)});function ee(i){const t=y.take();if(!t){E=R()+.1,y.onDigits(()=>{});return}const{digit:e,index:n}=t;D.push(e),D.length>10&&D.shift();const s=Math.max(0,i-R());h.playDigit(e,h.ctx?h.ctx.currentTime+s:void 0);const r=w+s;C.addAtIndex(n,e,r,.7),d.setDigit(n),d.beat(),J.classList.remove("is-beating"),J.offsetWidth,J.classList.add("is-beating"),A=1,dt.push(e,n)&&(h.feynmanChord(),z=w,d.flash("feynman",void 0,6e3))}function ne(){if(!F||M)return;const i=R();let t=0;for(;E<=i+te&&t++<4;)ee(E),E+=Jt/L}function se(i){const t=i%330;if(t<300){const e=t/300;return e*e*(3-2*e)}if(t<320){const e=(t-300)/20;return 1-e*e*(3-2*e)}return 0}function ie(i){if(z<0)return 0;const t=i-z;if(t>7)return z=-1,0;const e=Math.min(1,t/.8),n=t<4.5?1:1-(t-4.5)/2.5;return Math.max(0,Math.min(e,n))*(ht?.4:1)}function mt(){P[0]+=(Y[0]-P[0])*.06,P[1]+=(Y[1]-P[1])*.06,O.render({time:w,dive:se(w),mirror:ie(w),motion:ht?.5:1,tilt:P,pulse:A})}function ft(i){requestAnimationFrame(ft);const t=Math.min(.1,(i-j)/1e3);j=i,!document.hidden&&(M||(w+=t,ne()),A*=Math.exp(-t*2.2),A<.01&&(A=0),mt())}function re(){if(F)return;F=!0,h.init(),h.ctx&&(et=performance.now()/1e3-h.ctx.currentTime),d.hideIntro(),E=R()+.35;const i=y.index;i>0?d.flash("resume",{n:st(i,lt())},5200):d.flash("infinite",{n:1},5200)}function oe(){F&&(M=!M,h.setFrozen(M),M?(ot=R(),d.setFrozenLabel([...D]),h.arpeggio([...D])):(E+=R()-ot,d.setFrozenLabel(null)))}function at(i){L=Math.min(2,Math.max(.5,Math.round((L+i)*100)/100)),$.setSpeedUi(L),d.flashRaw(`${L}×`,900)}new Kt(it,{onFirstTouch:re,onTap:(i,t)=>{!F||M||(h.playX(i),C.add(i,t,Math.min(9,Math.max(0,Math.floor(i*10))),w,.85),d.beat(),A=Math.max(A,.8))},onSwipe:i=>at(i?Z:-Z),onFreeze:oe,onMenuToggle:()=>$.toggle(),onClose:()=>$.close(),onSpeedKey:i=>at(i*Z),onTilt:(i,t)=>{Y[0]=Math.max(-1,Math.min(1,(i-180)/45)),Y[1]=Math.max(-1,Math.min(1,(t-45)/45))}});d.menuButton.addEventListener("click",()=>$.toggle());window.addEventListener("pagehide",()=>y.flush());document.addEventListener("visibilitychange",()=>{document.hidden&&(y.flush(),j=performance.now())});window.addEventListener("resize",()=>O.resize());window.addEventListener("orientationchange",()=>O.resize());"serviceWorker"in navigator&&location.protocol.startsWith("http")&&window.addEventListener("load",()=>{navigator.serviceWorker.register("./sw.js").catch(()=>{})});j=performance.now();requestAnimationFrame(ft);location.hash.startsWith("#debug")&&(window.__aura={seed(i){C.clear();for(let t=0;t<i;t++){const e=(t*3+2)%10;C.add(t*.04+.12,.15+t*37%70/100,e,w-t%4*.8,.7)}},state(){return{waterTime:w,speed:L,started:F,frozen:M,drops:C.count,fps:O.rendererStats.fps,mode:O.rendererStats.mode}}});
