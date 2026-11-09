import type { DocSpec } from '@/lib/approval/docs';

/** Renderiza um documento da aprovação em PDF (a biblioteca só é carregada aqui). */
export async function renderDocBlob(spec: DocSpec): Promise<Blob> {
  const [{ pdf }, { approvalElement }] = await Promise.all([import('@react-pdf/renderer'), import('./ApprovalDocument')]);
  return pdf(approvalElement(spec)).toBlob();
}

export async function renderDocBytes(spec: DocSpec): Promise<Uint8Array> {
  return new Uint8Array(await (await renderDocBlob(spec)).arrayBuffer());
}
