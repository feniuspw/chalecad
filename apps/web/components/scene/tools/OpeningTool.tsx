'use client';
import { useMemo, useState } from 'react';
import { Edges } from '@react-three/drei';
import { toast } from 'sonner';
import type { HostWall, RoofPlane } from '@chalecad/engine';
import { useEditor } from '@/lib/store/editor';
import { newId } from '@/lib/project/ids';
import { fmt } from '@/lib/project/format';
import { OPENING_LABELS } from '@/lib/project/labels';
import { nearestHostWall, placeOnRoof, placeOnWall, planeUV, sillFor, type OpeningSpec, type Placement } from '@/lib/tools/opening';
import { sceneToMotor } from '@/lib/tools/plane';
import { wallBasis } from '@/lib/three/convert';
import { basisTransform, makeRoofGeometry } from '../geometry';
import { SceneLabel } from '../labels';
import { MotorGroup } from '../MotorGroup';
import type { ToolEnv } from './env';
import { useHint } from './hooks';
import { usePlanePointer } from './pointer';

const OK = '#16a34a';
const BAD = '#dc2626';

function Ghost({ w, h, depth, ok }: { w: number; h: number; depth: number; ok: boolean }) {
  return (
    <mesh renderOrder={980}>
      <boxGeometry args={[w, h, depth]} />
      <meshBasicMaterial color={ok ? OK : BAD} transparent opacity={0.4} depthTest={false} toneMapped={false} />
      <Edges color={ok ? OK : BAD} lineWidth={2} raycast={() => null} />
    </mesh>
  );
}

function spec(env: ToolEnv): OpeningSpec {
  const o = env.options;
  return { type: o.openingType, width: o.openingWidth, height: o.openingHeight, sill: o.openingSill };
}

function commit(hostId: string, type: OpeningSpec['type'], p: Placement & { sill?: number }, s: OpeningSpec) {
  const id = newId('o');
  const sill = p.sill ?? sillFor(s);
  useEditor.getState().update(`Inserir ${OPENING_LABELS[type].toLowerCase()}`, (d) => {
    d.openings.push({ id, host: hostId, type, offset: Math.round(p.offset * 1000) / 1000, width: s.width, height: s.height, sill: Math.round(sill * 1000) / 1000 });
  });
  useEditor.getState().select({ kind: 'opening', id });
}

/** Abertura em parede: prévia segue o cursor ao longo da parede, com snap na modulação; vermelho se não couber. */
function WallOpening({ env }: { env: ToolEnv }) {
  const [hover, setHover] = useState<{ wall: HostWall; pl: Placement } | null>(null);
  const s = spec(env);

  const compute = (p: [number, number], alt: boolean, mpp: number) => {
    const hit = nearestHostWall(p, env.model.walls, env.levelId, Math.max(0.3, 14 * mpp));
    if (!hit) return null;
    const existing = env.project.openings.filter((o) => o.host === hit.wall.id);
    const pl = placeOnWall(hit.wall, hit.u, s, { grid: env.options.snapGrid, modulation: env.options.snapModulation, studSpacing: env.studSpacing, disabled: alt }, existing);
    return { wall: hit.wall, pl };
  };

  usePlanePointer(
    {
      onMove: (e) => setHover(compute(e.p, e.alt, e.mpp)),
      onClick: (e) => {
        const h = compute(e.p, e.alt, e.mpp);
        if (!h) return;
        if (!h.pl.fits) {
          toast.info(h.pl.reason ?? 'Não cabe aqui.', { id: 'opening-nofit' });
          return;
        }
        commit(h.wall.id, s.type, h.pl, s);
      },
      onLeave: () => setHover(null),
    },
    { enabled: true, z: env.elevation },
  );
  useHint('Passe sobre uma parede e clique para inserir · Alt sem snap · verde cabe, vermelho não cabe');

  const hostWall = hover?.wall;
  const t = useMemo(() => (hostWall ? basisTransform(wallBasis(hostWall)) : null), [hostWall]);
  if (!hover || !t) return null;
  const { pl, wall } = hover;
  const w = pl.u1 - pl.u0;
  const h = pl.v1 - pl.v0;
  return (
    <MotorGroup>
      <group position={t.position} quaternion={t.quaternion}>
        <group position={[pl.u0 + w / 2, pl.v0 + h / 2, 0]}>
          <Ghost w={w} h={h} depth={wall.thickness + 0.06} ok={pl.fits} />
        </group>
        <SceneLabel position={[pl.u0 + w / 2, pl.v1 + 0.15, 0]} tone={pl.fits ? 'ok' : 'bad'}>
          {pl.fits ? `${fmt(w)} × ${fmt(h)} m · a ${fmt(pl.offset)} m do início` : (pl.reason ?? 'Não cabe')}
        </SceneLabel>
      </group>
    </MotorGroup>
  );
}

