/**
 * Salvar imagem: nome do arquivo, resolução alvo e registro da função de captura (a cena registra
 * o que sabe renderizar; o painel só chama). Sem three; DOM só nas funções de download.
 */

/** `nome-do-projeto-AAAA-MM-DD-HHhMM.png` (nome sem acentos, minúsculo, hifenizado). */
export function imageFileName(projectName: string, now: Date): string {
  const slug =
    projectName
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'chale';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${slug}-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}h${p(now.getMinutes())}.png`;
}

/** Fator de escala da captura: 2x, limitado a 3840 px de largura e a `maxSide` na maior dimensão (limite da GPU). */
export function captureScale(cssWidth: number, cssHeight: number, dpr: number, maxSide = 8192): number {
  const target = Math.min(2 * dpr, 3840 / Math.max(1, cssWidth), maxSide / Math.max(1, cssWidth, cssHeight));
  return Math.max(1, target);
}

/** Gera o PNG da cena em alta resolução (a cena sabe renderizar). */
export type CaptureFn = () => Promise<Blob>;
let registered: CaptureFn | null = null;

export function registerCapture(fn: CaptureFn | null) {
  registered = fn;
}

/** PNG da cena atual; null se a cena de apresentação não está montada. */
export async function captureBlob(): Promise<Blob | null> {
  return registered ? registered() : null;
}

/** Baixa um blob pelo navegador. */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Dispara a captura e baixa o PNG; false se a cena de apresentação não está montada. */
export async function captureImage(fileName?: string): Promise<boolean> {
  const blob = await captureBlob();
  if (!blob) return false;
  const name = fileName ?? imageFileName((await import('@/lib/store/editor')).useEditor.getState().project.meta.name, new Date());
  downloadBlob(blob, name);
  return true;
}
