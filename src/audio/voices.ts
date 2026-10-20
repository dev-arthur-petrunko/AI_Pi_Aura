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
  const decay = opts.decay ?? 2.5 + Math.random() * 1.5;
  const peak = Math.max(0.0001, opts.gain ?? 0.18);
  const detune = opts.detuneCents ?? CENTS;

  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, when);
  out.gain.linearRampToValueAtTime(peak, when + attack);
  out.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
  out.connect(destination);

  const parts: { o: OscillatorNode; g: GainNode }[] = [];
  const make = (type: OscillatorType, cents: number, mul = 1) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq * mul, when);
    o.detune.setValueAtTime(cents, when);
    const g = ctx.createGain();
    g.gain.value = type === 'sine' ? 1 : 0.55;
    o.connect(g);
    g.connect(out);
    o.start(when);
    o.stop(when + attack + decay + 0.1);
    parts.push({ o, g });
    return o;
  };

  make('sine', -detune);
  make('triangle', detune);
  // октава вверх — для повторов цифр («55») и особых случаев
  if (opts.octave) make('sine', detune, 2);

  let stopped = false;
  /** Когда все осцилляторы кончились — отключаем и выходной gain (нет утечек). */
  let remaining = parts.length;
  const release = (): void => {
    try {
      out.disconnect();
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
