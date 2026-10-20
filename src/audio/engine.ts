import { SILENT } from '../config.ts';
import { Drone } from './drone.ts';
import { createImpulse } from './reverb.ts';
import { freqForDigit, freqForX, type ScaleId } from './scales.ts';
import { playNote, type VoiceHandle } from './voices.ts';

/**
 * Мастер-аудиодвижок.
 * Цепочка: голоса/дрон → (send) реверберация → компрессор → общий gain.
 * AudioContext создаётся только после первого касания (init()).
 * Единые часы синхронизации — ctx.currentTime.
 */

const MAX_VOICES = 12;
const REVERB_SEND = 0.35;
const FEYNMAN_CHORD = [523.25, 659.25, 783.99, 880.0]; // C–E–G–A

interface ActiveVoice {
  handle: VoiceHandle;
  startedAt: number;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private dry: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private voices: ActiveVoice[] = [];
  private drone = new Drone();
  private scale: ScaleId = 'major';
  private volume = 0.8;
  private muted = false;
  private frozen = false;
  private lastDigit = -1;
  private faded = false;

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** Единые часы (секунды). До init — fallback на performance.now(). */
  now(): number {
    return this.ctx ? this.ctx.currentTime : performance.now() / 1000;
  }

  /** Создаётся только после первого жеста пользователя. В режиме тишины — никогда. */
  init(): void {
    if (this.ctx || SILENT) return;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.volume;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 24;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.25;

    const convolver = ctx.createConvolver();
    convolver.buffer = createImpulse(ctx, 4.5);
    const wet = ctx.createGain();
    wet.gain.value = REVERB_SEND;
    const dry = ctx.createGain();
    dry.gain.value = 1;

    dry.connect(compressor);
    convolver.connect(wet);
    wet.connect(compressor);
    compressor.connect(master);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;
    compressor.connect(analyser);
    analyser.connect(master);
    master.connect(ctx.destination);
    this.analyser = analyser;

    this.master = master;
    this.dry = dry;

    this.drone.start(ctx, dry);

    void ctx.resume();
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  setScale(scale: ScaleId): void {
    this.scale = scale;
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.master && this.ctx && !this.muted) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(
        m ? 0 : this.volume,
        this.ctx.currentTime,
        0.05,
      );
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get currentScale(): ScaleId {
    return this.scale;
  }

  /** Уровень звука 0..1 по текущему времени (для пульса и линии воды). */
  getLevel(): number {
    if (!this.analyser || !this.ctx) return 0;
    const buffer = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
    const rms = Math.sqrt(sum / buffer.length);
    return Math.min(1, rms * 3);
  }

  /**
   * Нота для цифры потока. Если цифра повторяет предыдущую («55») —
   * громче + октава вверх (резонанс).
   * `when` — в часах ctx.currentTime (по умолчанию — сейчас).
   */
  playDigit(digit: number, when?: number, gain = 0.16): void {
    if (!this.ctx || !this.dry || this.frozen) return;
    const ctx = this.ctx;
    const t = Math.max(when ?? ctx.currentTime, ctx.currentTime);
    const repeat = digit === this.lastDigit;
    this.lastDigit = digit;

    const freq = freqForDigit(digit, this.scale);
    const handle = playNote(ctx, this.dry, freq, t, {
      gain: repeat ? gain * 1.45 : gain,
      octave: repeat,
    });
    this.track(handle, t);
  }

  /** Касание воды: капля-нота по позиции x (слева → ниже). */
  playX(x: number, when?: number): void {
    if (!this.ctx || !this.dry) return;
    const t = Math.max(when ?? this.ctx.currentTime, this.ctx.currentTime);
    this.track(
      playNote(this.ctx, this.dry, freqForX(x, this.scale), t, { gain: 0.14 }),
      t,
    );
  }

  /** Точка Фейнмана: долгий светлый аккорд C–E–G–A, затухание 8 с. */
  feynmanChord(): void {
    if (!this.ctx || !this.dry) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.05;
    for (const f of FEYNMAN_CHORD) {
      this.track(
        playNote(ctx, this.dry, f, t, { gain: 0.12, decay: 8, attack: 0.15 }),
        t,
      );
    }
  }

  /** Мягкое арпеджио («заморозка»): последние цифры, тихо и медленно. */
  arpeggio(digits: number[]): void {
    if (!this.ctx || !this.dry) return;
    const ctx = this.ctx;
    let t = ctx.currentTime + 0.1;
    for (const d of digits) {
      this.track(
        playNote(ctx, this.dry, freqForDigit(d, this.scale), t, {
          gain: 0.1,
          decay: 3,
        }),
        t,
      );
      t += 0.24;
    }
  }

  /** «Заморозка»: новые ноты не играем. */
  setFrozen(f: boolean): void {
    this.frozen = f;
    if (!f) this.lastDigit = -1;
  }

  private track(handle: VoiceHandle, startedAt: number): void {
    this.voices.push({ handle, startedAt });
    // полифония ≤ 12: самые старые ноты плавно гасим
    while (this.voices.length > MAX_VOICES) {
      const old = this.voices.shift();
      old?.handle.stop(0.35);
    }
    // периодическая уборка завершённых (защита от «забытых» осцилляторов)
    if (this.voices.length % 8 === 0) this.sweep();
  }

  private sweep(): void {
    const now = this.ctx?.currentTime ?? 0;
    this.voices = this.voices.filter((v) => now - v.startedAt < 10);
  }

  private onVisibility = (): void => {
    if (!this.ctx || !this.master) return;
    if (document.hidden) {
      this.fadeTo(true);
    } else {
      this.fadeTo(false);
    }
  };

  private fadeTo(silent: boolean): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const g = this.master.gain;
    const target = silent ? 0.0001 : this.muted ? 0 : this.volume;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(Math.max(g.value, 0.0001), ctx.currentTime);
    g.linearRampToValueAtTime(target, ctx.currentTime + 0.6);
    if (silent) {
      void ctx.suspend().then(() => {
        this.faded = true;
      });
    } else if (this.faded) {
      this.faded = false;
      void ctx.resume();
    }
  }

  dispose(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
    for (const v of this.voices) v.handle.stop(0.05);
    this.voices = [];
    this.drone.stop(0.3);
    void this.ctx?.close();
    this.ctx = null;
  }
}
