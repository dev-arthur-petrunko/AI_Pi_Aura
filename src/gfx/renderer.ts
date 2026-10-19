/**
 * WebGL2-рендерер: один полноэкранный прямоугольник + fragment shader.
 * - автоподстройка renderScale по времени кадра (0.5–1.0);
 * - восстановление после потери контекста;
 * - если WebGL2 нет — запасной Canvas 2D (простые кольца).
 */

import fragmentSrc from './water.frag.glsl?raw';
import { MAX_DROPS, type Ripples } from './ripples.ts';

const vertexSrc = `#version 300 es
layout(location = 0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export interface FrameParams {
  time: number; // часы синхронизации
  dive: number;
  mirror: number;
  motion: number; // 1 | 0.5
  tilt: [number, number];
  pulse: number;
}

export interface RendererStats {
  fps: number;
  scale: number;
  mode: 'webgl2' | 'canvas2d';
}

type ResizeFn = (w: number, h: number) => void;

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private program: WebGLProgram | null = null;
  private uLoc: Record<string, WebGLUniformLocation | null> = {};
  private dropData = new Float32Array(MAX_DROPS * 4);
  private scale = 1;
  private frameEma = 16;
  private frameCount = 0;
  private lost = false;
  private ripples: Ripples;
  private onResize: ResizeFn;
  private stats: RendererStats = { fps: 60, scale: 1, mode: 'webgl2' };

  constructor(canvas: HTMLCanvasElement, ripples: Ripples, onResize: ResizeFn) {
    this.canvas = canvas;
    this.ripples = ripples;
    this.onResize = onResize;
    const reduced =
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.scale = reduced ? 0.6 : 1;
    this.initGL();
    this.bindContextEvents();
    this.resize();
  }

  get renderScale(): number {
    return this.scale;
  }

  get rendererStats(): RendererStats {
    return this.stats;
  }

  setRenderScale(s: number): void {
    const next = Math.min(1, Math.max(0.5, Math.round(s * 10) / 10));
    if (next !== this.scale) {
      this.scale = next;
      this.resize();
    }
  }

  private initGL(): void {
    const gl = this.canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) {
      this.ctx2d = this.canvas.getContext('2d');
      this.stats.mode = 'canvas2d';
      return;
    }
    this.gl = gl;

    const compile = (type: number, src: string): WebGLShader | null => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error('shader:', gl.getShaderInfoLog(sh));
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };

    const vs = compile(gl.VERTEX_SHADER, vertexSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fragmentSrc);
    if (!vs || !fs) {
      this.ctx2d = this.canvas.getContext('2d');
      this.gl = null;
      this.stats.mode = 'canvas2d';
      return;
    }
    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('link:', gl.getProgramInfoLog(prog));
      gl.deleteProgram(prog);
      this.gl = null;
      this.ctx2d = this.canvas.getContext('2d');
      this.stats.mode = 'canvas2d';
      return;
    }
    this.program = prog;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    for (const name of [
      'uRes',
      'uTime',
      'uDive',
      'uMirror',
      'uMotion',
      'uTilt',
      'uPulse',
      'uDrops',
    ]) {
      // часть драйверов требует имя 'uDrops[0]' для uniform-массива
      this.uLoc[name] =
        gl.getUniformLocation(prog, name) ??
        gl.getUniformLocation(prog, `${name}[0]`);
    }
  }

  private bindContextEvents(): void {
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.gl = null;
      this.program = null;
      this.initGL();
      this.lost = false;
      this.resize();
    });
  }

  /** Физический размер холста = css × devicePixelRatio × renderScale. */
  resize(): void {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr * this.scale));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr * this.scale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.gl?.viewport(0, 0, w, h);
      this.onResize(w, h);
    }
  }

  /** Автоподстройка: > 20 мс → −0.1, < 12 мс → +0.1 (каждые 60 кадров). */
  private adapt(frameMs: number): void {
    this.frameEma = this.frameEma * 0.95 + frameMs * 0.05;
    this.frameCount++;
    if (this.frameCount >= 60) {
      this.frameCount = 0;
      if (this.frameEma > 20) this.setRenderScale(this.scale - 0.1);
      else if (this.frameEma < 12 && this.scale < 1) this.setRenderScale(this.scale + 0.1);
    }
    this.stats.fps = Math.round(1000 / Math.max(this.frameEma, 1));
    this.stats.scale = this.scale;
  }

  render(params: FrameParams): void {
    const t0 = performance.now();
    if (this.lost || (this.gl === null && this.ctx2d === null)) {
      this.adapt(performance.now() - t0);
      return;
    }
    if (this.gl && this.program && !this.gl.isContextLost()) {
      this.renderGL(params);
    } else if (this.ctx2d) {
      this.render2D(params);
    }
    this.adapt(performance.now() - t0);
  }

  private renderGL(params: FrameParams): void {
    const gl = this.gl;
    const prog = this.program;
    if (!gl || !prog) return;
    gl.useProgram(prog);
    gl.uniform2f(this.uLoc.uRes!, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uLoc.uTime!, params.time);
    gl.uniform1f(this.uLoc.uDive!, params.dive);
    gl.uniform1f(this.uLoc.uMirror!, params.mirror);
    gl.uniform1f(this.uLoc.uMotion!, params.motion);
    gl.uniform2f(this.uLoc.uTilt!, params.tilt[0], params.tilt[1]);
    gl.uniform1f(this.uLoc.uPulse!, params.pulse);
    this.ripples.write(this.dropData);
    gl.uniform4fv(this.uLoc.uDrops!, this.dropData);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Запасной путь: простые кольца на Canvas 2D. */
  private render2D(params: FrameParams): void {
    const c = this.ctx2d;
    if (!c) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const grad = c.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0A0F24');
    grad.addColorStop(1, '#05060D');
    c.fillStyle = grad;
    c.fillRect(0, 0, w, h);

    const data = this.dropData;
    this.ripples.write(data);
    for (let i = 0; i < MAX_DROPS; i++) {
      const packed = data[i * 4 + 3];
      if (packed <= 0) continue;
      const age = params.time - data[i * 4 + 2];
      if (age < 0) continue;
      const x = data[i * 4] * w;
      const y = (1 - data[i * 4 + 1]) * h;
      const alpha = Math.exp(-age * 0.5) * 0.5 * (1 - params.mirror * 0.85);
      const radius = Math.min(w, h) * 0.06 + age * Math.min(w, h) * 0.22;
      c.strokeStyle = `rgba(140, 200, 255, ${Math.max(0, alpha)})`;
      c.lineWidth = Math.max(1, h * 0.004);
      c.beginPath();
      c.arc(x, y, radius, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = `rgba(90, 150, 255, ${Math.max(0, alpha * 0.5)})`;
      c.beginPath();
      c.arc(x, y, Math.min(w, h) * 0.03, 0, Math.PI * 2);
      c.fill();
    }
  }

  dispose(): void {
    if (this.gl && this.program) {
      this.gl.deleteProgram(this.program);
    }
    this.gl = null;
    this.ctx2d = null;
  }
}
