'use client';
import { useEffect, useMemo, type RefObject } from 'react';
import { ContactShadows, Grid } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { BuildingModel } from '@chalecad/engine';
import type { ThreeBounds } from '@/lib/three/convert';
import { buildHeatIndex } from '@/lib/three/heatmap';
import { plateauRect } from '@/lib/three/terrain';
import { explodeGap } from '@/lib/three/views';
import { selectionFromHost } from '@/lib/project/selection';
import { useEditor } from '@/lib/store/editor';
import type { Selection } from '@/lib/store/types';
import { BuildingView } from './BuildingView';
import { CameraRig } from './CameraRig';
import { ExtrasView } from './ExtrasView';
import { FinishesView } from './FinishesView';
import { useFurnitureAlertLevels, useFurnitureModels } from './furnitureData';
import { FurnitureView } from './FurnitureView';
import { InstallationsView } from './InstallationsView';
import { MotorGroup } from './MotorGroup';
import { PresentationFx } from './PresentationFx';
import { PresentationLights } from './PresentationLights';
import { usePresentationUi } from './presentationUi';
import { WalkRig } from './WalkRig';
import { planClipPlane, PlanOverlay } from './PlanOverlay';
import { useSceneInfo } from './sceneInfo';
import { SkeletonView } from './SkeletonView';
import { TerrainView } from './TerrainView';
import { MeasurementsLayer } from './tools/MeasureTool';
import { PathDrawLayer } from './tools/PathDrawLayer';
import { envFloorZ, FurnitureDropTarget, FurnitureGhostLayer } from './tools/FurnitureTool';
import { useToolEnv } from './tools/env';
import { ToolLayer } from './tools/ToolLayer';
import type { ViewportHandle } from './types';

/** Hospedeiros acesos pela seleção atual (abertura é tratada à parte: acende só o vão). */
function selectedHostIds(sel: Selection | null): string[] {
  if (!sel) return [];
  switch (sel.kind) {
    case 'host':
    case 'wall':
    case 'roof':
    case 'slab':
    case 'stair':
      return [sel.id];
    case 'level':
      return [`slab-${sel.id}`];
    default:
      return [];
  }
}

export interface EditorSceneProps {
  model: BuildingModel;
  bounds: ThreeBounds;
  apiRef?: RefObject<ViewportHandle | null>;
  /** Chave que muda quando a geometria muda (reassenta sombras de contato). */
  signature: string;
}

/** Cena do editor: tudo reage ao store (ferramenta, vista, modo, nível ativo, seleção, destaque, resultados). */
const NO_CLIP: THREE.Plane[] = [];
const NO_HOSTS = { hostIds: [] as string[] };
const NO_IDS: string[] = [];
/** Plano distante da apresentação: o céu (drei Sky, caixa de 1000 m) precisa caber no frustum. */
const PRESENTATION_FAR = 1000;

