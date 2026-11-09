'use client';
import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { Vec2 } from '@chalecad/engine';
import { fmt } from '@/lib/project/format';
import { SIDE_LABEL, dashDotSegments, hatchLines, lotOutline, setbackBands, setbackDims, toProject } from '@/lib/approval/lotGeometry';
import { useEditor } from '@/lib/store/editor';
import { SceneLabel } from '../../labels';
import { useLotUi } from './store';

type P3 = [number, number, number];

function Ring({ at, z, color, label }: { at: Vec2; z: number; color: string; label: string }) {
  const pts = useMemo<P3[]>(() => Array.from({ length: 25 }, (_, i) => [at[0] + Math.cos((i / 24) * Math.PI * 2) * 0.6, at[1] + Math.sin((i / 24) * Math.PI * 2) * 0.6, z]), [at, z]);
  return (
    <group>
      <Line points={pts} color={color} lineWidth={2} />
      <SceneLabel position={[at[0], at[1], z]}>{label}</SceneLabel>
    </group>
  );
}

/**
 * Camada "Lote" da planta: contorno em traço-ponto, faixas de recuo mínimo (vermelho claro, hachuradas, quando a casa
 * invade), recuos reais cotados até as divisas, fossa e poço. Só leitura. Fica dentro do `MotorGroup` da planta.
 */
export function LotPlanLayer({ elevation, footprint }: { elevation: number; footprint: Vec2[] }) {
  const on = useLotUi((s) => s.layerOn);
  const lot = useEditor((s) => s.project.legal.lot);
  const zoning = useEditor((s) => s.project.legal.zoning);
  const septic = useEditor((s) => s.project.legal.septicPosition);
  const well = useEditor((s) => s.project.legal.wellPosition);
  const z = elevation + 0.012;

  const g = useMemo(() => {
    if (!lot || footprint.length < 3) return null;
    const P = (p: Vec2): P3 => {
      const q = toProject(lot, p);
      return [q[0], q[1], z];
    };
    const segs = dashDotSegments(lotOutline(lot)).flatMap(([a, b]) => [P(a), P(b)]);
    const bands = setbackBands(lot, zoning, footprint).map((b) => {
      const [x0, y0, x1, y1] = b.rect;
      const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map((c) => toProject(lot, c as Vec2));
      const shape = new THREE.Shape(corners.map((c) => new THREE.Vector2(c[0], c[1])));
      return { ...b, geometry: new THREE.ShapeGeometry(shape), hatch: b.invaded ? hatchLines(b.rect, 0.4).flatMap(([a, c]) => [P(a), P(c)]) : [] };
    });
    const dims = setbackDims(lot, footprint).map((d) => ({ ...d, a: P(d.from), b: P(d.to) }));
    return { segs, bands, dims };
  }, [lot, zoning, footprint, z]);

  if (!on || !lot || !g) return null;
  const at = (v: Vec2 | undefined) => (v ? toProject(lot, v) : null);
  const sp = at(septic);
  const wp = at(well);
  return (
    <group data-testid="lot-layer">
      {g.bands.map((b) => (
        <group key={b.side}>
          <mesh geometry={b.geometry} position={[0, 0, z - 0.004]} renderOrder={1}>
            <meshBasicMaterial color={b.invaded ? '#fca5a5' : '#d6d3d1'} transparent opacity={b.invaded ? 0.45 : 0.22} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
          {b.hatch.length > 0 ? <Line points={b.hatch} segments color="#dc2626" lineWidth={1} transparent opacity={0.7} /> : null}
        </group>
      ))}
      {g.segs.length > 0 ? <Line points={g.segs} segments color="#292524" lineWidth={1.6} /> : null}
      {g.dims.map((d) => (
        <group key={d.side}>
          <Line points={[d.a, d.b]} color={d.value < 0 ? '#dc2626' : '#57534e'} lineWidth={1.2} />
          <SceneLabel position={[(d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2, z]} tone={d.value < 0 ? 'bad' : 'dim'}>
            {SIDE_LABEL[d.side]} {fmt(d.value, 2)} m
          </SceneLabel>
        </group>
      ))}
      {sp ? <Ring at={sp} z={z} color="#78350f" label="Fossa" /> : null}
      {wp ? <Ring at={wp} z={z} color="#0369a1" label="Poço" /> : null}
    </group>
  );
}
