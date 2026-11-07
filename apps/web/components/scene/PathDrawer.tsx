'use client';
import { useEffect, useRef } from 'react';
import type { Vec2 } from '@chalecad/engine';
import { useSceneInfo } from './sceneInfo';

export interface PathDrawerProps {
  /** Liga o desenho de caminho em planta (a vista muda para Planta se estiver numa fachada). */
  active: boolean;
  /** Caminho concluído (metros, planta) e se foi fechado clicando no primeiro ponto. */
  onComplete: (path: Vec2[], closed: boolean) => void;
  onCancel: () => void;
}

/**
 * Controle de desenho de caminhos (cerca, muro) para o orquestrador ligar a botões do painel. Não renderiza
 * nada: registra o pedido e a cena (dentro do canvas) desenha o caminho com snap, rótulos de comprimento e dicas.
 * Enter ou duplo clique conclui aberto; clicar no primeiro ponto fecha; Backspace volta um ponto; Esc cancela.
 */
export function PathDrawer({ active, onComplete, onCancel }: PathDrawerProps) {
  const complete = useRef(onComplete);
  const cancel = useRef(onCancel);
  complete.current = onComplete;
  cancel.current = onCancel;
  useEffect(() => {
    if (!active) return;
    useSceneInfo.getState().setPathDraw({
      onComplete: (p, c) => complete.current(p, c),
      onCancel: () => cancel.current(),
    });
    return () => useSceneInfo.getState().setPathDraw(null);
  }, [active]);
  return null;
}
