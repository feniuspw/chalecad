/** "agora", "há 5 min", "há 3 h", "ontem", "há 12 d", "há 2 meses". */
export function timeAgo(then: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 45) return 'agora há pouco';
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return 'ontem';
  if (d < 30) return `há ${d} dias`;
  const mo = Math.round(d / 30);
  if (mo < 12) return mo === 1 ? 'há 1 mês' : `há ${mo} meses`;
  const y = Math.round(mo / 12);
  return y === 1 ? 'há 1 ano' : `há ${y} anos`;
}
