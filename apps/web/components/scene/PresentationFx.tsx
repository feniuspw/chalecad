'use client';
import { useEffect, useRef } from 'react';
import { PerformanceMonitor } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { captureScale, imageFileName, registerCapture } from '@/lib/three/capture';
import { useEditor } from '@/lib/store/editor';
import { autoExposure } from '@/lib/three/landscape';
import { Exposure } from './ExposureEffect';
import { effectiveQuality, usePresentationUi } from './presentationUi';
import { useSunState } from './useSunState';

/** Pós-processamento do modo apresentação: oclusão ambiente (N8AO, só em Alta), SMAA e tone mapping ACES. */
export function PresentationFx() {
  const quality = effectiveQuality(usePresentationUi((s) => s.quality), usePresentationUi((s) => s.degraded));
  const choice = usePresentationUi((s) => s.quality);
  const setDegraded = usePresentationUi((s) => s.setDegraded);
  const setDpr = useThree((s) => s.setDpr);
  const high = quality === 'high';
  const lamps = usePresentationUi((s) => s.lamps);
  const gl = useThree((s) => s.gl);
  const sun = useSunState();
  const elevation = sun.elevationDeg;
  const exposure = autoExposure(elevation, lamps);
  // brilho: luzes internas acesas ao anoitecer e sol baixo (só passa do limiar o que passa de 1 em HDR)
  const dusk = Math.max(0, Math.min(1, (14 - elevation) / 14));
  const bloomOn = (lamps && elevation < 10) || elevation < 9;
  const bloomIntensity = (lamps ? 0.9 * dusk : 0) + 0.55 * Math.max(0, 1 - Math.abs(elevation - 2) / 9);

  // o vidro com transmissão renderiza a cena opaca num alvo: metade da resolução basta
  useEffect(() => {
    const prev = gl.transmissionResolutionScale;
    gl.transmissionResolutionScale = 0.5;
    return () => {
      gl.transmissionResolutionScale = prev;
    };
  }, [gl]);

  // resolução: Alta usa até 2x; Leve 1x
  useEffect(() => {
    setDpr(high ? Math.min(2, window.devicePixelRatio || 1) : 1);
  }, [high, setDpr]);
  useEffect(() => () => setDpr(Math.min(2, window.devicePixelRatio || 1)), [setDpr]);

  return (
    <>
      {choice === 'auto' ? <PerformanceMonitor bounds={() => [40, 240]} flipflops={2} onDecline={() => setDegraded(true)} /> : null}
      <EffectComposer multisampling={0} enableNormalPass={false}>
        {high ? <N8AO aoRadius={0.9} distanceFalloff={0.7} intensity={2.4} quality="medium" /> : <></>}
        {bloomOn ? <Bloom mipmapBlur intensity={Math.max(0.2, bloomIntensity)} luminanceThreshold={1.05} luminanceSmoothing={0.25} radius={0.72} levels={high ? 7 : 5} /> : <></>}
        <Exposure exposure={exposure} />
        <SMAA />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
      <FpsMeter />
      <ImageCapture />
    </>
  );
}

/** Contador de FPS (atualiza o store a cada 500 ms), para o painel e para medir desempenho. */
function FpsMeter() {
  const frames = useRef(0);
  const last = useRef(performance.now());
  useFrame(() => {
    frames.current++;
    const now = performance.now();
    if (now - last.current >= 500) {
      usePresentationUi.setState({ fps: Math.round((frames.current * 1000) / (now - last.current)) });
      frames.current = 0;
      last.current = now;
    }
  });
  useEffect(() => () => usePresentationUi.setState({ fps: null }), []);
  return null;
}

/**
 * Salvar imagem: sobe a resolução do renderizador (2x, no máximo 3840 px de largura), espera alguns quadros
 * para o compositor redimensionar e, logo depois do render, copia o canvas (toBlob copia o quadro na hora,
 * então não precisa de `preserveDrawingBuffer`). Depois restaura a resolução.
 */
function ImageCapture() {
  const gl = useThree((s) => s.gl);
  const getState = useThree((s) => s.get);
  const request = useRef<{ wait: number; restore: number; done: () => void; fail: (e: Error) => void } | null>(null);

  useEffect(() => {
    registerCapture(
      () =>
        new Promise<void>((resolve, reject) => {
          if (request.current) return resolve();
          const { size, viewport, setDpr } = getState();
          const restore = viewport.dpr;
          setDpr(captureScale(size.width, size.height, window.devicePixelRatio || 1, gl.capabilities.maxTextureSize));
          request.current = { wait: 4, restore, done: resolve, fail: reject };
        }),
    );
    return () => registerCapture(null);
  }, [gl, getState]);

  // prioridade 2: roda depois do render do EffectComposer (prioridade 1)
  useFrame(() => {
    const r = request.current;
    if (!r) return;
    if (r.wait-- > 0) return;
    request.current = null;
    const restore = () => getState().setDpr(r.restore);
    gl.domElement.toBlob((blob) => {
      if (!blob) return r.fail(new Error('Não foi possível gerar a imagem.'));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = imageFileName(useEditor.getState().project.meta.name, new Date());
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      r.done();
    }, 'image/png');
    restore();
  }, 2);
  return null;
}
