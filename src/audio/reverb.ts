/**
 * Процедурная реверберация: импульс генерируется кодом —
 * шум × экспоненциальный спад, ~4.5 с, без файлов.
 */
export function createImpulse(ctx: BaseAudioContext, seconds = 4.5): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < impulse.numberOfChannels; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // шум с экспоненциальным затуханием; первые 30 мс — мягкая атака импульса
      const decay = Math.pow(1 - t, 2.4);
      const attack = Math.min(1, i / (rate * 0.04));
      data[i] = (Math.random() * 2 - 1) * decay * attack * 0.5;
    }
  }
  return impulse;
}
