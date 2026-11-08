'use client';
import { useMemo, useRef, useState } from 'react';
import { Line } from '@react-three/drei';
import { SafeHtml as Html } from '../SafeHtml';
import * as THREE from 'three';
import { toast } from 'sonner';
import type { RoomUse, Vec2 } from '@chalecad/engine';
import { planBounds } from '@/lib/project/geometry';
import { addRoom, ROOM_USE_ORDER, ROOM_USES, roomAtPoint } from '@/lib/project/rooms';
import { makeShape } from '../geometry';
import { MotorGroup } from '../MotorGroup';
import { type ToolEnv } from './env';
import { useEditorActions, useHint, useKey } from './hooks';
import { usePlanePointer } from './pointer';

const COLOR = '#d97706';

/** Contorno do cômodo existente sob o cursor: borda âmbar e véu translúcido. */
function RoomHighlight({ polygon, z }: { polygon: Vec2[]; z: number }) {
  const geometry = useMemo(() => new THREE.ShapeGeometry(makeShape(polygon, [])), [polygon]);
  const pts = useMemo<[number, number, number][]>(() => [...polygon, polygon[0]!].map(([x, y]) => [x, y, z + 0.03]), [polygon, z]);
  return (
    <group>
      <mesh geometry={geometry} position={[0, 0, z + 0.025]} renderOrder={980}>
        <meshBasicMaterial color={COLOR} transparent opacity={0.22} depthTest={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <Line points={pts} color={COLOR} lineWidth={2.5} depthTest={false} renderOrder={981} />
    </group>
  );
}

/** Marcador de ponto (cursor em lugar vazio). */
function Pin({ p, z, mpp }: { p: Vec2; z: number; mpp: number }) {
  return (
    <group position={[p[0], p[1], z + 0.03]} scale={mpp * 7}>
      <mesh renderOrder={999}>
        <ringGeometry args={[0.7, 1, 24]} />
        <meshBasicMaterial color={COLOR} depthTest={false} toneMapped={false} />
      </mesh>
      <mesh renderOrder={999}>
        <circleGeometry args={[0.3, 12]} />
        <meshBasicMaterial color={COLOR} depthTest={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Menu leve com os usos, ancorado no ponto clicado. */
export function UseMenu({ p, z, onPick, onClose }: { p: Vec2; z: number; onPick: (use: RoomUse) => void; onClose: () => void }) {
  return (
    <Html position={[p[0], p[1], z + 0.05]} zIndexRange={[40, 30]} style={{ transform: 'translate(-50%, 12px)' }}>
      <div role="menu" aria-label="Uso do cômodo" className="pointer-events-auto w-44 rounded-lg border border-border bg-white p-1 shadow-lg" onPointerDown={(e) => e.stopPropagation()}>
        <p className="px-2 pt-1 pb-1.5 text-[10px] font-semibold tracking-wide text-stone-500 uppercase">Marcar cômodo como</p>
        {ROOM_USE_ORDER.map((use) => {
          const { label, icon: Icon } = ROOM_USES[use];
          return (
            <button
              key={use}
              type="button"
              role="menuitem"
              onClick={() => onPick(use)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium text-stone-800 outline-none hover:bg-stone-100 focus-visible:bg-stone-100 focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              <Icon className="size-3.5 text-stone-500" /> {label}
            </button>
          );
        })}
        <button type="button" onClick={onClose} className="mt-0.5 w-full rounded-md px-2 py-1 text-left text-[11px] text-stone-500 outline-none hover:bg-stone-100">
          Cancelar (Esc)
        </button>
      </div>
    </Html>
  );
}

/**
 * Cômodo: clique dentro de um ambiente para marcá-lo (menu de usos). Clique num cômodo existente seleciona.
 * O cômodo guarda só o ponto clicado; o motor acha o contorno pelas paredes em volta.
 */
export function RoomTool({ env }: { env: ToolEnv }) {
  const { update, select } = useEditorActions();
  const [hover, setHover] = useState<{ p: Vec2; mpp: number } | null>(null);
  const [menu, setMenu] = useState<Vec2 | null>(null);
  const menuRef = useRef<Vec2 | null>(null);
  menuRef.current = menu;
  const z = env.elevation;
  const rooms = env.model.rooms;

  const hovered = hover ? roomAtPoint(rooms, env.levelId, hover.p) : undefined;

  usePlanePointer(
    {
      onMove: (e) => setHover({ p: e.p, mpp: e.mpp }),
      onClick: (e) => {
        const existing = roomAtPoint(env.model.rooms, env.levelId, e.p);
        if (existing) {
          setMenu(null);
          select({ kind: 'room', id: existing.id });
          return;
        }
        const b = planBounds(env.project.typology);
        if (e.p[0] < b.x0 || e.p[0] > b.x1 || e.p[1] < b.y0 || e.p[1] > b.y1) {
          toast.info('Clique dentro da edificação para marcar o cômodo.');
          setMenu(null);
          return;
        }
        setMenu(e.p);
      },
      onLeave: () => setHover(null),
    },
    { enabled: true, z },
  );

  useKey(
    ['Escape'],
    () => {
      if (!menuRef.current) return false;
      setMenu(null);
      return true;
    },
  );
  useHint(menu ? 'Escolha o uso do cômodo · Esc cancela' : 'Clique dentro de um ambiente fechado para marcá-lo · clique num cômodo para selecioná-lo');

  const pick = (use: RoomUse) => {
    const p = menuRef.current;
    if (!p) return;
    const box: { id: string | null } = { id: null };
    update('Marcar cômodo', (d) => {
      box.id = addRoom(d, env.levelId, p, use);
    });
    setMenu(null);
    if (box.id) select({ kind: 'room', id: box.id });
  };

  return (
    <MotorGroup>
      {hovered?.polygon ? <RoomHighlight polygon={hovered.polygon} z={z} /> : hover && !menu ? <Pin p={hover.p} z={z} mpp={hover.mpp} /> : null}
      {menu ? <Pin p={menu} z={z} mpp={hover?.mpp ?? 0.01} /> : null}
      {menu ? <UseMenu p={menu} z={z} onPick={pick} onClose={() => setMenu(null)} /> : null}
    </MotorGroup>
  );
}
