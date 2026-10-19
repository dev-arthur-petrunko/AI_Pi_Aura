import { DRONE_FREQ } from './scales.ts';

/**
 * Фоновый дрон: C2 (65.41 Гц), два осциллятора с медленным LFO
 * (период ~12 с), очень тихо.
 */

const LFO_PERIOD = 12; // секунд

export class Drone {
  private nodes: (AudioScheduledSourceNode | GainNode)[] = [];
  private running = false;

  start(ctx: AudioContext, destination: AudioNode): void {
    if (this.running) return;
    this.running = true;

    const master = ctx.createGain();
    master.gain.value = 0.0;
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 4);
    master.connect(destination);

    for (const [type, detune] of [
      ['sine', 0],
      ['triangle', 4],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = DRONE_FREQ;
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = type === 'sine' ? 1 : 0.35;
      osc.connect(g);
      g.connect(master);
      osc.start();
      this.nodes.push(osc, g);
    }

    // LFO по громкости: ±40% с периодом ~12 с
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 1 / LFO_PERIOD;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(master.gain);
    lfo.start();
    this.nodes.push(lfo, lfoGain, master);
  }

  stop(fade = 1.5): void {
    if (!this.running) return;
    this.running = false;
    const nodes = this.nodes;
    this.nodes = [];
    // master — последний добавленный GainNode
    const master = nodes[nodes.length - 1] as GainNode;
    try {
      const ctx = master.context as AudioContext;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now);
      master.gain.exponentialRampToValueAtTime(0.0001, now + fade);
      for (const n of nodes) {
        const src = n as OscillatorNode;
        if (typeof src.stop === 'function' && typeof src.start === 'function') {
          try {
            src.stop(now + fade + 0.05);
          } catch {
            /* уже остановлен */
          }
        }
      }
      setTimeout(() => {
        for (const n of nodes) {
          try {
            n.disconnect();
          } catch {
            /* уже отключён */
          }
        }
      }, (fade + 0.2) * 1000);
    } catch {
      /* контекст закрыт */
    }
  }
}
