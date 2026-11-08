'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PerspectiveCamera, PointerLockControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getCatalog } from '@chalecad/catalog';
import type { BuildingModel } from '@chalecad/engine';
import { isTyping } from '@/hooks/useShortcuts';
import { useEditor } from '@/lib/store/editor';
import { useFurnitureModels } from './furnitureData';
import { buildFurnitureWalkRects, buildWalkWalls, levelFloorZ, moveWithCollision, walkStart, WALK, yawFromHeading, type V2 } from '@/lib/three/walk';

type PLC = React.ComponentRef<typeof PointerLockControls>;

const TURN_SPEED = 1.8;
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);

/**
 * Primeira pessoa: olho a 1,60 m do piso do nível ativo, WASD/setas, Shift corre, colisão com as paredes.
 * O mouse olha ao redor depois de um clique na cena (pointer lock); Esc sai.
 */
export function WalkRig({ model, levelId, far }: { model: BuildingModel; levelId: string; far: number }) {
  const gl = useThree((s) => s.gl);
  const elevation = useEditor((s) => s.project.levels.find((l) => l.id === levelId)?.elevation ?? 0);
  const cam = useRef<THREE.PerspectiveCamera>(null);
  const controls = useRef<PLC>(null);
  const [ready, setReady] = useState(false);

  const furniture = useFurnitureModels();
  // paredes (com as portas recortadas) e móveis do nível como obstáculos; tapete não conta
  const walls = useMemo(() => {
    const catalog = getCatalog();
    const passable = (item: string) => catalog.furniture.find((f) => f.id === item)?.collides === false;
    return [...buildWalkWalls(model.walls, model.openings, levelId), ...buildFurnitureWalkRects(furniture, levelId, passable)];
  }, [model.walls, model.openings, levelId, furniture]);
  const floorZ = levelFloorZ(model.walls, levelId, elevation);
  const state = useRef<{ pos: V2 }>({ pos: [0, 0] });
  const keys = useRef(new Set<string>());
  const wallsRef = useRef(walls);
  wallsRef.current = walls;
  const floorRef = useRef(floorZ);
  floorRef.current = floorZ;

  // posição inicial: porta de entrada (1 m para dentro) ou centro; só na montagem
  useLayoutEffect(() => {
    const c = cam.current;
    if (!c) return;
    const start = walkStart({ walls: model.walls.filter((w) => w.level === levelId), openings: model.openings, footprint: model.footprint, bbox: model.bbox });
    state.current.pos = start.pos;
    c.rotation.order = 'YXZ';
    c.position.set(start.pos[0], floorRef.current + WALK.eyeHeight, -start.pos[1]);
    c.rotation.set(0, yawFromHeading(start.heading), 0);
    setReady(true);
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.code === 'Escape') {
        useEditor.getState().setWalk(false);
        return;
      }
      if (!MOVE_KEYS.has(e.code)) return;
      // impede os atalhos do editor (W = parede, E = escada, A = cômodo...) enquanto anda
      e.preventDefault();
      e.stopImmediatePropagation();
      keys.current.add(e.code);
    };
    const up = (e: KeyboardEvent) => {
      if (MOVE_KEYS.has(e.code)) keys.current.delete(e.code);
    };
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', blur);
      if (document.pointerLockElement) document.exitPointerLock();
    };
  }, []);

  // clique na cena captura o mouse
  useEffect(() => {
    const el = gl.domElement;
    const lock = () => controls.current?.lock();
    el.addEventListener('click', lock);
    return () => el.removeEventListener('click', lock);
  }, [gl]);

  const dir = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dtRaw) => {
    const c = cam.current;
    if (!c) return;
    const dt = Math.min(dtRaw, 0.1);
    const k = keys.current;
    const turn = (k.has('ArrowLeft') ? 1 : 0) - (k.has('ArrowRight') ? 1 : 0);
    if (turn) c.rotation.y += turn * TURN_SPEED * dt;
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const side = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    if (fwd || side) {
      c.getWorldDirection(dir);
      const l = Math.hypot(dir.x, dir.z) || 1;
      const fx = dir.x / l;
      const fz = dir.z / l;
      let mx = fx * fwd + -fz * side;
      let mz = fz * fwd + fx * side;
      const m = Math.hypot(mx, mz) || 1;
      const speed = WALK.speed * (k.has('ShiftLeft') || k.has('ShiftRight') ? WALK.runFactor : 1) * dt;
      mx = (mx / m) * speed;
      mz = (mz / m) * speed;
      state.current.pos = moveWithCollision(state.current.pos, [mx, -mz], wallsRef.current);
    }
    const [px, py] = state.current.pos;
    c.position.set(px, floorRef.current + WALK.eyeHeight, -py);
  });

  return (
    <>
      <PerspectiveCamera ref={cam} makeDefault fov={72} near={0.05} far={far} />
      {ready ? <PointerLockControls ref={controls} camera={cam.current ?? undefined} onUnlock={() => useEditor.getState().setWalk(false)} /> : null}
    </>
  );
}
