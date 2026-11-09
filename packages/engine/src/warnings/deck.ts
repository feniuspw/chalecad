import type { BuildingModel, EngineWarning } from '../schema/results';

/** Mensagem curta por verificação do deck; a severidade segue o status (`fail` = erro, `warn` = aviso). */
const MESSAGES: Record<string, string> = {
  joist_span: 'o vão do barrote passa do máximo do catálogo: adicione uma viga intermediária ou reduza a profundidade',
  beam_span: 'o vão da viga entre pilares passa do máximo do catálogo: acrescente pilares',
  support_height: 'pilar alto sem contraventamento, ou pilar de madeira acima da altura máxima: use mão-francesa, aço ou concreto',
  guardrail: 'o desnível exige guarda-corpo e ele está desligado',
  stair_missing: 'o desnível pede escada e o deck não tem nenhuma',
  footing_stress: 'a tensão estimada no solo passa da admissível: aumente a sapata ou a broca, ou confirme o solo com sondagem',
  on_slope: 'os pilares ficam sobre aterro, talude ou muro de arrimo: apoie as fundações em solo natural',
  roof_clearance: 'a cobertura do deck não deixa o pé-direito livre mínimo sem tocar o telhado principal: aprofunde o deck ou abaixe o piso',
};

/** Avisos `deck.*` a partir das verificações calculadas em `attachDeckFrames`. */
export function deckWarnings(model: BuildingModel): EngineWarning[] {
  const out: EngineWarning[] = [];
  for (const em of model.extras) {
    if (em.kind !== 'deck' || !em.deck) continue;
    for (const c of em.deck.checks) {
      if (c.status === 'ok') continue;
      const key = c.id.replace(/_\d+$/, '');
      const stairKey = key.startsWith('stair_') && key !== 'stair_missing';
      const code = stairKey ? 'deck.stair_blondel' : `deck.${key}`;
      const message = stairKey
        ? `${c.label} fora do limite (${c.value}; limite ${c.limit}): ajuste o desnível, o nível do piso ou a posição da escada.`
        : `Deck "${em.id}": ${MESSAGES[key] ?? c.label} (${c.value}; limite ${c.limit}).`;
      out.push({ code, severity: c.status === 'fail' ? 'error' : 'warn', message, refs: [em.id] });
    }
  }
  return out;
}
