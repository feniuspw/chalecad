import type { ReactNode } from 'react';

/** Referencial do motor (z para cima) dentro da cena y-up: ver `lib/three/convert.ts`. */
export function MotorGroup({ children, position }: { children: ReactNode; position?: [number, number, number] }) {
  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={position}>
      {children}
    </group>
  );
}
