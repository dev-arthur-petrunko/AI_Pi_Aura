/**
 * Симуляция высоты воды: heightfield с ping-pong текстурami.
 *
 * Состояние в текстуре RGBA16F:
 *   R = высота, G = скорость, BA = нормаль (x, z)
 *
 * Два прохода каждый кадр:
 *  1. «Шаг волны» — волновое уравнение.
 *  2. «Капля» — добавляет pending-капли к высоте (мягкий колокол).
 *
 * Требуется EXT_color_buffer_float / EXT_color_buffer_half_float.
 * Если расширения нет — Sim не инициализируется (fallback: градиент + надпись).
 */

import simSrc from './shaders/sim.frag.glsl?raw';
import dropSrc from './shaders/drop.frag.glsl?raw';
import fullscreenVert from './shaders/fullscreen.vert.glsl?raw';

const vertexSrc = fullscreenVert;

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
  gl.deleteShader(vsh);
  gl.deleteShader(fsh);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('sim link:', gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

export class Sim {
  private gl: WebGL2RenderingContext | null = null;
  private width = 0;
  private height = 0;
  private stepProg: WebGLProgram | null = null;
  private dropProg: WebGLProgram | null = null;
  private texA: WebGLTexture | null = null;
  private texB: WebGLTexture | null = null;
  private fbA: WebGLFramebuffer | null = null;
  private fbB: WebGLFramebuffer | null = null;
  private uStep: Record<string, WebGLUniformLocation | null> = {};
  private uDrop: Record<string, WebGLUniformLocation | null> = {};
  private pending: { x: number; y: number; radius: number; strength: number }[] = [];
  private linear = false;
  private initialized = false;

  init(gl: WebGL2RenderingContext, w: number, h: number): boolean {
    this.gl = gl;
    this.width = w;
    this.height = h;
    this.linear = !!gl.getExtension('OES_texture_float_linear');

    this.stepProg = createProgram(gl, vertexSrc, simSrc);
    this.dropProg = createProgram(gl, vertexSrc, dropSrc);
    if (!this.stepProg || !this.dropProg) return false;

    const pos = new Float32Array([-1, -1, 3, -1, -1, 3]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.texA = createTexture(gl, w, h, this.linear);
    this.texB = createTexture(gl, w, h, this.linear);
    this.fbA = createFramebuffer(gl, this.texA);
    this.fbB = createFramebuffer(gl, this.texB);

    for (const name of ['uState', 'uTexel', 'uDamping', 'uWaveSpeed']) {
      this.uStep[name] = gl.getUniformLocation(this.stepProg, name);
    }
    for (const name of ['uState', 'uTexel', 'uDrops', 'uDropCount', 'uA']) {
      this.uDrop[name] = gl.getUniformLocation(this.dropProg, name);
    }

    this.clear();
    this.initialized = true;
    return true;
  }

  private clear(): void {
    const gl = this.gl!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbA!);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.stepProg!);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbB!);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  addDrop(x: number, y: number, radius: number, strength: number): void {
    this.pending.push({ x, y, radius, strength });
  }

  step(): void {
    if (!this.initialized || !this.gl) return;
    const gl = this.gl;
    gl.viewport(0, 0, this.width, this.height);

    gl.useProgram(this.dropProg!);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbB!);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texA!);
    gl.uniform1i(this.uDrop.uState!, 0);
    gl.uniform2f(this.uDrop.uTexel!, 1 / this.width, 1 / this.height);
    gl.uniform1f(this.uDrop.uA!, this.width / this.height);
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

    gl.useProgram(this.stepProg!);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbA!);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texB!);
    gl.uniform1i(this.uStep.uState!, 0);
    gl.uniform2f(this.uStep.uTexel!, 1 / this.width, 1 / this.height);
    gl.uniform1f(this.uStep.uDamping!, 0.996);
    gl.uniform1f(this.uStep.uWaveSpeed!, 2.0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  stepTwice(): void {
    this.step();
    this.step();
  }

  getStateTexture(): WebGLTexture | null {
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
    if (!gl) return;
    if (this.stepProg) gl.deleteProgram(this.stepProg);
    if (this.dropProg) gl.deleteProgram(this.dropProg);
    if (this.texA) gl.deleteTexture(this.texA);
    if (this.texB) gl.deleteTexture(this.texB);
    if (this.fbA) gl.deleteFramebuffer(this.fbA);
    if (this.fbB) gl.deleteFramebuffer(this.fbB);
    this.initialized = false;
  }
}

function createTexture(gl: WebGL2RenderingContext, w: number, h: number, linear: boolean): WebGLTexture {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  const f = linear ? gl.LINEAR : gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function createFramebuffer(gl: WebGL2RenderingContext, tex: WebGLTexture): WebGLFramebuffer {
  const f = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return f;
}