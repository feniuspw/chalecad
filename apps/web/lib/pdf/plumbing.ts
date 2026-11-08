/** PDF da hidráulica: planta com tubos e selos de pressão por nível, tabela de pressão, caixa e fossa. */
import { getCatalog } from '@chalecad/catalog';
import { DISCLAIMER, type Project, type Results } from '@chalecad/engine';
import { deriveLevels, planSvg } from '../plan2d';
import { fmtM, SYSTEM_LABEL } from '../plumb/geometry';
import { plumbingOverlay } from '../plumb/planSvg';
import { pressureRows, waterPipeRows } from '../plumb/report';
import { dateBR } from './format';
import { svgToPng } from './images';

export interface PlumbingPdf {
  fileName: string;
  title: string;
  dateText: string;
  pressure: { fixture: string; level: string; system: string; mca: string; kpa: string; min: string; status: string; ok: boolean; adjust: string }[];
  pipes: { id: string; system: string; dn: string; flow: string; velocity: string; loss: string }[];
  tank: { label: string; value: string }[];
  summary: string;
  disclaimer: string;
}

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'chale';

/** Conteúdo textual do PDF da hidráulica (puro); `null` sem hidráulica calculada. */
export function buildPlumbingPdf(project: Project, results: Results, now = new Date()): PlumbingPdf | null {
  const report = results.installations?.plumbing;
  if (!report) return null;
  const k = getCatalog().constants.plumbing;
  const rows = pressureRows(report, project, k);
  const fails = rows.filter((r) => !r.ok).length;
  return {
    fileName: `${slug(project.meta.name)}-hidraulica.pdf`,
    title: `Hidráulica — ${project.meta.name}`,
    dateText: dateBR(now),
    pressure: rows.map((r) => ({
      fixture: r.label,
      level: r.levelName,
      system: SYSTEM_LABEL[r.system],
      mca: fmtM(Math.max(0, r.mca)),
      kpa: fmtM(Math.max(0, r.kpa), 1),
      min: `${fmtM(r.minMca)} m.c.a.`,
      status: r.ok ? 'Atende' : 'Não atende',
      ok: r.ok,
      adjust: r.ok ? '—' : `subir a caixa ${fmtM(r.rise)} m`,
    })),
    pipes: waterPipeRows(report).map((p) => ({ id: p.pipeId.replace(/^auto-/, ''), system: p.systemLabel, dn: String(p.dn), flow: `${fmtM(p.flowLps)} L/s`, velocity: `${fmtM(p.velocity)} m/s`, loss: `${fmtM(p.headLoss)} m.c.a.` })),
    tank: [
      { label: "Caixa d'água", value: `${report.tank.liters} L (fundo a ${fmtM(report.layout.tank.bottomZ)} m)` },
      { label: 'Reserva', value: `${report.tank.dailyLiters} L/dia para ${report.tank.occupants} moradores` },
      { label: 'Peso da caixa cheia', value: `${Math.round(report.tank.fullKg)} kg` },
      { label: 'Esgoto', value: report.septic ? `Fossa séptica de ${report.septic.tankLiters} L` : 'Rede pública' },
    ],
    summary: fails === 0 ? 'Todos os pontos de água atendem a pressão mínima da NBR 5626.' : `${fails} ponto(s) sem a pressão mínima da NBR 5626: veja o ajuste necessário na tabela.`,
    disclaimer: DISCLAIMER,
  };
}

type Rasterizer = (svg: string, width: number, height: number) => Promise<string>;

/** Plantas (um nível por imagem) com a camada hidráulica. */
export async function buildPlumbingImages(project: Project, results: Results, raster: Rasterizer = svgToPng): Promise<{ title: string; src: string; aspect: number }[]> {
  const report = results.installations?.plumbing;
  if (!report) return [];
  const k = getCatalog().constants.plumbing;
  const { model } = results;
  const levels = deriveLevels(model, project).filter((l) => model.walls.some((w) => w.level === l.id) || model.slabs.some((s) => s.level === l.id && s.kind !== 'radier'));
  const out: { title: string; src: string; aspect: number }[] = [];
  for (const level of levels) {
    const doc = planSvg(model, { project, levelId: level.id, overlay: ({ P, S, levelId }) => plumbingOverlay(report, project, k, levelId, P, S) });
    out.push({ title: `Hidráulica — ${level.name}`, src: await raster(doc.svg, doc.width, doc.height), aspect: doc.width / doc.height });
  }
  return out;
}

/** Gera o PDF da hidráulica e baixa o arquivo. Devolve o nome do arquivo. */
export async function exportPlumbingPdf(project: Project, results: Results): Promise<string> {
  const data = buildPlumbingPdf(project, results);
  if (!data) throw new Error('Sem hidráulica calculada para exportar.');
  const [{ pdf }, { plumbingPdfElement }, images] = await Promise.all([import('@react-pdf/renderer'), import('./PlumbingDocument'), buildPlumbingImages(project, results)]);
  const blob = await pdf(plumbingPdfElement({ data, images })).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = data.fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return data.fileName;
}