export function EditorScene({ model, bounds, apiRef, signature }: EditorSceneProps) {
  const results = useEditor((s) => s.results);
  const project = useEditor((s) => s.project);
  const viewMode = useEditor((s) => s.viewMode);
  const cameraView = useEditor((s) => s.cameraView);
  const activeLevelId = useEditor((s) => s.activeLevelId);
  const tool = useEditor((s) => s.tool);
  const selection = useEditor((s) => s.selection);
  const hoverId = useEditor((s) => s.hoverId);
  const highlight = useEditor((s) => s.highlight);
  const select = useEditor((s) => s.select);
  const setHover = useEditor((s) => s.setHover);
  const walkOn = useEditor((s) => s.walk);
  const gl = useThree((s) => s.gl);
  const presentationInstallations = usePresentationUi((s) => s.installations);

  const presentation = viewMode === 'presentation';
  const walking = presentation && walkOn;
  const exploded = viewMode === 'exploded';
  const structural = viewMode === 'skeleton' || viewMode === 'heatmap';
  const gap = explodeGap(model.ridgeHeight);
  const plan = cameraView === 'plan' && !presentation;
  // apresentação não tem planta: volta para o 3D
  const view = presentation && cameraView === 'plan' ? '3d' : cameraView;
  const elevation = project.levels.find((l) => l.id === activeLevelId)?.elevation ?? 0;
  // lista vazia (não undefined) ao sair da planta: o R3F não limpa a prop quando ela vira undefined e o corte ficava preso
  const clip = useMemo(() => (plan ? [planClipPlane(elevation)] : NO_CLIP), [plan, elevation]);
  const pieces = results?.pieces;
  const terrain = results?.terrain ?? null;
  const extras = model.extras;
  const furniture = project.furniture;
  const furnitureModels = useFurnitureModels();
  const furnitureAlerts = useFurnitureAlertLevels();
  const toolEnv = useToolEnv(model);
  const installationsReport = project.installations.enabled ? (results?.installations ?? null) : null;
  const showInstallations = !!installationsReport && !plan && !structural && (presentation ? presentationInstallations && !walking : true);
  const levelElevations = useMemo(() => Object.fromEntries(project.levels.map((l) => [l.id, l.elevation])), [project.levels]);
  const showFurniture = furniture.length > 0 && !plan && (viewMode === 'finished' || viewMode === 'presentation' || exploded);

  useEffect(() => {
    gl.localClippingEnabled = true;
    // gancho de depuração/e2e (só fora de produção): window.__editor.getState().setViewMode('skeleton')
    if (process.env.NODE_ENV !== 'production') {
      const w = window as unknown as { __editor?: typeof useEditor; __sceneInfo?: typeof useSceneInfo };
      w.__editor = useEditor;
      w.__sceneInfo = useSceneInfo;
    }
  }, [gl]);

  // Cursor do canvas: mira nas ferramentas de desenho.
  useEffect(() => {
    gl.domElement.style.cursor = tool === 'select' || tool === 'dimension' ? '' : 'crosshair';
    return () => {
      gl.domElement.style.cursor = '';
    };
  }, [gl, tool]);

  const heat = useMemo(() => buildHeatIndex(results?.structure?.checks), [results?.structure]);

  const hasHighlight = !presentation && !!highlight && (highlight.pieceIds.length > 0 || highlight.hostIds.length > 0);
  const litHosts = useMemo(() => ({ hostIds: [...new Set([...(highlight?.hostIds ?? []), ...selectedHostIds(selection)])] }), [highlight, selection]);
  const extraHighlight = useMemo(() => [...(highlight?.hostIds ?? []), ...(selection?.kind === 'extra' ? [selection.id] : [])], [highlight, selection]);

  // Destaque só de peças no modo acabado: desenha as peças por cima e esmaece o resto.
  const overlayPieces = useMemo(() => {
    if (viewMode !== 'finished' || !highlight || !pieces || highlight.pieceIds.length === 0) return null;
    const ids = new Set(highlight.pieceIds);
    return pieces.filter((p) => ids.has(p.id));
  }, [viewMode, highlight, pieces]);

  const setNotice = useSceneInfo((s) => s.setNotice);
  useEffect(() => {
    if (overlayPieces) setNotice('Mostrando estrutura destacada');
    else if (viewMode === 'heatmap' && !results?.structure) setNotice('Sem verificação estrutural calculada para colorir');
    else if ((viewMode === 'skeleton' || viewMode === 'heatmap') && (!pieces || pieces.length === 0)) setNotice('Sem peças calculadas');
    else setNotice(null);
    return () => setNotice(null);
  }, [overlayPieces, viewMode, results?.structure, pieces, setNotice]);

  const selectingEnabled = tool === 'select' && !presentation;
  const selectedOpeningId = selection?.kind === 'opening' ? selection.id : null;
  const selectedPieceId = selection?.kind === 'piece' ? selection.id : null;

  const plateau = useMemo(() => {
    if (!terrain || project.site.type !== 'sloped') return undefined;
    const xs = model.footprint.map((p) => p[0]);
    const ys = model.footprint.map((p) => p[1]);
    return plateauRect({ min: [Math.min(...xs), Math.min(...ys)], max: [Math.max(...xs), Math.max(...ys)] }, project.site.platformMargin);
  }, [terrain, project.site, model.footprint]);

  return (
    <>
      {walking ? (
        <WalkRig model={model} levelId={activeLevelId} far={PRESENTATION_FAR} />
      ) : (
        <CameraRig bounds={bounds} view={view} extraHeight={exploded ? gap * 3 : 0} leftDrags={tool === 'select'} apiRef={apiRef} far={presentation ? PRESENTATION_FAR : undefined} />
      )}
      {presentation ? (
        <>
          <PresentationLights model={model} bounds={bounds} hasTerrain={!!terrain} />
          <PresentationFx />
        </>
      ) : (
        <>
          <Lights bounds={bounds} shadows={!plan} />
          <Ground bounds={bounds} signature={signature} hasTerrain={!!terrain} plan={plan} planY={elevation} />
        </>
      )}

      {terrain ? <TerrainView terrain={terrain} plateau={presentation ? undefined : plateau} /> : null}

      <BuildingView
        model={model}
        mode={presentation ? 'finished' : viewMode}
        plain={presentation}
        clip={clip}
        hideRoof={plan}
        fadeOthers={hasHighlight && !structural}
        highlight={presentation ? NO_HOSTS : litHosts}
        hoverable={selectingEnabled}
        hoverId={hoverId}
        onHoverHost={setHover}
        onSelectHost={(id) => select(selectionFromHost(id, model, project))}
        selectedOpeningId={presentation ? null : selectedOpeningId}
        onSelectOpening={(id) => select({ kind: 'opening', id })}
        finishes={project.finishes}
      />

      {!plan && (model.rooms.length > 0 || project.finishes.interiorRoof) ? (
        <MotorGroup>
          <FinishesView
            model={model}
            rooms={project.rooms}
            finishes={project.finishes}
            mode={presentation ? 'finished' : viewMode}
            clip={clip}
            hoverable={selectingEnabled}
            selectedRoomId={!presentation && selection?.kind === 'room' ? selection.id : null}
            onSelectRoom={(id) => select({ kind: 'room', id })}
          />
        </MotorGroup>
      ) : null}

      {(structural || exploded) && pieces && pieces.length > 0 ? (
        <MotorGroup>
          <SkeletonView
            pieces={pieces}
            colorBy={viewMode === 'heatmap' ? 'heat' : 'role'}
            heat={heat}
            highlight={highlight}
            hoverable={selectingEnabled}
            selectedPieceId={selectedPieceId}
            onSelectPiece={(id) => select({ kind: 'piece', id })}
            clip={clip}
            exploded={exploded}
            gap={gap}
            wood={project.system.structure === 'wood'}
          />
        </MotorGroup>
      ) : null}
      {overlayPieces ? (
        <MotorGroup>
          <SkeletonView pieces={overlayPieces} colorBy="role" highlight={highlight} hoverable={false} overlay wood={project.system.structure === 'wood'} />
        </MotorGroup>
      ) : null}

      {extras.length > 0 ? (
        <MotorGroup>
          <ExtrasView
            extras={extras}
            selectedId={!presentation && selection?.kind === 'extra' ? selection.id : null}
            highlightIds={presentation ? NO_IDS : extraHighlight}
            hoverable={selectingEnabled}
            plain={presentation}
            onSelect={(id) => select({ kind: 'extra', id })}
          />
        </MotorGroup>
      ) : null}

      {showFurniture ? (
        <FurnitureView
          models={furnitureModels}
          furniture={furniture}
          walls={model.walls}
          selectedId={selection?.kind === 'furniture' ? selection.id : null}
          alerts={furnitureAlerts}
          interactive={selectingEnabled}
          exploded={exploded}
          ridgeHeight={model.ridgeHeight}
        />
      ) : null}

      {showInstallations && installationsReport ? (
        <MotorGroup>
          <InstallationsView model={model} report={installationsReport} elevations={levelElevations} exploded={exploded} interactive={selectingEnabled} />
        </MotorGroup>
      ) : null}

      {plan ? <PlanOverlay model={model} level={activeLevelId} elevation={elevation} /> : null}
      {presentation ? null : (
        <>
          <MeasurementsLayer />
          <ToolLayer model={model} />
          <FurnitureDropTarget env={toolEnv} />
          <FurnitureGhostLayer z={envFloorZ(toolEnv)} />
          <PathDrawLayer model={model} />
        </>
      )}
    </>
  );
}

