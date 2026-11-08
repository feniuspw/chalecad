import { useProgress } from '@react-three/drei';
import { captureBlob, downloadBlob } from '@/lib/three/capture';
import { getDirector } from '@/lib/three/director';
import {
  ORBIT_SECONDS,
  PHOTO_VIEWPOINTS,
  TIMELAPSE_SECONDS,
  TRANSITION_SECONDS,
  lerpPose,
  orbitPose,
  photoFileName,
  photosZipName,
  timelapseMinutes,
  videoFileName,
  type Pose,
  type Viewpoint,
} from '@/lib/three/viewpoints';
import { buildZip } from '@/lib/three/zip';
import { useEditor } from '@/lib/store/editor';
import { usePresentationUi } from './presentationUi';

let controller: AbortController | null = null;
export const isBusy = () => controller !== null;
export const cancelTask = () => controller?.abort();

export const recordingSupported = () => typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype;

const frames = (n: number) => new Promise<void>((res) => {
  const step = (k: number) => (k <= 0 ? res() : requestAnimationFrame(() => step(k - 1)));
  step(n);
});

/** Espera a cena estabilizar: 2 quadros e as texturas carregadas (no máximo 5 s). */
export async function waitStable() {
  await frames(2);
  const t0 = performance.now();
  while (useProgress.getState().active && performance.now() - t0 < 5000) await frames(1);
  await frames(2);
}

/** Transição suave de 0,8 s até a pose. */
export function flyTo(target: Pose, signal?: AbortSignal): Promise<boolean> {
  const d = getDirector();
  const from = d?.current();
  if (!d) return Promise.resolve(false);
  if (!from) {
    d.set(target);
    return Promise.resolve(true);
  }
  return d.play({ duration: TRANSITION_SECONDS, pose: (t) => lerpPose(from, target, t / TRANSITION_SECONDS), signal });
}

async function runTask<T>(kind: 'photos' | 'video', label: string, body: (signal: AbortSignal, progress: (p: number, label?: string) => void) => Promise<T>): Promise<T | null> {
  if (controller) return null;
  const c = new AbortController();
  controller = c;
  const ui = usePresentationUi.getState();
  const prevQuality = ui.quality;
  const prevPlaying = ui.playing;
  const prevMinutes = useEditor.getState().sun.minutes;
  const director = getDirector();
  const prevPose = director?.current() ?? null;
  ui.setPlaying(false);
  ui.setQuality('high');
  ui.setTask({ kind, label, progress: 0 });
  director?.lock(true);
  try {
    return await body(c.signal, (progress, l) => usePresentationUi.getState().setTask({ kind, label: l ?? label, progress }));
  } finally {
    controller = null;
    director?.lock(false);
    if (kind === 'video') {
      useEditor.getState().setSun({ minutes: prevMinutes });
      if (prevPose) director?.set(prevPose);
    }
    usePresentationUi.getState().setQuality(prevQuality);
    usePresentationUi.getState().setPlaying(prevPlaying);
    usePresentationUi.getState().setTask(null);
  }
}

/** Percorre as vistas, captura cada uma (2x) e baixa um .zip. Retorna quantas fotos saíram (0 se cancelado). */
export function savePhotos(viewpoints: Viewpoint[], projectName: string): Promise<number | null> {
  const list = PHOTO_VIEWPOINTS.map((id) => viewpoints.find((v) => v.id === id)).filter((v): v is Viewpoint => !!v);
  return runTask('photos', 'Fotos', async (signal, progress) => {
    const now = new Date();
    const files: { name: string; data: Uint8Array }[] = [];
    const prevPose = getDirector()?.current() ?? null;
    for (const [i, v] of list.entries()) {
      progress(i / list.length, `Foto ${i + 1} de ${list.length}: ${v.label}`);
      if (!(await flyTo(v, signal))) return null;
      await waitStable();
      if (signal.aborted) return null;
      const blob = await captureBlob();
      if (!blob) throw new Error('A cena de apresentação não está pronta.');
      files.push({ name: photoFileName(projectName, v.label, now), data: new Uint8Array(await blob.arrayBuffer()) });
    }
    if (prevPose) getDirector()?.set(prevPose);
    progress(1, 'Gerando o arquivo…');
    downloadBlob(new Blob([buildZip(files, now)], { type: 'application/zip' }), photosZipName(projectName, now));
    return files.length;
  });
}

export type VideoKind = 'orbit' | 'timelapse';

function pickMime(): string | undefined {
  return ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
}

/** Grava o canvas (30 fps): volta de 360° na altura da Quina, ou o sol do nascer ao pôr com a câmera fixa na Quina. */
export function recordVideo(kind: VideoKind, corner: Viewpoint, sun: { sunrise: number; sunset: number }, projectName: string): Promise<boolean | null> {
  return runTask('video', kind === 'orbit' ? 'Vídeo 360°' : 'Do nascer ao pôr do sol', async (signal, progress) => {
    const d = getDirector();
    if (!d) throw new Error('A cena de apresentação não está pronta.');
    if (!(await flyTo(corner, signal))) return false;
    await waitStable();
    const duration = kind === 'orbit' ? ORBIT_SECONDS : TIMELAPSE_SECONDS;
    if (kind === 'timelapse') useEditor.getState().setSun({ minutes: sun.sunrise });
    await frames(2);
    const mimeType = pickMime();
    const rec = new MediaRecorder(d.canvas().captureStream(30), { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 8_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    const stopped = new Promise<void>((res) => (rec.onstop = () => res()));
    rec.start(250);
    const ok = await d.play({
      duration,
      signal,
      pose: (t) => (kind === 'orbit' ? orbitPose(corner, t, duration) : corner),
      onFrame: (t) => {
        progress(t / duration);
        if (kind === 'timelapse') useEditor.getState().setSun({ minutes: timelapseMinutes(sun.sunrise, sun.sunset, t, duration) });
      },
    });
    await frames(2);
    rec.stop();
    await stopped;
    if (!ok) return false;
    downloadBlob(new Blob(chunks, { type: 'video/webm' }), videoFileName(projectName, kind));
    return true;
  });
}
