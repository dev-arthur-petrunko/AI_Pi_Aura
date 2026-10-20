/**
 * WebGL2-рендерер: один полноэкранный прямоугольник + fragment shader.
 * - автоподстройка renderScale по времени кадра (0.5–1.0);
 * - восстановление после потери контекста;
 * - если WebGL2 нет — запасной Canvas 2D (простые кольца).
 */

import fragmentSrc from './water.frag.glsl?raw';
import { Sim } from './sim.ts';
import { Ripples } from './ripples.ts';
import { Floor } from './floor.ts';

const vertexSrc = `#version 300 es
layout(location = 0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export interface FrameParams {
  time: number;
  light: [number, number, number];
  sky: [number, number, number];
  waterDeep: [number, number, number];
  perturb: number;
}

export interface RendererStats {
  fps: number;
  scale: number;
  mode: 'webgl2' | 'canvas2d' | 'sim-unavailable';
}

type ResizeFn = (w: number, h: number) => void;

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private program: WebGLProgram | null = null;
  private uLoc: Record<string, WebGLUniformLocation | null> = {};
  private scale = 1;
  private frameEma = 16;
  private frameCount = 0;
  private lastRenderAt = 0;
  private lost = false;
  private sim = new Sim();
  private floor = new Floor({ cols: 16, rows: 200, tilePx: 64, fontPx: 30 });
  private floorTexture: WebGLTexture | null = null;
  private bloomCanvas: HTMLCanvasElement | null = null;
  private bloomCtx: CanvasRenderingContext2D | null = null;
  private onResize: ResizeFn;
  private stats: RendererStats = { fps: 60, scale: 1, mode: 'webgl2' };

  constructor(canvas: HTMLCanvasElement, _ripples: Ripples, onResize: ResizeFn) {
    this.canvas = canvas;
    this.onResize = onResize;
    const reduced =
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.scale = reduced ? 0.6 : 1;
    this.floor.loadDigits(0, 16 * 200);
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
    if (!prog) {
      this.gl = null;
      this.ctx2d = this.canvas.getContext('2d');
      this.stats.mode = 'canvas2d';
      return;
    }
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
      'uState',
      'uFloor',
      'uFloorSize',
      'uLight',
      'uSky',
      'uWaterDeep',
      'uPerturb',
    ]) {
      // часть драйверов требует имя 'uDrops[0]' для uniform-массива
      this.uLoc[name] =
        gl.getUniformLocation(prog, name) ??
        gl.getUniformLocation(prog, `${name}[0]`);
    }

    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const simW = Math.max(64, Math.round(this.canvas.clientWidth * dpr * 0.25));
    const simH = Math.max(64, Math.round(this.canvas.clientHeight * dpr * 0.25));
    if (!this.sim.init(gl, simW, simH)) {
      this.stats.mode = 'sim-unavailable';
    }

    this.floorTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.floorTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      this.floor.width,
      this.floor.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.floor.canvas,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // bloom-холст (размытая копия, под основным)
    this.bloomCanvas = document.createElement('canvas');
    this.bloomCanvas.style.position = 'fixed';
    this.bloomCanvas.style.inset = '0';
    this.bloomCanvas.style.width = '100%';
    this.bloomCanvas.style.height = '100%';
    this.bloomCanvas.style.pointerEvents = 'none';
    this.bloomCanvas.style.filter = 'blur(10px)';
    this.bloomCanvas.style.opacity = '0.5';
    this.bloomCanvas.style.zIndex = '0';
    this.canvas.parentNode?.insertBefore(this.bloomCanvas, this.canvas);

    const bloomCtx = this.bloomCanvas.getContext('2d');
    if (bloomCtx) this.bloomCtx = bloomCtx;
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
    const now = performance.now();
    // первый кадр — базовые 16 мс; дальше — реальный интервал между кадрами (вкл. ожидание GPU)
    const gap = this.lastRenderAt === 0 ? 16 : Math.min(250, now - this.lastRenderAt);
    this.lastRenderAt = now;
    if (this.lost || (this.gl === null && this.ctx2d === null)) {
      this.adapt(gap);
      return;
    }
    if (this.gl && this.program && !this.gl.isContextLost()) {
      this.renderGL(params);
    } else if (this.ctx2d) {
      this.render2D(params);
    }
    this.adapt(gap);
  }

  /** Добавить каплю в симуляцию (вызывается из main.ts при каждой цифре). */
  addDrop(x: number, y: number, radius: number, strength: number): void {
    this.sim.addDrop(x, y, radius, strength);
  }

  private renderGL(params: FrameParams): void {
    const gl = this.gl;
    const prog = this.program;
    if (!gl || !prog) return;
    gl.useProgram(prog);
    gl.uniform2f(this.uLoc.uRes!, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uLoc.uTime!, params.time);
    gl.uniform1f(this.uLoc.uPerturb!, params.perturb);
    gl.uniform3fv(this.uLoc.uLight!, params.light);
    gl.uniform3fv(this.uLoc.uSky!, params.sky);
    gl.uniform3fv(this.uLoc.uWaterDeep!, params.waterDeep);
    gl.uniform2f(this.uLoc.uFloorSize!, this.floor.textureWidth, this.floor.textureHeight);

    // шаг симуляции
    this.sim.step();

    // текстуры: sim state + пол
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sim.getStateTexture());
    gl.uniform1i(this.uLoc.uState!, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.floorTexture);
    gl.uniform1i(this.uLoc.uFloor!, 1);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);

    // bloom: копия основного холста в bloom-холст (размытие через CSS)
    if (this.bloomCtx && this.bloomCanvas) {
      this.bloomCanvas.width = this.canvas.width;
      this.bloomCanvas.height = this.canvas.height;
      this.bloomCtx.drawImage(this.canvas, 0, 0);
    }
  }

  /** Запасной путь: простые кольца на Canvas 2D. */
  private render2D(_params: FrameParams): void {
    const c = this.ctx2d;
    if (!c) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    c.fillStyle = '#0A0F24';
    c.fillRect(0, 0, w, h);
  }

  dispose(): void {
    if (this.gl && this.program) {
      this.gl.deleteProgram(this.program);
    }
    this.sim.dispose();
    if (this.floorTexture) this.gl?.deleteTexture(this.floorTexture);
    if (this.bloomCanvas) this.bloomCanvas.remove();
    this.gl = null;
    this.ctx2d = null;
  }
}
