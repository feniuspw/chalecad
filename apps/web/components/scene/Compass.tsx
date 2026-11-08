/** Mini compasso em planta: casa com a frente embaixo, seta do norte e, opcionalmente, o sol. Só SVG. */
export function Compass({ northDeg, sunAzimuthDeg, sunUp = true, size = 64 }: { northDeg: number; sunAzimuthDeg?: number; sunUp?: boolean; size?: number }) {
  const c = 32;
  const polar = (deg: number, r: number) => {
    const a = (deg * Math.PI) / 180; // 0 = para cima na planta (+y), horário
    return [c + Math.sin(a) * r, c - Math.cos(a) * r] as const;
  };
  const [nx, ny] = polar(northDeg, 25);
  const [tx, ty] = polar(northDeg, 11);
  const [lx, ly] = polar(northDeg, 29.5);
  const sun = sunAzimuthDeg === undefined ? null : polar(northDeg + sunAzimuthDeg, 23);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={`Norte a ${Math.round(northDeg)}° da planta`} className="shrink-0">
      <circle cx={c} cy={c} r={30} fill="white" fillOpacity={0.85} stroke="#d6d3d1" />
      <rect x={24} y={23} width={16} height={18} rx={1.5} fill="#f5f5f4" stroke="#a8a29e" />
      <line x1={24} y1={41} x2={40} y2={41} stroke="#78716c" strokeWidth={2.5} />
      <line x1={tx} y1={ty} x2={nx} y2={ny} stroke="#b45309" strokeWidth={1.6} strokeLinecap="round" />
      <circle cx={nx} cy={ny} r={2.6} fill="#b45309" />
      <text x={lx} y={ly} fontSize={8} fontWeight={700} fill="#b45309" textAnchor="middle" dominantBaseline="central" style={{ paintOrder: 'stroke' }} stroke="white" strokeWidth={2}>
        N
      </text>
      {sun ? <circle cx={sun[0]} cy={sun[1]} r={3.6} fill={sunUp ? '#f59e0b' : '#a8a29e'} stroke="white" strokeWidth={1} /> : null}
    </svg>
  );
}
