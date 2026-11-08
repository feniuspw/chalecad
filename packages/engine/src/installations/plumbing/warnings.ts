import type { EngineWarning, PlumbingLayout } from '../../schema/results';
import type { Ctx } from './context';
import type { WaterNetworks, WaterNet } from './network';
import { LOCAL } from './context';

const fmt1 = (n: number) => n.toFixed(1).replace('.', ',');
const fmt2 = (n: number) => n.toFixed(2).replace('.', ',');
const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** Avisos `water.*` das redes de água: pressão, velocidade, estática, DN mínimo, caixa e ligações. */
export function waterWarnings(ctx: Ctx, layout: PlumbingLayout, nets: WaterNetworks, dailyLiters: number): EngineWarning[] {
  const k = ctx.k.water;
  const out: EngineWarning[] = [];
  const labelOf = (pointId: string) => layout.points.find((p) => p.id === pointId);
  const seen = new Set<string>();

  for (const d of nets.disconnected) {
    const p = labelOf(d.pointId);
    const spec = k.fixtures[d.fixture];
    out.push({
      code: 'water.disconnected',
      severity: 'error',
      message: `${spec?.label ?? d.fixture}${p?.label && p.label !== spec?.label ? ` (${p.label})` : ''} sem ligação ${d.system === 'hot' ? 'à água quente' : "à caixa d'água"}: ligue um tubo ao ponto`,
      refs: [d.pointId],
    });
  }

  for (const net of [nets.cold, nets.hot]) {
    if (!net) continue;
    perNet(net);
  }

  function perNet(net: WaterNet) {
    const hot = net.system === 'hot';
    const suffix = hot ? ' (água quente)' : '';
    for (const p of net.calc.points) {
      const t = p.terminal;
      const upper = ctx.elev(t.level) > 0;
      if (!p.ok) {
        out.push({
          code: 'water.pressure_low',
          // no térreo, caixa no forro com pouca coluna é o caso comum (resolve com pressurizador): só informa
          severity: upper ? 'warn' : 'info',
          message:
            `${t.spec.label}${upper ? ' do mezanino' : ''}${suffix} com ${fmt2(Math.max(0, p.dynamicHead))} m.c.a. de pressão ` +
            `(mínimo ${fmt2(p.minMca)} m.c.a., NBR 5626): suba a caixa ${fmt2(p.requiredTankRise)} m ou aumente o tubo`,
          refs: [t.pointId, ...p.pathEdges.map((e) => net.pipes[net.tree.edges[e]!.pipe]!.id)],
        });
      }
      if (!hot && p.staticHead * ctx.k.kPaPerMca > k.maxStaticKpa + 1e-9) {
        out.push({
          code: 'water.static_high',
          severity: 'error',
          message: `${t.spec.label} com pressão estática de ${fmt1(p.staticHead)} m.c.a., acima do máximo de ${fmt1(k.maxStaticKpa / ctx.k.kPaPerMca)} m.c.a. (NBR 5626): use válvula redutora`,
          refs: [t.pointId],
        });
      }
    }
    for (const e of net.calc.edges) {
      if (e.velocity > k.maxVelocity + 1e-9) {
        out.push({
          code: 'water.velocity_high',
          severity: 'error',
          message: `Velocidade de ${fmt2(e.velocity)} m/s no tubo ${e.pipeId}${suffix}, acima do máximo de ${fmt1(k.maxVelocity)} m/s (NBR 5626): aumente o diâmetro`,
          refs: [e.pipeId],
        });
      } else if (e.velocity > k.velocityTarget + 1e-9) {
        out.push({
          code: 'water.velocity_high',
          severity: 'info',
          message: `Velocidade de ${fmt2(e.velocity)} m/s no tubo ${e.pipeId}${suffix}, acima da meta de ${fmt1(k.velocityTarget)} m/s (ruído): considere um diâmetro maior`,
          refs: [e.pipeId],
        });
      }
    }
    // DN mínimo do sub-ramal
    for (const p of net.calc.points) {
      const last = p.pathEdges[p.pathEdges.length - 1];
      if (last === undefined) continue;
      const e = net.calc.edges[last]!;
      const key = `${net.system}:${e.pipeId}:${p.terminal.pointId}`;
      if (e.dn < p.terminal.spec.dnMin && !seen.has(key)) {
        seen.add(key);
        out.push({
          code: 'water.dn_min',
          severity: 'warn',
          message: `Sub-ramal ${e.pipeId}${suffix} com DN ${e.dn}, menor que o mínimo de ${p.terminal.spec.dnMin} para ${p.terminal.spec.label} (NBR 5626)`,
          refs: [e.pipeId, p.terminal.pointId],
        });
      }
    }
  }

  // menos de 1 dia de reserva: aviso; abaixo do mínimo de 500 L mas com 1 dia ou mais: só informa (caixas de 310 L são
  // comuns em chalé de 1 pessoa e já eram dimensionadas assim pelo catálogo de instalações)
  const minL = k.reservoir.minLiters;
  if (layout.tank.liters < dailyLiters - 1e-9 || layout.tank.liters < minL - 1e-9) {
    const short = layout.tank.liters < dailyLiters - 1e-9;
    out.push({
      code: 'water.tank_small',
      severity: short ? 'warn' : 'info',
      message: `Caixa d'água de ${fmt(layout.tank.liters)} L ${short ? 'não cobre 1 dia' : `abaixo do mínimo usual de ${fmt(minL)} L`} (consumo de ${fmt(dailyLiters)} L/dia; NBR 5626)`,
      refs: [],
    });
  }
  if (ctx.project.installations.waterHeater === 'gas' && nets.heaterInletHead !== null && nets.heaterInletHead < LOCAL.gasHeaterMinMca) {
    out.push({
      code: 'water.pressurizer',
      severity: 'warn',
      message: `Aquecedor a gás recebe ${fmt2(Math.max(0, nets.heaterInletHead))} m.c.a., abaixo dos ${fmt1(LOCAL.gasHeaterMinMca)} m.c.a. de acionamento usuais: use pressurizador`,
      refs: [],
    });
  }
  return out;
}
