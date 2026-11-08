'use client';
import { useLayoutEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { setSceneActive, usePrepStatus } from '@/lib/three/presentationPrep';

/** Dentro do canvas da apresentação: marca a cena como montada e tira o "Montando a cena…" após alguns quadros. */
export function SceneMountProbe() {
  const frames = useRef(0);
  useLayoutEffect(() => {
    setSceneActive(true);
    usePrepStatus.setState({ mounting: true });
    const t = setTimeout(() => usePrepStatus.setState({ mounting: false }), 8000);
    return () => {
      clearTimeout(t);
      setSceneActive(false);
      usePrepStatus.setState({ mounting: false });
    };
  }, []);
  useFrame(() => {
    if (++frames.current === 3) usePrepStatus.setState({ mounting: false });
  });
  return null;
}
