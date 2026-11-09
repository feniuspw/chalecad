/**
 * Elétrica desenhada na planta: ferramentas da paleta, rótulos e cores (puro, sem React nem three).
 * Alturas e potências vêm do catálogo (`constants.electrical`); aqui só a semântica da interface.
 */
import type { ElecPoint } from '@chalecad/engine';

/** Ferramenta ativa da paleta ("none" = selecionar e arrastar símbolos). */
export type ElecToolId = 'none' | 'socket' | 'socket_mid' | 'socket_high' | 'socket_tue' | 'switch' | 'light' | 'panel' | 'conduit';

export interface ElecToolDef {
  id: Exclude<ElecToolId, 'none'>;
  label: string;
  /** Explicação curta para o tooltip. */
  hint: string;
}

export const ELEC_TOOLS: readonly ElecToolDef[] = [
  { id: 'socket', label: 'Tomada', hint: 'Tomada baixa (0,30 m). Clique perto de uma parede.' },
  { id: 'socket_mid', label: 'Tomada média', hint: 'Tomada a 1,10 m (bancada, lavatório). Clique perto de uma parede.' },
  { id: 'socket_high', label: 'Tomada alta', hint: 'Tomada a 2,20 m (ar-condicionado, TV). Clique perto de uma parede.' },
  { id: 'socket_tue', label: 'Uso específico', hint: 'Tomada de uso específico (chuveiro, forno, ar-condicionado...). Escolha o aparelho.' },
  { id: 'switch', label: 'Interruptor', hint: 'Interruptor simples ou paralelo, a 1,10 m. Clique perto de uma parede.' },
  { id: 'light', label: 'Luz', hint: 'Clique dentro do cômodo para luz no teto, ou perto da parede para arandela. Shift = grade automática.' },
  { id: 'panel', label: 'Quadro', hint: 'Quadro de distribuição, a 1,50 m. Clique perto de uma parede.' },
  { id: 'conduit', label: 'Eletroduto', hint: 'Clique ponto a ponto. Encaixa em pontos, no quadro e em outros eletrodutos. Duplo clique ou Enter conclui.' },
] as const;

export const TOOL_LABEL: Record<string, string> = Object.fromEntries(ELEC_TOOLS.map((t) => [t.id, t.label]));

/** Categoria visual (símbolo) de um ponto. */
export type SymbolKind = 'socket_low' | 'socket_mid' | 'socket_high' | 'tue' | 'switch_one' | 'switch_two' | 'light_ceiling' | 'light_wall' | 'data' | 'panel';

/** Tomada baixa, média ou alta pela altura da caixa (NBR 5444: triângulo vazado, meio cheio, cheio). */
export function socketLevel(p: Pick<ElecPoint, 'kind' | 'height'>): 'low' | 'mid' | 'high' {
  if (p.kind === 'socket_high' || p.height >= 1.6) return 'high';
  if (p.height >= 0.6) return 'mid';
  return 'low';
}

export function symbolKind(p: ElecPoint): SymbolKind {
  switch (p.kind) {
    case 'socket':
    case 'socket_high':
      return `socket_${socketLevel(p)}`;
    case 'socket_tue':
      return 'tue';
    case 'switch':
      return p.switchType && p.switchType !== 'one_way' ? 'switch_two' : 'switch_one';
    case 'light':
      return p.hostId ? 'light_wall' : 'light_ceiling';
    case 'data':
      return 'data';
  }
}

export const POINT_KIND_LABEL: Record<ElecPoint['kind'], string> = {
  socket: 'Tomada',
  socket_high: 'Tomada alta',
  socket_tue: 'Tomada de uso específico',
  switch: 'Interruptor',
  light: 'Ponto de luz',
  data: 'Dados / TV',
};

export const SWITCH_TYPE_LABEL: Record<NonNullable<ElecPoint['switchType']>, string> = {
  one_way: 'Simples',
  two_way: 'Paralelo',
  intermediate: 'Intermediário',
  dimmer: 'Dimmer',
};

export const CIRCUIT_KIND_LABEL = {
  lighting: 'Iluminação',
  sockets: 'Tomadas',
  wet_sockets: 'Tomadas de áreas molhadas',
  tue: 'Uso específico',
} as const;

/** Tipos de circuito que aceitam o ponto (a mistura gera aviso do motor). */
export function circuitKindsFor(kind: ElecPoint['kind']): (keyof typeof CIRCUIT_KIND_LABEL)[] {
  switch (kind) {
    case 'light':
    case 'switch':
      return ['lighting'];
    case 'socket':
    case 'socket_high':
    case 'data':
      return ['sockets', 'wet_sockets'];
    case 'socket_tue':
      return ['tue'];
  }
}

/** Paleta de cores por circuito (distintas entre si e legíveis sobre o piso claro). */
export const CIRCUIT_COLORS = ['#dc2626', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#0d9488', '#9333ea', '#ca8a04'] as const;
export const NO_CIRCUIT_COLOR = '#44403c';
export const CONDUIT_COLOR = '#57534e';
export const CONTROL_COLOR = '#2563eb';
export const SELECT_COLOR = '#f59e0b';
export const ALERT_COLOR = '#dc2626';

export const circuitColor = (index: number): string => (index < 0 ? NO_CIRCUIT_COLOR : CIRCUIT_COLORS[index % CIRCUIT_COLORS.length]!);

/** Interruptor ou luz: aceita comando. */
export const isSwitch = (p: ElecPoint) => p.kind === 'switch';
export const isLight = (p: ElecPoint) => p.kind === 'light';
