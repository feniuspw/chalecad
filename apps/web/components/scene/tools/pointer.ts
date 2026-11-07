'use client';
import { useCallback, useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { V2 } from '@/lib/tools/geom';
import { rayHitHorizontal, sceneRayToMotor, type Ray3 } from '@/lib/tools/plane';

export interface PlaneEvent {
  /** Ponto em planta (motor) onde o raio do cursor cruza o plano. */
  p: V2;
  alt: boolean;
  shift: boolean;
  /** Metros por pixel na altura do plano: converte tolerâncias em px para metros. */
  mpp: number;
  native: PointerEvent | MouseEvent;
}

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

/** Raio do cursor no referencial do motor. */
export function useRayFromEvent() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  return useCallback(
    (e: { clientX: number; clientY: number }): Ray3 => {
      const r = gl.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const o = raycaster.ray.origin;
      const d = raycaster.ray.direction;
      return sceneRayToMotor([o.x, o.y, o.z], [d.x, d.y, d.z]);
    },
    [gl, camera],
  );
}

/** Metros por pixel no ponto (planta + cota z do motor). */
export function useMetersPerPixel() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  return useCallback(
    (p: V2, z: number) => {
      if ((camera as THREE.OrthographicCamera).isOrthographicCamera) return 1 / (camera as THREE.OrthographicCamera).zoom;
      const persp = camera as THREE.PerspectiveCamera;
      const dist = camera.position.distanceTo(new THREE.Vector3(p[0], z, -p[1]));
      return (2 * dist * Math.tan(THREE.MathUtils.degToRad(persp.fov) / 2)) / Math.max(1, size.height);
    },
    [camera, size.height],
  );
}

export interface PlanePointerHandlers {
  onMove?: (e: PlaneEvent) => void;
  onClick?: (e: PlaneEvent) => void;
  onDoubleClick?: (e: PlaneEvent) => void;
  /** Botão esquerdo pressionado. Devolva true para assumir o gesto (câmera não se move até soltar). */
  onDown?: (e: PlaneEvent) => boolean | void;
  onUp?: (e: PlaneEvent, moved: boolean) => void;
  onLeave?: () => void;
}

type GetState = () => { controls: unknown };
/** Liga/desliga a câmera (OrbitControls padrão) durante um arraste de objeto. */
export function setControlsEnabled(get: GetState, on: boolean) {
  const c = get().controls as { enabled: boolean } | null;
  if (c) c.enabled = on;
}

const CLICK_PX = 5;
const CLICK_MS = 600;

/**
 * Ouve o ponteiro sobre o canvas e traduz para pontos do plano horizontal `z` (cota do nível ativo).
 * Clique = soltar perto de onde pressionou (arraste de câmera não conta). Os handlers ficam em ref: o efeito
 * só se refaz quando `enabled`/`z`/câmera mudam.
 */
export function usePlanePointer(handlers: PlanePointerHandlers, opts: { enabled: boolean; z: number }) {
  const gl = useThree((s) => s.gl);
  const get = useThree((s) => s.get);
  const ray = useRayFromEvent();
  const mpp = useMetersPerPixel();
  const h = useRef(handlers);
  h.current = handlers;
  const { enabled, z } = opts;

  useEffect(() => {
    if (!enabled) return;
    const el = gl.domElement;
    let down: { x: number; y: number; t: number } | null = null;
    let claimed = false;
    let moved = false;

    const make = (e: PointerEvent | MouseEvent): PlaneEvent | null => {
      const p = rayHitHorizontal(ray(e), z);
      if (!p) return null;
      return { p, alt: e.altKey, shift: e.shiftKey, mpp: mpp(p, z), native: e };
    };
    const onMove = (e: PointerEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_PX) moved = true;
      const pe = make(e);
      if (pe) h.current.onMove?.(pe);
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
      moved = false;
      claimed = false;
      const pe = make(e);
      if (pe && h.current.onDown?.(pe) === true) {
        claimed = true;
        setControlsEnabled(get, false);
      }
    };
    const restore = () => setControlsEnabled(get, true);
    const onUp = (e: PointerEvent) => {
      if (e.button !== 0 || !down) return;
      const pe = make(e);
      const isClick = !moved && performance.now() - down.t < CLICK_MS;
      down = null;
      if (claimed) restore();
      if (pe) {
        h.current.onUp?.(pe, moved);
        if (isClick && !claimed) h.current.onClick?.(pe);
      }
      claimed = false;
    };
    const onDbl = (e: MouseEvent) => {
      const pe = make(e);
      if (pe) h.current.onDoubleClick?.(pe);
    };
    const onLeave = () => h.current.onLeave?.();
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    el.addEventListener('dblclick', onDbl);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      el.removeEventListener('dblclick', onDbl);
      el.removeEventListener('pointerleave', onLeave);
      restore();
    };
  }, [enabled, z, gl, get, ray, mpp]);
}

export interface DragOptions {
  /** Como achar o ponto: padrão = plano horizontal em `z`. */
  pick?: (ray: Ray3) => V2 | null;
  z?: number;
  onMove: (e: PlaneEvent) => void;
  onEnd?: (moved: boolean, e: PlaneEvent | null) => void;
}

/** Arraste de um objeto (alça): câmera parada, move/soltar pela janela. Retorna `begin(eventoInicial, opções)`. */
export function useDrag() {
  const get = useThree((s) => s.get);
  const ray = useRayFromEvent();
  const mpp = useMetersPerPixel();
  return useCallback(
    (start: { clientX: number; clientY: number }, o: DragOptions) => {
      setControlsEnabled(get, false);
      let moved = false;
      const z = o.z ?? 0;
      const make = (e: PointerEvent): PlaneEvent | null => {
        const r = ray(e);
        const p = o.pick ? o.pick(r) : rayHitHorizontal(r, z);
        return p ? { p, alt: e.altKey, shift: e.shiftKey, mpp: mpp(p, z), native: e } : null;
      };
      const move = (e: PointerEvent) => {
        if (Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY) > CLICK_PX) moved = true;
        if (!moved) return;
        const pe = make(e);
        if (pe) o.onMove(pe);
      };
      const finish = (e: PointerEvent | null) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        setControlsEnabled(get, true);
        o.onEnd?.(moved, e ? make(e) : null);
      };
      const up = (e: PointerEvent) => finish(e);
      const cancel = () => finish(null);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
    },
    [get, ray, mpp],
  );
}
