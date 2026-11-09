/** Medidas de texto aproximadas (Helvetica) para quebrar e truncar linhas no carimbo e nas notas, sem DOM. */

/** Largura média de um caractere Helvetica, em múltiplos do corpo (maiúsculas e negrito pedem mais). */
const AVG = 0.52;

export const textWidth = (s: string, size: number, bold = false) => s.length * size * (bold ? AVG * 1.27 : AVG);

/** Trunca com reticências para caber em `maxW` mm. */
export function fit(s: string, maxW: number, size: number, bold = false): string {
  if (textWidth(s, size, bold) <= maxW) return s;
  const max = Math.max(1, Math.floor(maxW / (size * AVG * (bold ? 1.27 : 1))) - 1);
  return s.slice(0, max).trimEnd() + '…';
}

/** Quebra em linhas de até `maxW` mm. */
export function wrap(s: string, maxW: number, size: number, bold = false): string[] {
  const out: string[] = [];
  for (const para of s.split('\n')) {
    let cur = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && textWidth(next, size, bold) > maxW) {
        out.push(cur);
        cur = word;
      } else cur = next;
    }
    out.push(cur);
  }
  return out;
}
