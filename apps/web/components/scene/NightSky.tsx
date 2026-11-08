'use client';
import { useEffect, useMemo, useRef } from 'react';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** 0 com o sol a partir de +2 graus (dia/crepúsculo), 1 abaixo de -4 graus (noite), suave entre os dois. */
export function nightAmount(elevationDeg: number): number {
  const t = clamp01((2 - elevationDeg) / 6);
  return t * t * (3 - 2 * t);
}

const DOME_RADIUS = 700;

/** Cúpula azul-noite com gradiente (horizonte mais claro) e vertex colors; sem textura nem arquivo. */
function makeDomeGeometry() {
  const g = new THREE.SphereGeometry(DOME_RADIUS, 32, 16);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const horizon = new THREE.Color('#1b2a55');
  const zenith = new THREE.Color('#050a1c');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = clamp01(pos.getY(i) / DOME_RADIUS);
    c.copy(horizon).lerp(zenith, Math.sqrt(h));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/**
 * Céu noturno: cúpula azul-noite e estrelas (drei `Stars`, procedural). `amount` (0 a 1, ver `nightAmount`) controla a
 * opacidade da cúpula e a das estrelas, para o crepúsculo entrar e sair sem pulo.
 */
export function NightSky({ amount }: { amount: number }) {
  const dome = useMemo(makeDomeGeometry, []);
  useEffect(() => () => dome.dispose(), [dome]);
  const stars = useRef<THREE.Points>(null);

  // o material das estrelas não tem opacidade global: acrescenta um uniform ao fragment shader (uma vez)
  useEffect(() => {
    const m = stars.current?.material as THREE.ShaderMaterial | undefined;
    if (!m) return;
    if (!m.uniforms.globalOpacity) {
      m.uniforms.globalOpacity = { value: amount };
      m.fragmentShader = m.fragmentShader.replace('uniform float fade;', 'uniform float fade;\nuniform float globalOpacity;').replace('vec4(vColor, opacity)', 'vec4(vColor, opacity * globalOpacity)');
      m.transparent = true;
      m.depthWrite = false;
      m.needsUpdate = true;
    }
    m.uniforms.globalOpacity.value = amount;
  }, [amount]);

  if (amount <= 0.001) return null;
  return (
    <>
      <mesh geometry={dome} renderOrder={-2} raycast={() => null}>
        <meshBasicMaterial vertexColors side={THREE.BackSide} transparent opacity={amount} depthWrite={false} fog={false} />
      </mesh>
      <Stars ref={stars} radius={300} depth={60} count={4000} factor={5} saturation={0.2} fade speed={0.6} />
    </>
  );
}
