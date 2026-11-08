import { toast } from 'sonner';
import { useEditor } from '@/lib/store/editor';
import {
  isPrepared,
  PrepAborted,
  preparePresentation,
  presentationSignature,
  releasePrepared,
  usePrepStatus,
  type PrepInput,
} from '@/lib/three/presentationPrep';
import { effectiveQuality, usePresentationUi } from './presentationUi';

/**
 * Fluxo de entrada na apresentação: o botão não troca o modo direto. Sem preparo pronto para o projeto atual, começa o
 * preparo assíncrono (cartão com progresso e Cancelar) e o modo só troca quando o usuário clica em Abrir. Com o preparo
 * pronto (mesma assinatura), abre na hora. Mudança no projeto durante o preparo reinicia; depois dele, invalida.
 */

let controller: AbortController | null = null;
let usedResults: unknown = null;
let beforeOpen: (() => void) | null = null;
let wired = false;
let recheckTimer: ReturnType<typeof setTimeout> | undefined;

/** Gancho chamado logo antes de trocar o modo (o EditorShell volta a vista da planta para o 3D). */
export function setBeforeOpenPresentation(fn: (() => void) | null): void {
  beforeOpen = fn;
}

function gather(): PrepInput | null {
  const s = useEditor.getState();
  if (!s.results) return null;
  const ui = usePresentationUi.getState();
  return { project: s.project, model: s.results.model, terrain: s.results.terrain ?? null, quality: effectiveQuality(ui.quality, ui.degraded), scenario: ui.scenario, vegetation: ui.vegetation };
}

const signatureOf = (i: PrepInput) => presentationSignature(i.project, i.quality, i.scenario, i.vegetation);

const nextFrame = () =>
  new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });

/** Troca para a apresentação. O overlay "Montando a cena…" aparece antes (dois quadros) e some no primeiro quadro pronto. */
export async function openPresentation(): Promise<void> {
  if (useEditor.getState().viewMode === 'presentation') return;
  usePrepStatus.setState({ mounting: true });
  setTimeout(() => usePrepStatus.setState({ mounting: false }), 10_000); // rede de segurança
  beforeOpen?.();
  await nextFrame();
  await nextFrame();
  const s = useEditor.getState();
  s.setViewMode('presentation');
  if (s.cameraView === 'plan') s.setCameraView('3d');
}

function startPrepare(): void {
  const input = gather();
  if (!input) return;
  controller?.abort();
  const ac = new AbortController();
  controller = ac;
  usedResults = useEditor.getState().results;
  const signature = signatureOf(input);
  usePrepStatus.setState({ phase: 'preparing', progress: 0, label: 'Gerando texturas', signature });
  preparePresentation(ac.signal, (progress, label) => {
    if (!ac.signal.aborted) usePrepStatus.setState({ progress, label });
  }, input)
    .then(() => {
      if (ac.signal.aborted) return;
      controller = null;
      usePrepStatus.setState({ phase: 'ready', progress: 1, label: 'Apresentação pronta', signature });
    })
    .catch((e: unknown) => {
      if (e instanceof PrepAborted || ac.signal.aborted) return;
      controller = null;
      usePrepStatus.setState({ phase: 'idle', progress: 0, label: '', signature: null });
      toast.error('Não foi possível preparar a apresentação.');
      console.error(e);
    });
}

/** Cancela o preparo em andamento (o editor continua como estava). */
export function cancelPresentationPrep(): void {
  controller?.abort();
  controller = null;
  usePrepStatus.setState({ phase: 'idle', progress: 0, label: '', signature: null });
}

function recheck() {
  recheckTimer = undefined;
  const st = usePrepStatus.getState();
  if (st.phase === 'idle') return;
  if (useEditor.getState().viewMode === 'presentation') {
    if (st.phase === 'preparing') cancelPresentationPrep();
    return;
  }
  const input = gather();
  if (!input) return;
  const sig = signatureOf(input);
  if (st.phase === 'preparing') {
    // o projeto (ou o resultado do motor, que chega depois dele) mudou: recomeça sozinho
    if (sig !== st.signature || useEditor.getState().results !== usedResults) startPrepare();
  } else if (sig !== st.signature) {
    releasePrepared();
    usePrepStatus.setState({ phase: 'idle', progress: 0, label: '', signature: null });
  }
}

function wire() {
  if (wired) return;
  wired = true;
  const schedule = () => {
    if (recheckTimer === undefined) recheckTimer = setTimeout(recheck, 300);
  };
  useEditor.subscribe((s, p) => {
    if (s.project !== p.project || s.results !== p.results || s.viewMode !== p.viewMode) schedule();
  });
  usePresentationUi.subscribe((s, p) => {
    if (s.scenario !== p.scenario || s.vegetation !== p.vegetation || s.quality !== p.quality || s.degraded !== p.degraded) schedule();
  });
}

/** Clique em "Apresentação": abre direto se já está preparada, senão começa o preparo. */
export function requestPresentation(): void {
  if (useEditor.getState().viewMode === 'presentation') return;
  wire();
  const input = gather();
  if (!input) {
    void openPresentation();
    return;
  }
  const sig = signatureOf(input);
  const st = usePrepStatus.getState();
  if (st.phase === 'ready' && st.signature === sig && isPrepared(sig)) {
    void openPresentation();
    return;
  }
  if (st.phase === 'preparing' && st.signature === sig) return; // já em andamento: o cartão continua visível
  startPrepare();
}