function Lights({ bounds, shadows }: { bounds: ThreeBounds; shadows: boolean }) {
  const r = Math.max(bounds.radius, 3);
  const pos: [number, number, number] = [bounds.center[0] + r * 1.1, bounds.center[1] + r * 1.9, bounds.center[2] + r * 0.9];
  return (
    <>
      <hemisphereLight args={['#e3eefa', '#d8d0c2', 1.4]} />
      <directionalLight
        position={pos}
        intensity={2.3}
        color="#fff3e0"
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.03}
        shadow-radius={4}
        shadow-camera-left={-r * 1.5}
        shadow-camera-right={r * 1.5}
        shadow-camera-top={r * 1.5}
        shadow-camera-bottom={-r * 1.5}
        shadow-camera-near={0.5}
        shadow-camera-far={r * 8}
        target-position={bounds.center}
      />
    </>
  );
}

function Ground({ bounds, signature, hasTerrain, plan, planY }: { bounds: ThreeBounds; signature: string; hasTerrain: boolean; plan: boolean; planY: number }) {
  const y = bounds.min[1];
  const span = Math.max(bounds.size[0], bounds.size[2]);
  const gridY = plan ? planY + 0.004 : hasTerrain ? y - 6 : y;
  return (
    <>
      {!hasTerrain || plan ? (
        <Grid
          position={[0, gridY, 0]}
          infiniteGrid
          cellSize={0.1}
          cellThickness={plan ? 0.7 : 0.5}
          cellColor={plan ? '#cfcac3' : '#d6d3d1'}
          sectionSize={1}
          sectionThickness={plan ? 1.4 : 1.1}
          sectionColor="#a8a29e"
          fadeDistance={plan ? Math.max(120, span * 12) : Math.max(28, span * 3.2)}
          fadeStrength={plan ? 0.6 : 1.6}
          fadeFrom={1}
          side={THREE.DoubleSide}
        />
      ) : null}
      {hasTerrain ? null : (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y + 0.002, 0]} receiveShadow renderOrder={1}>
          <planeGeometry args={[span * 6, span * 6]} />
          <shadowMaterial opacity={0.16} transparent depthWrite={false} />
        </mesh>
      )}
      {hasTerrain ? null : (
        <ContactShadows
          key={signature}
          position={[bounds.center[0], y + 0.004, bounds.center[2]]}
          scale={span * 2}
          width={span * 2}
          height={span * 2}
          far={2.5}
          blur={2.6}
          opacity={0.4}
          resolution={1024}
          frames={1}
          color="#3b2f20"
        />
      )}
    </>
  );
}
