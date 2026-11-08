'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getCatalog } from '@chalecad/catalog';
import type { Highlight } from '@/lib/store/types';
import type { Piece, StructuralCheck } from '@chalecad/engine';
import { buildPieceBatches, GROUP_LABELS, WOOD_GROUP_LABELS, ROLE_GROUP, roleColor, sectionOutline, type PieceBatch, type SectionDims } from '@/lib/three/skeleton';
import { heatColor, pieceHeat, type HeatIndex } from '@/lib/three/heatmap';
import { ExplodeGroup } from './ExplodeGroup';
import { useSceneInfo } from './sceneInfo';

const FALLBACK: SectionDims = { web: 90, flange: 40, lip: 12, thickness: 0.95 };
const HIGHLIGHT = '#ff9f0a';
const FADE_TO = new THREE.Color('#e7e5e4');

let profileDims: Map<string, SectionDims> | null = null;
function dimsFor(profileId: string): SectionDims {
  if (!profileDims) {
    profileDims = new Map(getCatalog().profiles.map((p) => [p.id, { web: p.web, flange: p.flange, lip: p.lip, thickness: p.thickness }]));
  }
  return profileDims.get(profileId) ?? FALLBACK;
}

const geoCache = new Map<string, THREE.BufferGeometry>();

/**
 * Seção em C extrudada com comprimento unitário ao longo de +X (a matriz de cada peça escala X pelo comprimento).
 * Forma em (Z da mesa, Y da alma); extrusão em +Z da forma vira +X.
 */
export function profileGeometry(profileId: string): THREE.BufferGeometry {
  let g = geoCache.get(profileId);
  if (g) return g;
  const pts = sectionOutline(dimsFor(profileId));
  const shape = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
  g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, steps: 1 });
  // forma (sx, sy, ez) -> (X = ez, Y = sy, Z = -sx): rotação própria (det = +1)
  g.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)));
  g.translate(-0.5, 0, 0);
  g.computeBoundingSphere();
  geoCache.set(profileId, g);
  return g;
}

const colorCache = new Map<string, THREE.Color>();
const col = (hex: string) => {
  let c = colorCache.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    colorCache.set(hex, c);
  }
  return c;
};

export interface SkeletonViewProps {
  pieces: Piece[];
  /** `role`: cor por função; `heat`: mapa de calor. */
  colorBy: 'role' | 'heat';
  heat?: HeatIndex | null;
  checks?: StructuralCheck[];
  highlight?: Highlight | null;
  hoverable?: boolean;
  selectedPieceId?: string | null;
  onSelectPiece?: (id: string) => void;
  clip?: THREE.Plane[];
  exploded?: boolean;
  gap?: number;
  /** Desenha por cima de tudo (peças destacadas sobre o modo acabado). */
  overlay?: boolean;
  /** Wood frame: material de madeira (pinus, rugoso, sem metal) e tons de madeira no modo `role`. */
  wood?: boolean;
}

function roleLabel(p: Piece, wood = false) {
  return (wood ? WOOD_GROUP_LABELS : GROUP_LABELS)[ROLE_GROUP[p.role]];
}

interface BatchProps {
  batch: PieceBatch;
  material: THREE.Material;
  colors: (i: number, hovered: boolean) => THREE.Color;
  colorKey: unknown;
  hoverable: boolean;
  byId: Map<string, Piece>;
  onSelectPiece?: (id: string) => void;
  tooltip: (p: Piece, x: number, y: number) => void;
  overlay: boolean;
}

function BatchMesh({ batch, material, colors, colorKey, hoverable, byId, onSelectPiece, tooltip, overlay }: BatchProps) {
  const invalidate = useThree((s) => s.invalidate);
  const geometry = useMemo(() => profileGeometry(batch.profileId), [batch.profileId]);
  const [hot, setHot] = useState(-1);
  const n = batch.ids.length;

  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(geometry, material, n);
    (m.instanceMatrix.array as Float32Array).set(batch.matrices);
    m.instanceMatrix.needsUpdate = true;
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    m.castShadow = !overlay;
    m.receiveShadow = !overlay;
    m.renderOrder = overlay ? 30 : 0;
    m.computeBoundingSphere();
    return m;
  }, [geometry, material, batch, n, overlay]);

  useEffect(() => () => mesh.dispose(), [mesh]);

  useEffect(() => {
    const arr = mesh.instanceColor!.array as Float32Array;
    for (let i = 0; i < n; i++) colors(i, i === hot).toArray(arr, i * 3);
    mesh.instanceColor!.needsUpdate = true;
    invalidate();
    // `colors` muda de identidade a cada render; `colorKey` resume o que realmente importa
  }, [mesh, colorKey, hot, n, invalidate]);

  const handlers = hoverable
    ? {
        onPointerMove: (e: { instanceId?: number; stopPropagation: () => void; nativeEvent: PointerEvent }) => {
          e.stopPropagation();
          const i = e.instanceId ?? -1;
          setHot((h) => (h === i ? h : i));
          const p = byId.get(batch.ids[i] ?? '');
          if (p) tooltip(p, e.nativeEvent.clientX, e.nativeEvent.clientY);
          document.body.style.cursor = 'pointer';
        },
        onPointerOut: () => {
          setHot(-1);
          useSceneInfo.getState().setTooltip(null);
          document.body.style.cursor = '';
        },
        onClick: (e: { instanceId?: number; delta: number; stopPropagation: () => void }) => {
          if (e.delta > 4) return;
          e.stopPropagation();
          const id = batch.ids[e.instanceId ?? -1];
          if (id) onSelectPiece?.(id);
        },
      }
    : {};
  return <primitive object={mesh} {...handlers} />;
}

