/**
 * Симуляция высоты воды: heightfield с ping-pong текстурami.
 *
 * Состояние в текстуре RGBA16F:
 *   R = высота, G = скорость, B = нормаль.x, A = normale.z
 *
 * Два прохода каждый кадр:
 *  1. «Капля» — добавляет pending-капли к высоте (мягкий колокол).
 *  2. «Шаг волны» — волновое уравнение.
 *
 * Требуется EXT_color_buffer_float / EXT_color_buffer_half_float.
 * Если расширения нет — Sim не инициализируется (legacy fallback).
 */

const vertexSrc = `#version 300 es
layout(location = 0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const stepSrc = `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform float uDamping;
uniform float uWaveSpeed;
in vec2 vUv;
out vec4 o;
void main(){
  vec4 s = texture(uState, vUv);
  float avg = (
    texture(uState, vUv + vec2(uTexel.x, 0.0)).r +
    texture(uState, vUv - vec2(uTexel.x, 0.0)).r +
    texture(uState, vUv + vec2(0.0, uTexel.y)).r +
    texture(uState, vUv - vec2(0.0, uTexel.y)).r
  ) * 0.25;
  s.g += (avg - s.r) * uWaveSpeed;
  s.g *= uDamping;
  s.r += s.g;
  float dx = texture(uState, vUv + vec2(uTexel.x, 0.0)).r - s.r;
  float dz = texture(uState, vUv + vec2(0.0, uTexel.y)).r - s.r;
  s.ba = normalize(vec3(-dx, 1.0, -dz)).xz;
  o = s;
}
`;

﻿

const dropSrc = `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform vec4 uDrops[8];
uniform int uDropCount;
in vec2 vUv;
out vec4 o;
void main(){
  vec4 s = texture(uState, vUv);
  for (int i = 0; i < 8; i++) {
    if (i >= uDropCount) break;
    vec4 d = uDrops[i];
    float dist = length(d.xy - vUv);
    float t = max(0.0, 1.0 - dist / d.z);
    if (t > 0.0) {
      float bell = 0.5 - cos(t * 3.14159265) * 0.5;
      s.r += bell * d.w;
    }
  }
  o = s;
}
`;

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error('sim shader:', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function createProgram(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram | null {
  const vsh = compileShader(gl, gl.VERTEX_SHADER, vs);
  const fsh = compileShader(gl, gl.FRAGMENT_SHADER, fs);
  if (!vsh || !fsh) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vsh);
  gl.attachShader(prog, fsh);
  gl.linkProgram(prog);
  gl.deleteShader(vsh);
  gl.deleteShader(fsh);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('sim link:', gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

function createTexture(gl: WebGL2RenderingContext, w: number, h: number): WebGLTexture {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0,
    gl.RGBA, gl.HALF_FLOAT, null,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function createFramebuffer(gl: WebGL2RenderingContext, tex: WebGLTexture): WebGLFramebuffer {
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return fb;
}

export interface Drop {
  x: number;
  y: number;
  radius: number;
  strength: number;
}

export class Sim {
  private gl!: WebGL2RenderingContext;
  private texA!: WebGLTexture;
  private texB!: WebGLTexture;
  private fbA!: WebGLFramebuffer;
  private fbB!: WebGLFramebuffer;
  private stepProg!: WebGLProgram;
  private dropProg!: WebGLProgram;
  private uStep: Record<string, WebGLUniformLocation | null> = {};
  private uDrop: Record<string, WebGLUniformLocation | null> = {};
  private width = 0;
  private height = 0;
  private pending: Drop[] = [];
  private initialized = false;

  init(gl: WebGL2RenderingContext, w: number, h: number): boolean {
    this.gl = gl;
    this.width = w;
    this.height = h;

    if (
      !gl.getExtension('EXT_color_buffer_float') &&
      !gl.getExtension('EXT_color_buffer_half_float')
    )
      return false;

    const stepProg = createProgram(gl, vertexSrc, stepSrc);
    const dropProg = createProgram(gl, vertexSrc, dropSrc);
    if (!stepProg || !dropProg) return false;
    this.stepProg = stepProg;
    this.dropProg = dropProg;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.texA = createTexture(gl, w, h);
    this.texB = createTexture(gl, w, h);
    this.fbA = createFramebuffer(gl, this.texA);
    this.fbB = createFramebuffer(gl, this.texB);

    for (const name of ['uState', 'uTexel', 'uDamping', 'uWaveSpeed']) {
      this.uStep[name] = gl.getUniformLocation(stepProg, name);
    }
    for (const name of ['uState', 'uTexel', 'uDrops', 'uDropCount']) {
      this.uDrop[name] = gl.getUniformLocation(dropProg, name);
    }

    this.clear();
    this.initialized = true;
    return true;
  }

  private clear(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbA);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.stepProg);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbB);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  addDrop(x: number, y: number, radius: number, strength: number): void {
    this.pending.push({ x, y, radius, strength });
  }

  step(): void {
    if (!this.initialized) return;
    const gl = this.gl;
    gl.viewport(0, 0, this.width, this.height);

    // проход 1: капли (texA -> texB)
    gl.useProgram(this.dropProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbB);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texA);
    gl.uniform1i(this.uDrop.uState!, 0);
    gl.uniform2f(this.uDrop.uTexel!, 1 / this.width, 1 / this.height);
    gl.uniform1i(this.uDrop.uDropCount!, Math.min(this.pending.length, 8));
    if (this.pending.length > 0) {
      const data = new Float32Array(8 * 4);
      const n = Math.min(this.pending.length, 8);
      for (let i = 0; i < n; i++) {
        const d = this.pending[i];
        const o = i * 4;
        data[o] = d.x;
        data[o + 1] = d.y;
        data[o + 2] = d.radius;
        data[o + 3] = d.strength;
      }
      gl.uniform4fv(this.uDrop.uDrops!, data);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.pending = [];

    // проход 2: шаг волны (texB -> texA)
    gl.useProgram(this.stepProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbA);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texB);
    gl.uniform1i(this.uStep.uState!, 0);
    gl.uniform2f(this.uStep.uTexel!, 1 / this.width, 1 / this.height);
    gl.uniform1f(this.uStep.uDamping!, 0.996);
    gl.uniform1f(this.uStep.uWaveSpeed!, 2.0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  getStateTexture(): WebGLTexture {
    return this.texA;
  }

  getStateWidth(): number {
    return this.width;
  }

  getStateHeight(): number {
    return this.height;
  }

  isReady(): boolean {
    return this.initialized;
  }

  dispose(): void {
    const gl = this.gl;
    if (this.stepProg) gl.deleteProgram(this.stepProg);
    if (this.dropProg) gl.deleteProgram(this.dropProg);
    if (this.texA) gl.deleteTexture(this.texA);
    if (this.texB) gl.deleteTexture(this.texB);
    if (this.fbA) gl.deleteFramebuffer(this.fbA);
    if (this.fbB) gl.deleteFramebuffer(this.fbB);
    this.initialized = false;
  }
}
