'use client';
import { useCallback, useEffect, useImperativeHandle, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import type { ThreeBounds } from '@/lib/three/convert';
import { orthoZoom, presetToCameraView, viewSpec } from '@/lib/three/views';
import { useEditor } from '@/lib/store/editor';
import type { CameraView } from '@/lib/store/types';
import type { ViewportHandle } from './types';

type Controls = React.ComponentRef<typeof OrbitControls>;

interface Pose {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  zoom: number;
}

export interface CameraRigProps {
  bounds: ThreeBounds;
  view: CameraView;
  /** Altura extra do conjunto (modo explodido) para o enquadramento. */
  extraHeight?: number;
  /** Ferramentas de desenho usam o botão esquerdo: o arraste da câmera fica no direito/meio. */
  leftDrags: boolean;
  apiRef?: RefObject<ViewportHandle | null>;
}

/**
 * Câmera do editor: perspectiva orbital (3D) e ortográficas (planta e fachadas), com transição suave.
 * Trocar entre perspectiva e ortográfica troca a câmera padrão, partindo da pose anterior.
 */
export function CameraRig({ bounds, view, extraHeight = 0, leftDrags, apiRef }: CameraRigProps) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useRef<Controls>(null);
  const spec = viewSpec(view);
  const goal = useRef<Pose & { active: boolean }>({ pos: new THREE.Vector3(), look: new THREE.Vector3(), zoom: 1, active: false });
  const last = useRef<Pose | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  const compute = useCallback(
    (v: CameraView): Pose => {
      const s = viewSpec(v);
      const dir = new THREE.Vector3(...s.dir).normalize();
      const look = new THREE.Vector3(...bounds.center);
      const h = extraHeight;
      if (!s.ortho) {
        const persp = camera as THREE.PerspectiveCamera;
        const fov = THREE.MathUtils.degToRad(persp.fov ?? 35);
        const aspect = size.width / Math.max(1, size.height);
        let dist = ((bounds.radius + h * 0.5) / Math.sin(fov / 2)) * 0.88;
        dist /= Math.min(1, aspect * 0.85);
        look.y -= bounds.size[1] * 0.08;
        look.y += h * 0.4;
        return { pos: look.clone().add(dir.multiplyScalar(dist)), look, zoom: 1 };
      }
      const sizeBox: [number, number, number] = [bounds.size[0], bounds.size[1] + h, bounds.size[2]];
      look.y += h / 2;
      const dist = Math.max(50, bounds.radius * 4 + 30);
      return { pos: look.clone().add(dir.multiplyScalar(dist)), look, zoom: orthoZoom(sizeBox, v, size) };
    },
    [bounds, camera, size, extraHeight],
  );

  const apply = useCallback(
    (pose: Pose, animate: boolean) => {
      const g = goal.current;
      g.pos.copy(pose.pos);
      g.look.copy(pose.look);
      g.zoom = pose.zoom;
      if (animate) {
        g.active = true;
        invalidate();
      } else {
        camera.position.copy(pose.pos);
        if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
          (camera as THREE.OrthographicCamera).zoom = pose.zoom;
          camera.updateProjectionMatrix();
        }
        controls.current?.target.copy(pose.look);
        controls.current?.update();
        g.active = false;
        invalidate();
      }
    },
    [camera, invalidate],
  );

  // Mudança de vista (ou de câmera): parte da pose anterior e anima até a nova.
  const placed = useRef(false);
  useEffect(() => {
    const pose = compute(view);
    const prev = last.current;
    if (!placed.current || !prev) {
      if (!controls.current) return;
      placed.current = true;
      apply(pose, false);
      return;
    }
    // mantém a posição/alvo anteriores como ponto de partida na câmera recém-montada
    camera.position.copy(prev.pos);
    controls.current?.target.copy(prev.look);
    if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
      // zoom equivalente ao enquadramento da perspectiva anterior
      const d = prev.pos.distanceTo(prev.look);
      const fov = THREE.MathUtils.degToRad(35);
      (camera as THREE.OrthographicCamera).zoom = prev.zoom > 1 ? prev.zoom : size.height / Math.max(0.5, 2 * d * Math.tan(fov / 2));
      camera.updateProjectionMatrix();
    }
    controls.current?.update();
    apply(pose, true);
  }, [view, camera, extraHeight]);

  useImperativeHandle(
    apiRef,
    (): ViewportHandle => ({
      center: () => apply(compute(viewRef.current), true),
      setView: (p) => {
        const v = presetToCameraView(p);
        if (useEditor.getState().cameraView === v) apply(compute(v), true);
        else useEditor.getState().setCameraView(v);
      },
    }),
    [apply, compute],
  );

  const setControls = useCallback(
    (c: Controls | null) => {
      controls.current = c;
      if (!c) return;
      c.addEventListener('start', () => {
        goal.current.active = false;
      });
      if (!placed.current) {
        placed.current = true;
        apply(compute(viewRef.current), false);
      }
    },
    [apply, compute],
  );

  useFrame((_, dt) => {
    const c = controls.current;
    if (c) {
      const l = (last.current ??= { pos: new THREE.Vector3(), look: new THREE.Vector3(), zoom: 1 });
      l.pos.copy(camera.position);
      l.look.copy(c.target);
      l.zoom = (camera as THREE.OrthographicCamera).zoom ?? 1;
    }
    const g = goal.current;
    if (!g.active || !c) return;
    const k = 1 - Math.exp(-8 * Math.min(dt, 0.05));
    camera.position.lerp(g.pos, k);
    c.target.lerp(g.look, k);
    let zoomDone = true;
    if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
      const oc = camera as THREE.OrthographicCamera;
      // zoom interpolado em escala logarítmica: aproxima e afasta com a mesma velocidade
      oc.zoom = Math.exp(Math.log(oc.zoom) + (Math.log(g.zoom) - Math.log(oc.zoom)) * k);
      oc.updateProjectionMatrix();
      zoomDone = Math.abs(Math.log(oc.zoom / g.zoom)) < 0.002;
    }
    c.update();
    if (zoomDone && camera.position.distanceTo(g.pos) < 0.01 && c.target.distanceTo(g.look) < 0.01) {
      g.active = false;
      camera.position.copy(g.pos);
      c.target.copy(g.look);
      c.update();
    }
    invalidate();
  });

  const ortho = spec.ortho;
  return (
    <>
      {ortho ? (
        <OrthographicCamera key="ortho" makeDefault near={0.1} far={bounds.radius * 12 + 400} zoom={1} position={[0, 50, 0.01]} />
      ) : (
        <PerspectiveCamera key="persp" makeDefault fov={35} near={0.1} far={600} position={[12, 9, 12]} />
      )}
      <OrbitControls
        key={ortho ? 'orbit-ortho' : 'orbit-persp'}
        ref={setControls}
        makeDefault
        enableDamping
        dampingFactor={0.09}
        enableRotate={!ortho}
        maxPolarAngle={Math.PI / 2 - 0.02}
        minDistance={1.5}
        maxDistance={Math.max(30, bounds.radius * 8)}
        minZoom={2}
        maxZoom={600}
        screenSpacePanning
        zoomToCursor
        mouseButtons={{
          LEFT: (ortho ? (leftDrags ? THREE.MOUSE.PAN : undefined) : THREE.MOUSE.ROTATE) as THREE.MOUSE,
          MIDDLE: ortho ? THREE.MOUSE.PAN : THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        }}
      />
    </>
  );
}