function RoofPlaneTarget({ plane, env, onHover, onClickAt }: { plane: RoofPlane; env: ToolEnv; onHover: (v: { plane: RoofPlane; pl: Placement & { sill: number } } | null) => void; onClickAt: (plane: RoofPlane, pl: Placement & { sill: number }) => void }) {
  const built = useMemo(() => makeRoofGeometry(plane, [], 0.04), [plane]);
  const s = spec(env);
  const place = (pt: { x: number; y: number; z: number }, alt: boolean) => {
    const m = sceneToMotor([pt.x, pt.y, pt.z]);
    return placeOnRoof(plane, planeUV(plane, m), s, { grid: env.options.snapGrid, modulation: false, studSpacing: env.studSpacing, disabled: alt });
  };
  return (
    <mesh
      geometry={built.geometry}
      position={built.position}
      quaternion={built.quaternion}
      onPointerMove={(e) => {
        e.stopPropagation();
        onHover({ plane, pl: place(e.point, e.altKey) });
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        if (e.delta > 4) return;
        e.stopPropagation();
        onClickAt(plane, place(e.point, e.altKey));
      }}
    >
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

/** Claraboia: o cursor percorre as águas do telhado. */
function Skylight({ env }: { env: ToolEnv }) {
  const [hover, setHover] = useState<{ plane: RoofPlane; pl: Placement & { sill: number } } | null>(null);
  const s = spec(env);
  useHint('Passe sobre uma água do telhado e clique para inserir a claraboia · Alt sem snap');
  const t = useMemo(() => (hover ? makeRoofGeometry(hover.plane, [], 0.04) : null), [hover?.plane]);
  return (
    <MotorGroup>
      {env.model.roofPlanes.map((p) => (
          <RoofPlaneTarget
            key={p.id}
            plane={p}
            env={env}
            onHover={setHover}
            onClickAt={(plane, pl) => {
              if (!pl.fits) {
                toast.info(pl.reason ?? 'Não cabe aqui.', { id: 'opening-nofit' });
                return;
              }
              commit(plane.id, 'skylight', pl, s);
            }}
          />
      ))}
      {hover && t ? (
        <group position={t.position} quaternion={t.quaternion}>
          <group position={[hover.pl.u0 + (hover.pl.u1 - hover.pl.u0) / 2, hover.pl.v0 + (hover.pl.v1 - hover.pl.v0) / 2, 0.02]}>
            <Ghost w={hover.pl.u1 - hover.pl.u0} h={hover.pl.v1 - hover.pl.v0} depth={0.1} ok={hover.pl.fits} />
          </group>
          <SceneLabel position={[hover.pl.u0 + (hover.pl.u1 - hover.pl.u0) / 2, hover.pl.v1 + 0.2, 0.1]} tone={hover.pl.fits ? 'ok' : 'bad'}>
            {hover.pl.fits ? `${fmt(s.width)} × ${fmt(s.height)} m` : (hover.pl.reason ?? 'Não cabe')}
          </SceneLabel>
        </group>
      ) : null}
    </MotorGroup>
  );
}

export function OpeningTool({ env }: { env: ToolEnv }) {
  return env.options.openingType === 'skylight' ? <Skylight env={env} /> : <WallOpening env={env} />;
}
