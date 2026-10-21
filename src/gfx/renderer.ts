/**
 * WebGL2-рендерер: вода (симуляция высоты) + дно с цифрами π.
 * - шейдеры: sim.frag.glsl, drop.frag.glsl, render.frag.glsl (через ?raw);
 * - два шага симуляции за кадр, один рендер-проход;
 * - автоподстройка renderScale по времени кадра (0.5–1.0);
 * - если WebGL2 нет или нет float-текстур — mode = 'unavailable'.
 */

import { renderSrc } from './shaders/render.ts';
import { fullscreenVert } from './shaders/fullscreen.ts';
import { Sim } from './sim.ts';
import { Floor } from './floor.ts';

const vertexSrc = fullscreenVert;

export interface FrameParams {
  time: number;
  sc: number;
  light: [number, number, number];
  sky: [number, number, number];
  waterDeep: [number, number, number];
  perturb: number;
  day: number;
  flash: number;
  flashColor: [number, number, number];
  flashCenter: [number, number];
}

export interface RendererStats {
  fps: number;
  scale: number;
  mode: 'webgl2' | 'unavailable';
}

type ResizeFn = (w: number, h: number) => void;

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private uLoc: Record<string, WebGLUniformLocation | null> = {};
  private scale = 1;
  private frameEma = 16;
  private frameCount = 0;
  private lastRenderAt = 0;
  private sim = new Sim();
  private floor: Floor;
  private floorTexture: WebGLTexture | null = null;
  private onResize: ResizeFn;
  private stats: RendererStats = { fps: 60, scale: 1, mode: 'webgl2' };

  constructor(canvas: HTMLCanvasElement, onResize: ResizeFn) {
    this.canvas = canvas;
    this.onResize = onResize;
    const reduced =
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.scale = reduced ? 0.6 : 1;
    this.floor = new Floor({ cols: 16, rows: 12, tilePx: 80, fontPx: 48 });
    this.initGL();
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
      this.stats.mode = 'unavailable';
      return;
    }
    this.gl = gl;

    const hasFloat =
      !!gl.getExtension('EXT_color_buffer_float') ||
      !!gl.getExtension('EXT_color_buffer_half_float');
    if (!hasFloat) {
      this.stats.mode = 'unavailable';
      return;
    }

    // floor texture: 16x12 tiles, 80px each = 1280x960
    this.floorTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.floorTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.floor.textureWidth, this.floor.textureHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.floor.canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

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
    const fs = compile(gl.FRAGMENT_SHADER, renderSrc);
    if (!vs || !fs) {
      this.stats.mode = 'unavailable';
      return;
    }
    this.program = gl.createProgram();
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error('render link:', gl.getProgramInfoLog(this.program));
      this.stats.mode = 'unavailable';
      return;
    }

    // uniform locations
    for (const name of ['S', 'F', 'res', 'ct', 't', 'sc', 'day', 'fl', 'fc']) {
      this.uLoc[name] = gl.getUniformLocation(this.program!, name);
    }

    const w = Math.round(Math.min(480, Math.max(180, 180 * (this.canvas.width / this.canvas.height))));
    const h = 180;
    this.sim.init(gl, w, h);
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const k = Math.min(1, Math.sqrt(2.6e6 / (this.canvas.clientWidth * this.canvas.clientHeight * dpr * dpr)));
    const w = Math.round(this.canvas.clientWidth * dpr * k * this.scale);
    const h = Math.round(this.canvas.clientHeight * dpr * k * this.scale);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.gl?.viewport(0, 0, w, h);
      this.onResize(w, h);
    }
    if (this.gl && this.program) {
      const simW = Math.round(Math.min(480, Math.max(180, 180 * (w / h))));
      const simH = 180;
      this.sim.init(this.gl, simW, simH);
    }
  }

  private updateFloorTexture(): void {
    const gl = this.gl;
    if (!gl || !this.floorTexture) return;
    gl.bindTexture(gl.TEXTURE_2D, this.floorTexture);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA,
      gl.RGBA, gl.UNSIGNED_BYTE,
      this.floor.canvas,
    );
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  render(params: FrameParams): void {
    const gl = this.gl;
    const prog = this.program;
    if (!gl || !prog) {
      this.adapt(16);
      return;
    }

    const now = performance.now();
    const gap = this.lastRenderAt === 0 ? 16 : Math.min(250, now - this.lastRenderAt);
    this.lastRenderAt = now;

    // два шага симуляции за кадр (как в образце)
    this.sim.stepTwice();

    // обновляем текстуру пола каждый кадр (цифры пишутся на лету)
    this.updateFloorTexture();

    gl.useProgram(prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    // очищаем цветовое буфферирование перед рендера
    gl.clearColor(params.sky[0], params.sky[1], params.sky[2], 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sim.getStateTexture()!);
    gl.uniform1i(this.uLoc.S!, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.floorTexture);
    gl.uniform1i(this.uLoc.F!, 1);

    gl.uniform2f(this.uLoc.res!, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uLoc.t!, params.time);
    gl.uniform1f(this.uLoc.sc!, params.sc);
    gl.uniform1f(this.uLoc.day!, params.day);
    gl.uniform1f(this.uLoc.fl!, params.flash);
    gl.uniform3fv(this.uLoc.fc!, params.flashColor);
    gl.uniform2f(this.uLoc.ct!, params.flashCenter[0], params.flashCenter[1]);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, null);

    this.adapt(gap);
  }

  /** Подсветить плитку текущей цифры на дне. */
  setActiveDigit(index: number): void {
    this.floor.setActive(index);
  }

  addDrop(x: number, y: number, radius: number, strength: number): void {
    this.sim.addDrop(x, y, radius, strength);
  }

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

  dispose(): void {
    if (this.gl && this.program) {
      this.gl.deleteProgram(this.program);
    }
    this.sim.dispose();
    if (this.floorTexture) this.gl?.deleteTexture(this.floorTexture);
    this.gl = null;
  }

}