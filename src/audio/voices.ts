/**
 * Голос ноты-«капли»: sine + triangle с расстройкой ±6 центов,
 * атака 25 мс, затухание 2.5–4 с, плавный обрыв без щелчков.
 * Каждый голос обязан быть остановлен и отключён (stop + disconnect).
 */

export interface VoiceOptions {
  gain?: number;
  decay?: number;
  attack?: number;
  detuneCents?: number;
  octave?: boolean;
}

export interface VoiceHandle {
  stop(fade?: number): void;
}

const CENTS = 6;

export function playNote(
  ctx: BaseAudioContext,
  destination: AudioNode,
  freq: number,
  when: number,
  opts: VoiceOptions = {},
): VoiceHandle {
  const attack = opts.attack ?? 0.025;
  const decay = opts.decay ?? 2.6 + Math.max(0, (700 - freq) / 1000) * 1.1 + Math.random() * 0.7;
  const peak = Math.max(0.0001, opts.gain ?? 0.18);
  const detune = opts.detuneCents ?? CENTS;

  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, when);
  out.gain.linearRampToValueAtTime(peak, when + attack);
  out.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);

  // мягкий lowpass с огибающей: яркость в атаке, мягкость в затухании
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.6;
  filter.frequency.setValueAtTime(4200, when);
  filter.frequency.exponentialRampToValueAtTime(1100, when + attack + decay);
  out.connect(filter);
  filter.connect(destination);

  const parts: { o: OscillatorNode; g: GainNode }[] = [];
  const make = (type: OscillatorType, cents: number, mul = 1, level = 1) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq * mul, when);
    o.detune.setValueAtTime(cents, when);
    const g = ctx.createGain();
    g.gain.value = (type === 'sine' ? 1 : 0.45) * level;
    o.connect(g);
    g.connect(out);
    o.start(when);
    o.stop(when + attack + decay + 0.1);
    parts.push({ o, g });
    return o;
  };

  const carrier = make('sine', -detune);
  make('triangle', detune, 1, 0.6);
  // мягкий «корпус» на октаву ниже — теплота
  if (freq > 200) make('sine', 0, 0.5, 0.18);
  // FM-модулятор: колокольный обертон, затухает вместе с нотой
  const mod = ctx.createOscillator();
  mod.type = 'sine';
  mod.frequency.setValueAtTime(freq * 2, when);
  const modGain = ctx.createGain();
  modGain.gain.setValueAtTime(Math.max(0.0001, freq * 0.25), when);
  modGain.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay * 0.6);
  mod.connect(modGain);
  modGain.connect(carrier.frequency);
  mod.start(when);
  mod.stop(when + attack + decay + 0.1);
  parts.push({ o: mod, g: modGain });
  // октава вверх — для повторов цифр («55») и особых случаев
  if (opts.octave) make('sine', detune, 2, 0.45);

  let stopped = false;
  /** Когда все осцилляторы кончились — отключаем и выходной gain (нет утечек). */
  let remaining = parts.length;
  const release = (): void => {
    try {
      out.disconnect();
    } catch {
      /* уже отключён */
    }
    try {
      filter.disconnect();
    } catch {
      /* уже отключён */
    }
  };
  const onOscEnded = (o: OscillatorNode, g?: GainNode): void => {
    try {
      o.disconnect();
    } catch {
      /* уже отключён */
    }
    g?.disconnect();
    if (--remaining <= 0) release();
  };

  const stop = (fade = 0.08) => {
    if (stopped) return;
    stopped = true;
    const now = ctx.currentTime;
    try {
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), now);
      out.gain.exponentialRampToValueAtTime(0.0001, now + fade);
      for (const p of parts) {
        p.o.stop(now + fade + 0.02);
        p.o.onended = () => onOscEnded(p.o, p.g);
      }
      setTimeout(() => {
        try {
          out.disconnect();
        } catch {
          /* уже отключён */
        }
        try {
          filter.disconnect();
        } catch {
          /* уже отключён */
        }
      }, (fade + 0.1) * 1000);
    } catch {
      /* контекст закрыт */
    }
  };

  for (const p of parts) {
    p.o.onended = () => onOscEnded(p.o, p.g);
  }

  return { stop };
}
