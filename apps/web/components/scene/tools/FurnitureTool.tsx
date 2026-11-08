'use client';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Line } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { toast } from 'sonner';
import { getCatalog } from '@chalecad/catalog';
import { isTyping } from '@/hooks/useShortcuts';
import { addFurniture, duplicateFurniture, normalizeRotation, placeEnv, placeFurniture, rotateFurniture, specOf, type Placement } from '@/lib/project/furniture';
import { useEditor } from '@/lib/store/editor';
import { FLOOR_PLATE } from '@/lib/three/finishes';
import { getFurnitureParts } from '@/lib/three/furniture/materials';
import { clearancePolygon, furnitureFootprint } from '@/lib/project/furniture';
import type { V2 } from '@/lib/tools/geom';
import { rayHitHorizontal } from '@/lib/tools/plane';
import { levelFloorZ } from '@/lib/three/walk';
import { FURNITURE_MIME, useFurnitureUi } from '../furnitureUi';
import { MotorGroup } from '../MotorGroup';
import { SceneLabel } from '../labels';
import type { ToolEnv } from './env';
import { useEditorActions, useHint, useKey } from './hooks';
import { usePlanePointer, useRayFromEvent } from './pointer';
import { fmt } from '@/lib/project/format';

const catalog = getCatalog();
const OK = '#0ea5e9';
const BAD = '#dc2626';

/** Cota do piso do nível ativo (com a placa de acabamento): onde o móvel pousa e onde o mouse é projetado. */
export const envFloorZ = (env: ToolEnv) => levelFloorZ(env.model.walls, env.levelId, env.elevation) + FLOOR_PLATE;

/** Encaixe do item no ponto, com a rotação atual da prévia. */
function usePlace(env: ToolEnv) {
  return useCallback(
    (item: string, p: V2, alt: boolean): (Placement & { item: string }) | null => {
      const spec = specOf(catalog, item);
      if (!spec) return null;
      const walls = env.model.walls.filter((w) => w.level === env.levelId);
      const e = placeEnv(env.project, catalog, walls, env.levelId);
      return { ...placeFurniture(spec, p, useFurnitureUi.getState().rotation, e, { free: alt }), item };
    },
    [env],
  );
}

function commit(env: ToolEnv, item: string, pl: Placement): boolean {
  if (pl.collision) {
    toast.warning('Não cabe aqui: o móvel cruza parede, outro móvel ou sai da planta.', { id: 'furniture-collision' });
    return false;
  }
  useEditor.getState().update('Adicionar móvel', (d) => void addFurniture(d, env.levelId, item, pl.position, pl.rotation));
  return true;
}

/**
 * Móveis: o item escolhido na biblioteca segue o mouse (fantasma já encaixado na parede, faixa de uso tracejada,
 * vermelho se colidir). Clique solta, `R` gira 90°, Alt solta sem encaixe, Esc encerra.
 */
export function FurnitureTool({ env }: { env: ToolEnv }) {
  const item = env.options.furnitureItem;
  const place = usePlace(env);
  const last = useRef<{ p: V2; alt: boolean } | null>(null);
  const setGhost = useFurnitureUi((s) => s.setGhost);
  const spec = specOf(catalog, item);
  const z = envFloorZ(env);

  const refresh = useCallback(() => {
    const l = last.current;
    const pl = l ? place(item, l.p, l.alt) : null;
    setGhost(pl ? { item, position: pl.position, rotation: pl.rotation, collision: pl.collision, wallId: pl.wallId } : null);
  }, [place, item, setGhost]);

  usePlanePointer(
    {
      onMove: (e) => {
        last.current = { p: e.p, alt: e.alt };
        refresh();
      },
      onClick: (e) => {
        const pl = place(item, e.p, e.alt);
        if (pl) commit(env, item, pl);
      },
      onLeave: () => setGhost(null),
    },
    { enabled: !!spec, z },
  );

  useEffect(() => () => setGhost(null), [setGhost]);
  useEffect(refresh, [refresh, env.project.furniture.length]);

  useKey(['r'], () => {
    const s = useFurnitureUi.getState();
    s.setRotation(normalizeRotation(s.rotation + 90));
    refresh();
    return true;
  });
  useKey(['Escape'], () => {
    useEditor.getState().setTool('select');
    return true;
  });
  useHint(spec ? `${spec.name}: clique para soltar · R gira 90° · Alt sem encaixe · Esc encerra` : 'Escolha um móvel na biblioteca');
  return null;
}

