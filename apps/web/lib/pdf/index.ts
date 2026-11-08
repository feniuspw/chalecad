/**
 * Exportação em PDF (cliente). `exportPdf(project, results)` gera o arquivo e dispara o download.
 * A biblioteca de PDF só é carregada quando o usuário exporta.
 */
import type { Project, Results } from '@chalecad/engine';
import { ELEVATION_LABELS, deriveLevels, elevationSvg, planSvg, type ElevationSide } from '../plan2d';
import type { PdfImage } from '../../components/pdf/ChaleDocument';
import { buildPdfData, type PdfData } from './data';
import { svgToPng } from './images';

export { buildInstallationsPdf, buildPdfData, buildRoomRows, type InstallationsPdf, type PdfData, type RoomRow } from './data';

export const PDF_ELEVATIONS: ElevationSide[] = ['front', 'right'];

type Rasterizer = (svg: string, width: number, height: number) => Promise<string>;

/** Plantas e fachadas como imagens para o documento. `raster` é injetável (testes em Node). */
export async function buildPdfImages(project: Project, results: Results, raster: Rasterizer = svgToPng): Promise<{ plans: PdfImage[]; elevations: PdfImage[] }> {
  const { model } = results;
  const levels = deriveLevels(model, project).filter((l) => model.walls.some((w) => w.level === l.id) || model.slabs.some((s) => s.level === l.id && s.kind !== 'radier'));
  const plans: PdfImage[] = [];
  for (const level of levels) {
    const doc = planSvg(model, { project, levelId: level.id, ...(results.installations ? { installations: results.installations.points } : {}) });
    plans.push({ title: `Planta — ${level.name}`, caption: `Planta baixa do nível ${level.name} (cota ${level.elevation.toFixed(2).replace('.', ',')} m)`, src: await raster(doc.svg, doc.width, doc.height), aspect: doc.width / doc.height });
  }
  const elevations: PdfImage[] = [];
  for (const side of PDF_ELEVATIONS) {
    const doc = elevationSvg(model, side);
    elevations.push({ title: ELEVATION_LABELS[side], src: await raster(doc.svg, doc.width, doc.height), aspect: doc.width / doc.height });
  }
  return { plans, elevations };
}

/** Gera o PDF como Blob. */
export async function renderPdfBlob(project: Project, results: Results, opts: { raster?: Rasterizer; data?: PdfData } = {}): Promise<{ blob: Blob; fileName: string }> {
  const data = opts.data ?? buildPdfData(project, results);
  const [{ pdf }, { pdfElement }, images] = await Promise.all([
    import('@react-pdf/renderer'),
    import('../../components/pdf/ChaleDocument'),
    buildPdfImages(project, results, opts.raster),
  ]);
  const blob = await pdf(pdfElement({ data, ...images })).toBlob();
  return { blob, fileName: data.fileName };
}

/** Gera o PDF do projeto e baixa o arquivo. Devolve o nome do arquivo. */
export async function exportPdf(project: Project, results: Results): Promise<string> {
  const { blob, fileName } = await renderPdfBlob(project, results);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return fileName;
}
