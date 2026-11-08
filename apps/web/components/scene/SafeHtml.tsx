'use client';
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export interface SafeHtmlProps {
  position: [number, number, number];
  children: ReactNode;
  /** Centraliza o conteúdo no ponto (senão o canto superior esquerdo fica no ponto). */
  center?: boolean;
  /** [maior, menor]: só o primeiro é usado, como z-index fixo. */
  zIndexRange?: [number, number];
  style?: CSSProperties;
}

const v = new THREE.Vector3();

/**
 * Conteúdo HTML ancorado num ponto da cena, no lugar do `<Html>` do drei. O do drei desmonta a raiz React de forma
 * síncrona dentro do commit do R3F, o que no React 19 dispara "synchronously unmount a root" e às vezes um
 * `removeChild` não tratado ao trocar de modo. Aqui cada montagem cria o seu elemento e a sua raiz, a desmontagem
 * fica para depois do commit (microtarefa) e o posicionamento é feito no `useFrame`, sem re-render.
 */
export function SafeHtml({ position, children, center = false, zIndexRange, style }: SafeHtmlProps) {
  const group = useRef<THREE.Group>(null);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const mount = useRef<{ el: HTMLDivElement; root: Root } | null>(null);
  const z = zIndexRange?.[0] ?? 0;

  useLayoutEffect(() => {
    const target = gl.domElement.parentNode;
    if (!target) return;
    const el = document.createElement('div');
    Object.assign(el.style, { position: 'absolute', top: '0', left: '0', zIndex: String(z), willChange: 'transform', display: 'none' });
    target.appendChild(el);
    const m = { el, root: createRoot(el) };
    mount.current = m;
    return () => {
      if (mount.current === m) mount.current = null;
      queueMicrotask(() => {
        m.root.unmount();
        m.el.remove();
      });
    };
  }, [gl, z]);

  useLayoutEffect(() => {
    mount.current?.root.render(
      <div style={{ transform: center ? 'translate(-50%, -50%)' : undefined }}>
        <div style={style}>{children}</div>
      </div>,
    );
  });

  useFrame(() => {
    const m = mount.current;
    if (!m || !group.current) return;
    group.current.getWorldPosition(v);
    v.project(camera);
    if (v.z > 1 || v.z < -1) {
      m.el.style.display = 'none';
      return;
    }
    m.el.style.display = '';
    m.el.style.transform = `translate3d(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px, 0)`;
  });

  return <group ref={group} position={position} />;
}
