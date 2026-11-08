/**
 * "Ajustar às normas": aplica de uma vez o que dá para corrigir sem decisão de projeto e lista o resto.
 * Função pura (projeto in → projeto out). Roda o motor entre as etapas, como o painel de resultados faria.
 */
import { produce } from 'immer';
import { getCatalog, type Catalog } from '@chalecad/catalog';
import { buildModel, computeAll, type Opening, type Project, type Results } from '@chalecad/engine';
import { annexInfo, annexLimits, patchAnnex } from './annex';
import { aFrameMezzRange, fitOpening, getMezzanine, overlappingOpenings, patchTypology, setMezzanine } from './edit';
import { hostLength, round } from './geometry';
import { newId, type IdGen } from './ids';
import { suggestionRecipe } from './suggestions';

export interface NormFixChange {
  label: string;
  detail: string;
}

export interface NormFixPlan {
  project: Project;
  changes: NormFixChange[];
  /** O que continua pendente (precisa de decisão ou de detalhe de engenharia). */
  pending: string[];
  before: { fail: number; warn: number; total: number };
  after: { fail: number; warn: number; total: number };
}

const MAX_ROUNDS = 6;
const fmt = (n: number, d = 2) => n.toFixed(d).replace('.', ',');

function counts(r: Results) {
  return {
    fail: r.structure?.checks.filter((c) => c.status === 'fail').length ?? 0,
    warn: r.warnings.filter((w) => w.severity !== 'info').length,
    total: r.budget.total,
  };
}

/** Janela nova cabe no hospedeiro, não encosta em outra e o motor a aceita? */
function tryOpening(p: Project, o: Opening, catalog: Catalog): Project | null {
  const fit = fitOpening(p, o);
  if (!fit || fit.width < o.width - 1e-6 || fit.height < 0.6) return null;
  const next = produce(p, (d) => {
    const i = d.openings.findIndex((x) => x.id === o.id);
    if (i >= 0) d.openings[i] = fit;
    else d.openings.push(fit);
  });
  if (overlappingOpenings(next, o.id).length > 0) return null;
  const valid = buildModel(next, catalog).openings.find((x) => x.id === o.id)?.valid ?? false;
  if (!valid) return null;
  // não troca um problema por outro: a verga do vão novo precisa passar
  const header = computeAll(next, catalog).structure?.checks.find((c) => c.kind === 'header' && c.hostIds.includes(fit.host) && c.status === 'fail');
  return header ? null : next;
}

/** Hospedeiros onde cabe janela, por volume (o mesmo critério dos alertas de iluminação). */
function zoneHosts(p: Project, zone: string): string[] {
  const t = p.typology;
  if (zone.startsWith('Cômodo à') && t.kind === 'a_frame') {
    const side = zone.endsWith('esquerda') ? 'left' : 'right';
    return ['side', 'front', 'back'].map((s) => `annex-${side}-${s}`);
  }
  const model = buildModel(p, getCatalog());
  return model.walls.filter((w) => w.kind !== 'interior' && w.kind !== 'parapet' && w.assemblyId !== 'gable_glazed' && !w.id.startsWith('annex-')).map((w) => w.id);
}

