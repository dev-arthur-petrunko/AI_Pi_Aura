/**
 * «Сохранить момент»: текущий кадр WebGL → PNG с подписью «π · цифра N».
 * Мобильные — navigator.share({ files }), иначе скачивание. Без водяных знаков.
 */

import { formatNum, t } from '../i18n/index.ts';

export async function saveMoment(
  rendererCanvas: HTMLCanvasElement,
  renderNow: () => void,
  digitNumber: number,
): Promise<void> {
  // рендерим прямо сейчас, чтобы не поймать пустой drawing buffer
  renderNow();

  const src = rendererCanvas;
  const w = src.width;
  const h = src.height;
  const captionH = Math.round(h * 0.12);

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h + captionH;
  const c = out.getContext('2d');
  if (!c) return;

  c.fillStyle = '#05060D';
  c.fillRect(0, 0, out.width, out.height);
  c.drawImage(src, 0, 0);

  const fontSize = Math.max(18, Math.round(h * 0.035));
  c.font = `200 ${fontSize}px -apple-system, "SF Pro Display", Inter, system-ui, sans-serif`;
  c.textAlign = 'center';
  c.fillStyle = 'rgba(255,255,255,0.85)';
  c.fillText(
    t('save.caption', { n: formatNum(digitNumber + 1) }),
    w / 2,
    h + captionH * 0.55,
  );
  c.fillStyle = 'rgba(255,255,255,0.45)';
  c.font = `200 ${Math.round(fontSize * 0.8)}px -apple-system, "SF Pro Display", Inter, system-ui, sans-serif`;
  c.fillText('π', w / 2, h + captionH * 0.85);

  const blob = await new Promise<Blob | null>((resolve) =>
    out.toBlob((b) => resolve(b), 'image/png'),
  );
  if (!blob) return;

  const filename = `pi-aura-${digitNumber + 1}.png`;
  const file = new File([blob], filename, { type: 'image/png' });

  const nav = navigator as Navigator & {
    canShare?: (d: { files: File[] }) => boolean;
    share?: (d: { files: File[]; title?: string }) => Promise<void>;
  };
  if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'π · Aura' });
      return;
    } catch {
      /* пользователь отменил — молча скачиваем */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
