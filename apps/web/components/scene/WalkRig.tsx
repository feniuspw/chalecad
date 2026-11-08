'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PerspectiveCamera, PointerLockControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getCatalog } from '@chalecad/catalog';
import type { BuildingModel, ResolvedStair } from '@chalecad/engine';
import { isTyping } from '@/hooks/useShortcuts';
import { useEditor } from '@/lib/store/editor';
import { useFurnitureModels } from './furnitureData';
import {
  buildFurnitureWalkRects,
  buildSlabRailRects,
  buildStairWalkRects,
  buildWalkWalls,
  levelFloorZ,
  moveWithCollision,
  onStairFootprint,
  stairEdges,
  stairHeightAt,
  walkStart,
  WALK,
  yawFromHeading,
  type V2,
  type WallRect,
} from '@/lib/three/walk';

type Rig = { stairs: { stair: ResolvedStair; lo: string; hi: string }[]; base: Map<string, WallRect[]> };

/**
 * Obstáculos do instante: os do nível atual mais as escadas. No nível de baixo o topo da escada é fechado (fica sob a laje),
 * no de cima o pé (só se chega pela chegada); sobre a escada, só as laterais.
 */
function collidersFor(rig: Rig, st: { pos: V2; level: string }): WallRect[] {
  const out = [...(rig.base.get(st.level) ?? [])];
  for (const x of rig.stairs) {
    if (x.lo !== st.level && x.hi !== st.level) continue;
    const where = onStairFootprint(x.stair, st.pos) ? 'on' : x.lo === st.level ? 'lower' : 'upper';
    out.push(...buildStairWalkRects(x.stair, where));
  }
  return out;
}

type PLC = React.ComponentRef<typeof PointerLockControls>;

const TURN_SPEED = 1.8;
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);

/**
 * Primeira pessoa: olho a 1,60 m do piso do nível ativo, WASD/setas, Shift corre, colisão com as paredes.
 * O mouse olha ao redor depois de um clique na cena (pointer lock); Esc sai.
 */
export function WalkRig({ model, levelId, far }: { model: BuildingModel; levelId: string; far: number }) {
  const gl = useThree((s) => s.gl);
  const cam = useRef<THREE.PerspectiveCamera>(null);
  const controls = useRef<PLC>(null);
  const [ready, setReady] = useState(false);

  const furniture = useFurnitureModels();
  const levels = useEditor((s) => s.project.levels);
  const projectStairs = useEditor((s) => s.project.stairs);

  // obstáculos por nível: paredes (com as portas recortadas), móveis (tapete não conta) e guarda-corpo do mezanino
  const rig = useMemo(() => {
    const catalog = getCatalog();
    const passable = (item: string) => catalog.furniture.find((f) => f.id === item)?.collides === false;
    const floorOf = (id: string) => levelFloorZ(model.walls, id, levels.find((l) => l.id === id)?.elevation ?? 0);
    // escadas que ligam dois níveis: `lo` é o nível de baixo e `hi` o de cima (pela cota do piso)
    const stairs = projectStairs.flatMap((ps) => {
      const stair = model.stairs.find((s) => s.id === ps.id);
      if (!stair || stair.treads.length === 0 || !stairEdges(stair)) return [];
      const [lo, hi] = floorOf(ps.from) <= floorOf(ps.to) ? [ps.from, ps.to] : [ps.to, ps.from];
      if (floorOf(lo) === floorOf(hi)) return [];
      return [{ stair, lo, hi, loZ: floorOf(lo), hiZ: floorOf(hi) }];
    });
    const base = new Map<string, WallRect[]>();
    for (const l of levels) {
      const rails = model.slabs
        .filter((sl) => sl.kind === 'mezzanine' && sl.level === l.id)
        .flatMap((sl) =>
          buildSlabRailRects(
            sl,
            model.walls,
            stairs.filter((st) => st.hi === l.id).map((st) => stairEdges(st.stair)!.exit),
          ),
        );
      base.set(l.id, [...buildWalkWalls(model.walls, model.openings, l.id), ...buildFurnitureWalkRects(furniture, l.id, passable), ...rails]);
    }
    return { stairs, base, floorOf };
  }, [model.walls, model.openings, model.slabs, model.stairs, levels, projectStairs, furniture]);
  const rigRef = useRef(rig);
  rigRef.current = rig;
  const elevation = levels.find((l) => l.id === levelId)?.elevation ?? 0;
  const startFloor = levelFloorZ(model.walls, levelId, elevation);
  const state = useRef<{ pos: V2; level: string; onStair: boolean; z: number; eye: number }>({ pos: [0, 0], level: levelId, onStair: false, z: startFloor, eye: startFloor + WALK.eyeHeight });
  const keys = useRef(new Set<string>());

  // posição inicial: porta de entrada (1 m para dentro) ou centro; só na montagem
  useLayoutEffect(() => {
    const c = cam.current;
    if (!c) return;
    const start = walkStart({ walls: model.walls.filter((w) => w.level === levelId), openings: model.openings, footprint: model.footprint, bbox: model.bbox });
    state.current.pos = start.pos;
    c.rotation.order = 'YXZ';
    c.position.set(start.pos[0], state.current.eye, -start.pos[1]);
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
      state.current.pos = moveWithCollision(state.current.pos, [mx, -mz], collidersFor(rigRef.current, state.current));
    }
    // altura: sobre a escada segue a rampa dos degraus; ao sair dela fica no nível mais próximo (de cima ou de baixo)
    const st = state.current;
    const { stairs, floorOf } = rigRef.current;
    const on = stairs.find((x) => (x.lo === st.level || x.hi === st.level) && onStairFootprint(x.stair, st.pos));
    if (on) {
      st.z = stairHeightAt(on.stair, st.pos) ?? st.z;
      st.onStair = true;
      st.level = st.z > (on.loZ + on.hiZ) / 2 ? on.hi : on.lo;
    } else {
      st.onStair = false;
      st.z = floorOf(st.level);
    }
    st.eye += (st.z + WALK.eyeHeight - st.eye) * Math.min(1, dt * 12);
    const [px, py] = st.pos;
    c.position.set(px, st.eye, -py);
  });

  return (
    <>
      <PerspectiveCamera ref={cam} makeDefault fov={72} near={0.05} far={far} />
      {ready ? <PointerLockControls ref={controls} camera={cam.current ?? undefined} onUnlock={() => useEditor.getState().setWalk(false)} /> : null}
    </>
  );
}
