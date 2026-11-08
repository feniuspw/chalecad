'use client';
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { OrbitControls } from '@react-three/drei';
import { registerDirector, type PlayOptions } from '@/lib/three/director';
import type { Pose } from '@/lib/three/viewpoints';

type OrbitControlsImpl = React.ComponentRef<typeof OrbitControls>;

/** Registra o diretor de câmera (voos, órbita, trava) da apresentação. Renderiza nada. */
export function CameraDirector() {
  const camera = useThree((s) => s.camera);
  const getState = useThree((s) => s.get);
  const invalidate = useThree((s) => s.invalidate);
  const job = useRef<{ opts: PlayOptions; start: number | null; done: (ok: boolean) => void } | null>(null);

  const controls = () => getState().controls as unknown as OrbitControlsImpl | null;

  useEffect(() => {
    const apply = (p: Pose) => {
      const c = controls();
      // o evento "start" faz o CameraRig largar a transição que estiver em curso
      c?.dispatchEvent({ type: 'start' } as never);
      camera.position.set(...p.position);
      if (c) {
        c.target.set(...p.target);
        c.update();
      } else camera.lookAt(...p.target);
      invalidate();
    };
    registerDirector({
      current: () => {
        const c = controls();
        if (!c) return null;
        return { position: camera.position.toArray() as Pose['position'], target: c.target.toArray() as Pose['target'] };
      },
      set: apply,
      play: (opts) =>
        new Promise<boolean>((resolve) => {
          job.current?.done(false);
          controls()?.dispatchEvent({ type: 'start' } as never);
          const onAbort = () => {
            if (job.current?.opts === opts) job.current = null;
            resolve(false);
          };
          if (opts.signal?.aborted) return resolve(false);
          opts.signal?.addEventListener('abort', onAbort, { once: true });
          job.current = {
            opts,
            start: null,
            done: (ok) => {
              opts.signal?.removeEventListener('abort', onAbort);
              resolve(ok);
            },
          };
          apply(opts.pose(0));
        }),
      lock: (locked) => {
        const c = controls();
        if (c) c.enabled = !locked;
      },
      canvas: () => getState().gl.domElement,
      lens: () => {
        const { size } = getState();
        return { fovDeg: (camera as { fov?: number }).fov ?? 35, aspect: size.width / Math.max(1, size.height) };
      },
    });
    return () => {
      job.current?.done(false);
      job.current = null;
      registerDirector(null);
      const c = controls();
      if (c) c.enabled = true;
    };
  }, [camera, getState, invalidate]);

  useFrame((state) => {
    const j = job.current;
    if (!j) return;
    j.start ??= state.clock.elapsedTime;
    const t = Math.min(j.opts.duration, state.clock.elapsedTime - j.start);
    const p = j.opts.pose(t);
    camera.position.set(...p.position);
    const c = controls();
    if (c) {
      c.target.set(...p.target);
      c.update();
    }
    j.opts.onFrame?.(t);
    if (t >= j.opts.duration) {
      job.current = null;
      j.done(true);
    }
  }, -1);
  return null;
}
