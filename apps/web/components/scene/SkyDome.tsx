'use client';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mixHex } from '@/lib/sun';
import type { Vec3 } from '@/lib/three/shadow';

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-9)));
  return t * t * (3 - 2 * t);
};

const VERTEX = `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // sempre no plano distante
}`;

const FRAGMENT = `
varying vec3 vDir;
uniform vec3 uSun;
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uWarm;
uniform float uGlow;
uniform float uDisc;
void main() {
  vec3 d = normalize( vDir );
  float h = clamp( d.y, 0.0, 1.0 );
  vec3 col = mix( uHorizon, uZenith, pow( h, 0.42 ) );
  if ( d.y < 0.0 ) col = uHorizon;
  float s = max( dot( d, uSun ), 0.0 );
  col += uWarm * ( pow( s, 5.0 ) * 0.45 + pow( s, 40.0 ) * 1.1 ) * uGlow * ( 1.0 - 0.6 * h );
  col += vec3( 1.0, 0.94, 0.82 ) * smoothstep( 0.99935, 0.99985, s ) * uDisc;
  gl_FragColor = vec4( col, 1.0 );
}`;

export interface SkyDomeProps {
  /** Direção do sol na cena (y para cima), unitária. */
  sunDir: Vec3;
  elevationDeg: number;
  /** Mesma cor da névoa: o horizonte some na bruma sem emenda. */
  horizon: string;
}

/**
 * Céu em degradê (zênite → horizonte) com brilho quente em volta do sol e disco solar em HDR (alimenta o bloom).
 * O horizonte usa a cor da névoa, então morros distantes e céu se encontram sem faixa.
 */
export function SkyDome({ sunDir, elevationDeg, horizon }: SkyDomeProps) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uSun: { value: new THREE.Vector3(0, 1, 0) },
          uHorizon: { value: new THREE.Color() },
          uZenith: { value: new THREE.Color() },
          uWarm: { value: new THREE.Color() },
          uGlow: { value: 1 },
          uDisc: { value: 0 },
        },
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  const e = elevationDeg;
  const u = material.uniforms as Record<string, THREE.IUniform>;
  u.uSun!.value.set(...sunDir).normalize();
  u.uHorizon!.value.set(horizon);
  u.uZenith!.value.set(mixHex('#16224a', '#3f78c4', smooth(-4, 28, e)));
  u.uWarm!.value.set(mixHex('#ff8a3d', '#fff0d2', smooth(0, 30, e)));
  u.uGlow!.value = 0.35 + 0.95 * (1 - smooth(4, 38, e));
  u.uDisc!.value = e > -1.5 ? 26 * smooth(-1.5, 2, e) : 0;
  return (
    <mesh material={material} renderOrder={-4} frustumCulled={false} raycast={() => null}>
      <sphereGeometry args={[800, 32, 16]} />
    </mesh>
  );
}
