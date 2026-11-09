/**
 * Comando de iluminação: letra (a, b, c) de cada ponto de luz e das chaves, e as linhas interruptor -> luz.
 * Luzes que respondem ao mesmo conjunto de interruptores formam um comando (paralelo = mesmo conjunto).
 */
import type { ElecPoint } from '@chalecad/engine';

export interface ControlInfo {
  /** Letra do comando de cada luz comandada. */
  lightLetter: Map<string, string>;
  /** Letras que cada interruptor comanda (ordenadas). */
  switchLetters: Map<string, string[]>;
  /** Pares (interruptor, luz) a desenhar. */
  links: { switchId: string; lightId: string; letter: string }[];
  /** Luzes sem nenhum interruptor. */
  uncontrolled: string[];
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
export const letterOf = (i: number): string => (i < LETTERS.length ? LETTERS[i]! : `${LETTERS[i % 26]}${Math.floor(i / 26)}`);

export function controlInfo(points: ElecPoint[]): ControlInfo {
  const byId = new Map(points.map((p) => [p.id, p]));
  const switches = points.filter((p) => p.kind === 'switch');
  const controllers = new Map<string, string[]>();
  for (const s of switches)
    for (const id of s.controls ?? []) {
      const l = byId.get(id);
      if (l && l.kind === 'light') controllers.set(id, [...(controllers.get(id) ?? []), s.id]);
    }
  // ordem estável: pelo primeiro interruptor na ordem dos pontos
  const order = new Map(points.map((p, i) => [p.id, i]));
  const sigs: string[] = [];
  const lightLetter = new Map<string, string>();
  const lightsSorted = [...controllers.keys()].sort((a, b) => Math.min(...controllers.get(a)!.map((s) => order.get(s)!)) - Math.min(...controllers.get(b)!.map((s) => order.get(s)!)) || order.get(a)! - order.get(b)!);
  for (const lid of lightsSorted) {
    const sig = controllers.get(lid)!.slice().sort().join('|');
    let idx = sigs.indexOf(sig);
    if (idx < 0) {
      sigs.push(sig);
      idx = sigs.length - 1;
    }
    lightLetter.set(lid, letterOf(idx));
  }
  const switchLetters = new Map<string, string[]>();
  const links: ControlInfo['links'] = [];
  for (const s of switches) {
    const ls = new Set<string>();
    for (const id of s.controls ?? []) {
      const letter = lightLetter.get(id);
      if (!letter) continue;
      ls.add(letter);
      links.push({ switchId: s.id, lightId: id, letter });
    }
    switchLetters.set(s.id, [...ls].sort());
  }
  const uncontrolled = points.filter((p) => p.kind === 'light' && !controllers.has(p.id)).map((p) => p.id);
  return { lightLetter, switchLetters, links, uncontrolled };
}