/**
 * Peças da estrutura com instancing: uma malha instanciada por (perfil, camada). Matrizes e cores são
 * calculadas por mudança de `pieces`/destaque, nunca por quadro.
 */
export function SkeletonView({
  pieces,
  colorBy,
  heat,
  highlight,
  hoverable = true,
  selectedPieceId,
  onSelectPiece,
  clip,
  exploded = false,
  gap = 2,
  overlay = false,
  wood = false,
}: SkeletonViewProps) {
  const batches = useMemo(() => buildPieceBatches(pieces), [pieces]);
  const byId = useMemo(() => new Map(pieces.map((p) => [p.id, p])), [pieces]);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: wood ? 0.85 : 0.5,
        metalness: wood ? 0 : 0.35,
        transparent: overlay,
        depthTest: !overlay,
        depthWrite: !overlay,
        side: THREE.DoubleSide,
      }),
    [overlay, wood],
  );
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    material.clippingPlanes = clip ?? null;
    material.needsUpdate = true;
  }, [material, clip]);

  const litPieces = useMemo(() => new Set(highlight?.pieceIds ?? []), [highlight]);
  const litHosts = useMemo(() => new Set(highlight?.hostIds ?? []), [highlight]);
  const hasHighlight = !!highlight && (litPieces.size > 0 || litHosts.size > 0);
  const batchByKey = useRef(new Map<string, PieceBatch>());
  batchByKey.current = new Map(batches.map((b) => [b.key, b]));

  const colorFor = (batch: PieceBatch) => (i: number, hovered: boolean): THREE.Color => {
    const id = batch.ids[i]!;
    const lit = litPieces.has(id) || litHosts.has(batch.hostIds[i]!) || id === selectedPieceId;
    if (hovered) return col('#ffffff');
    if (lit) return col(HIGHLIGHT);
    let base: THREE.Color;
    if (colorBy === 'heat') {
      const h = heat ? pieceHeat({ id, hostId: batch.hostIds[i]! }, heat) : null;
      base = col(heatColor(h?.ratio));
    } else base = col(roleColor(batch.roles[i]!, wood));
    if (hasHighlight) return base.clone().lerp(FADE_TO, 0.78);
    return base;
  };

  const tooltip = (p: Piece, x: number, y: number) => {
    const lines: string[] = [`${p.profileId} · ${p.length.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m`];
    if (colorBy === 'heat' && heat) {
      const h = pieceHeat(p, heat);
      if (h) {
        lines.push(h.check.label);
        lines.push(`Taxa de uso: ${Math.round(h.ratio * 100)}%`);
      } else lines.push('Sem verificação estrutural');
    } else lines.push(`Host: ${p.hostId}`);
    useSceneInfo.getState().setTooltip({ x, y, title: roleLabel(p, wood), lines });
  };

  useEffect(() => () => useSceneInfo.getState().setTooltip(null), []);

  const colorKey = useMemo(() => ({}), [colorBy, heat, highlight, selectedPieceId, wood]);
  return (
    <>
      {batches.map((b) => (
        <ExplodeGroup key={b.key} layer={b.layer === 'roof' ? 'roof' : 'structure'} active={exploded} gap={gap}>
          <BatchMesh
            batch={b}
            material={material}
            colors={colorFor(b)}
            colorKey={colorKey}
            hoverable={hoverable}
            byId={byId}
            onSelectPiece={onSelectPiece}
            tooltip={tooltip}
            overlay={overlay}
          />
        </ExplodeGroup>
      ))}
    </>
  );
}