/** Solta o móvel arrastado da biblioteca (HTML5 drag) no piso do nível ativo, com encaixe. */
export function FurnitureDropTarget({ env }: { env: ToolEnv }) {
  const gl = useThree((s) => s.gl);
  const ray = useRayFromEvent();
  const place = usePlace(env);
  const z = envFloorZ(env);
  const h = useRef({ place, z, env, ray });
  h.current = { place, z, env, ray };

  useEffect(() => {
    const el = gl.domElement;
    const isFurniture = (e: DragEvent) => !!useFurnitureUi.getState().dragItem || (e.dataTransfer?.types.includes(FURNITURE_MIME) ?? false);
    const at = (e: DragEvent) => {
      const { place: pl, z: zz, ray: r } = h.current;
      const item = useFurnitureUi.getState().dragItem ?? e.dataTransfer?.getData(FURNITURE_MIME) ?? '';
      const p = rayHitHorizontal(r(e), zz);
      return p && item ? pl(item, p, e.altKey) : null;
    };
    const over = (e: DragEvent) => {
      if (!isFurniture(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      const pl = at(e);
      useFurnitureUi.getState().setGhost(pl ? { item: pl.item, position: pl.position, rotation: pl.rotation, collision: pl.collision, wallId: pl.wallId } : null);
    };
    const leave = () => useFurnitureUi.getState().setGhost(null);
    const drop = (e: DragEvent) => {
      if (!isFurniture(e)) return;
      e.preventDefault();
      const pl = at(e);
      useFurnitureUi.getState().setGhost(null);
      if (pl) commit(h.current.env, pl.item, pl);
    };
    el.addEventListener('dragover', over);
    el.addEventListener('dragleave', leave);
    el.addEventListener('drop', drop);
    return () => {
      el.removeEventListener('dragover', over);
      el.removeEventListener('dragleave', leave);
      el.removeEventListener('drop', drop);
    };
  }, [gl]);
  return null;
}

let ghostOk: THREE.MeshStandardMaterial | undefined;
let ghostBad: THREE.MeshStandardMaterial | undefined;
const ghostMat = (bad: boolean) => {
  if (bad) return (ghostBad ??= new THREE.MeshStandardMaterial({ color: BAD, emissive: BAD, emissiveIntensity: 0.25, transparent: true, opacity: 0.6, depthWrite: false }));
  return (ghostOk ??= new THREE.MeshStandardMaterial({ color: '#7dd3fc', emissive: OK, emissiveIntensity: 0.2, transparent: true, opacity: 0.6, depthWrite: false }));
};

const loop = (poly: V2[], z: number): [number, number, number][] => [...poly, poly[0]!].map(([x, y]) => [x, y, z]);

/** Fantasma do móvel (3D translúcido + contorno + faixa de uso) na posição da prévia. */
export function FurnitureGhostLayer({ z }: { z: number }) {
  const ghost = useFurnitureUi((s) => s.ghost);
  const spec = ghost ? specOf(catalog, ghost.item) : undefined;
  const parts = useMemo(() => (spec ? getFurnitureParts(spec.model, spec.size) : []), [spec]);
  if (!ghost || !spec) return null;
  const color = ghost.collision ? BAD : OK;
  const foot = furnitureFootprint(spec, ghost.position, ghost.rotation);
  const clear = clearancePolygon(spec, ghost.position, ghost.rotation);
  return (
    <MotorGroup>
      <group position={[ghost.position[0], ghost.position[1], z]} rotation={[0, 0, (ghost.rotation * Math.PI) / 180]}>
        {parts.map((p) => (
          <mesh key={p.token} geometry={p.geometry} material={ghostMat(ghost.collision)} renderOrder={970} raycast={() => null} />
        ))}
      </group>
      <Line points={loop(foot, z + 0.02)} color={color} lineWidth={2} depthTest={false} renderOrder={975} />
      {clear ? <Line points={loop(clear, z + 0.02)} color={color} lineWidth={1.2} dashed dashSize={0.08} gapSize={0.06} depthTest={false} renderOrder={974} /> : null}
      <SceneLabel position={[ghost.position[0], ghost.position[1], z + spec.size.h + 0.12]} tone={ghost.collision ? 'bad' : 'live'}>
        {ghost.collision ? 'Não cabe aqui' : ghost.wallId ? `${spec.name} · encaixado na parede` : `${spec.name} · ${fmt(spec.size.w)} × ${fmt(spec.size.d)} m`}
      </SceneLabel>
    </MotorGroup>
  );
}

/** Atalhos do móvel selecionado: `R` gira 90°, Ctrl/⌘+D duplica (Delete e Esc já vêm dos atalhos globais). */
export function FurnitureKeys() {
  const { select } = useEditorActions();
  const selected = useEditor((s) => (s.selection?.kind === 'furniture' ? s.selection.id : null));
  useKey(
    ['r'],
    () => {
      if (!selected) return false;
      useEditor.getState().update('Girar móvel', (d) => void rotateFurniture(d, selected, 90));
      return true;
    },
    !!selected,
  );
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if ((!e.metaKey && !e.ctrlKey) || e.altKey || e.key.toLowerCase() !== 'd' || isTyping(e.target)) return;
      e.preventDefault();
      const box: { id: string | null } = { id: null };
      useEditor.getState().update('Duplicar móvel', (d) => {
        box.id = duplicateFurniture(d, selected);
      });
      if (box.id) select({ kind: 'furniture', id: box.id });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, select]);
  return null;
}