export function planNormFixes(input: Project, catalog: Catalog = getCatalog(), ids: IdGen = newId): NormFixPlan {
  const nm = catalog.constants.norms;
  const changes: NormFixChange[] = [];
  let p = input;
  let r = computeAll(p, catalog);
  const before = counts(r);

  // 1. Estrutura: aplica as sugestões das verificações reprovadas até passar (ou acabar o que sugerir)
  const applied = new Set<string>();
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const recipes = (r.structure?.checks ?? [])
      .filter((c) => c.status === 'fail')
      .map((c) => ({ c, rec: suggestionRecipe(c) }))
      .filter((x): x is { c: typeof x.c; rec: NonNullable<typeof x.rec> } => x.rec !== null && !applied.has(`${x.c.kind}:${x.rec.label}`));
    if (recipes.length === 0) break;
    const seen = new Set<string>();
    p = produce(p, (d) => {
      for (const { c, rec } of recipes) {
        const key = `${c.kind}:${rec.label}`;
        if (seen.has(key)) continue;
        seen.add(key);
        applied.add(key);
        rec.recipe(d);
      }
    });
    r = computeAll(p, catalog);
  }
  // relata o resultado final (várias verificações podem ter mexido no mesmo perfil)
  const a0 = input.system;
  const a1 = p.system;
  for (const [field, label] of [['wallStud', 'Montantes'], ['gableStud', 'Montantes das empenas'], ['joist', 'Vigas do mezanino'], ['rafter', 'Caibros'], ['purlin', 'Terças']] as const) {
    const was = a0.profiles[field] ?? (field === 'gableStud' ? a0.profiles.wallStud : undefined);
    if (a1.profiles[field] !== undefined && was !== a1.profiles[field]) changes.push({ label, detail: `${was} → ${a1.profiles[field]}` });
  }
  const r0 = a0.rafterSpacing ?? a0.studSpacing;
  const r1 = a1.rafterSpacing ?? a1.studSpacing;
  if (a1.rafterSpacing !== undefined && r0 !== r1) {
    changes.push({ label: 'Espaçamento dos caibros', detail: `${fmt(r0 * 100, 0)} → ${fmt(r1 * 100, 0)} cm (só as águas do A-frame)` });
  }
  if (a0.studSpacing !== a1.studSpacing) {
    changes.push({ label: 'Espaçamento da estrutura', detail: `${fmt(a0.studSpacing * 100, 0)} → ${fmt(a1.studSpacing * 100, 0)} cm (montantes, caibros e vigas)` });
  }

  // 2. Pé-direito sob o mezanino
  const mezz = getMezzanine(p);
  const slab = r.model.slabs.find((s) => s.kind === 'mezzanine');
  if (mezz && slab) {
    const under = slab.topZ - slab.thickness;
    if (under < nm.ceilingLiving - 1e-6) {
      const target = Math.ceil((nm.ceilingLiving + slab.thickness) * 100) / 100;
      const t = p.typology;
      if (t.kind === 'a_frame' && target <= aFrameMezzRange(t)[1] + 1e-6) {
        p = produce(p, (d) => setMezzanine(d, { elevation: target }));
        changes.push({ label: 'Mezanino', detail: `piso de ${fmt(mezz.level.elevation)} m para ${fmt(target)} m (${fmt(nm.ceilingLiving)} m livres embaixo)` });
      } else if (t.kind === 'gable_mezzanine' && target <= 6) {
        p = produce(p, (d) => void patchTypology(d, { wallHeight: target }));
        changes.push({ label: 'Pé-direito', detail: `paredes de ${fmt(t.wallHeight)} m para ${fmt(target)} m (${fmt(nm.ceilingLiving)} m livres sob o mezanino)` });
      }
    }
  }

  // 3. Lado baixo dos cômodos laterais do A-frame
  for (const side of ['left', 'right'] as const) {
    const t = p.typology;
    const a = t.kind === 'a_frame' ? t.annexes.find((x) => x.side === side) : undefined;
    if (t.kind !== 'a_frame' || !a) continue;
    {
      const low = annexInfo(t, a).lowHeight;
      if (low >= nm.ceilingLiving - 1e-6) continue;
      const lado = a.side === 'left' ? 'esquerda' : 'direita';
      const tan = Math.tan((a.pitchDeg * Math.PI) / 180);
      const want = round(nm.ceilingLiving + a.width * tan + 0.01, 2);
      if (want <= annexLimits(t, a).heightMax + 1e-6) {
        p = produce(p, (d) => patchAnnex(d, a.side, { height: want }));
        changes.push({ label: `Cômodo à ${lado}`, detail: `altura junto ao A-frame de ${fmt(a.height)} m para ${fmt(want)} m (lado baixo com ${fmt(nm.ceilingLiving)} m)` });
      }
    }
  }
  r = computeAll(p, catalog);

  // 4. Iluminação: amplia as janelas do volume e, se não bastar, acrescenta janelas
  for (const w of r.warnings.filter((x) => x.code === 'norm.lighting')) {
    const zone = w.message.split(':')[0]!;
    const hosts = zoneHosts(p, zone);
    const short = () => computeAll(p, catalog).warnings.some((x) => x.code === 'norm.lighting' && x.message.startsWith(`${zone}:`));
    let enlarged = 0;
    let added = 0;
    for (const o of p.openings.filter((x) => x.type === 'window' && hosts.includes(x.host))) {
      const len = hostLength(p, o.host) ?? o.width;
      const width = Math.min(1.5, Math.max(o.width, len - 0.6));
      const bigger: Opening = { ...o, width: round(width, 2), offset: round(Math.max(0.3, o.offset - (width - o.width) / 2), 2), height: Math.max(o.height, 1.2), sill: Math.min(o.sill, 0.9) };
      const next = tryOpening(p, bigger, catalog);
      if (next) {
        p = next;
        enlarged++;
      }
    }
    for (const host of hosts) {
      if (!short()) break;
      const len = hostLength(p, host);
      if (len === null) continue;
      for (let off = 0.3; off + 1.0 <= len - 0.3 + 1e-6 && short(); off += 0.3) {
        const next = tryOpening(p, { id: ids('o'), host, type: 'window', offset: round(off, 2), width: 1.0, height: 1.2, sill: 0.9 }, catalog);
        if (next) {
          p = next;
          added++;
          off += 1.0;
        }
      }
    }
    if (enlarged || added) {
      const parts = [enlarged ? `${enlarged} janela(s) ampliada(s)` : '', added ? `${added} janela(s) nova(s) de 1,0 × 1,2 m` : ''].filter(Boolean);
      changes.push({ label: zone, detail: parts.join(' e ') });
    }
  }

  r = computeAll(p, catalog);
  const after = counts(r);
  const pending: string[] = [
    ...(r.structure?.checks.filter((c) => c.status === 'fail').map((c) => `${c.label}: taxa ${fmt(c.ratio)}${c.suggestion ? `. ${c.suggestion.text}` : ''}`) ?? []),
    ...r.warnings.filter((x) => x.severity !== 'info' && x.code !== 'steel.index').map((x) => x.message),
  ];
  return { project: p, changes, pending, before, after };
}
