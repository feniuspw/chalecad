/**
 * Posição do sol (modo apresentação). Puro: sem three, sem DOM.
 * Algoritmo da NOAA (Meeus simplificado): declinação, equação do tempo e ângulo horário.
 * Convenções: azimute em graus a partir do norte, sentido horário (90 = leste); elevação acima do horizonte.
 */
import type { UF } from '@chalecad/engine';

export interface SunAngles {
  azimuthDeg: number;
  elevationDeg: number;
}

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Elevação do centro do sol no nascer/pôr (refração + raio solar). */
const HORIZON_ELEVATION = -0.833;

/** Dia juliano à 0h UTC de uma data AAAA-MM-DD. */
export function julianDayAtMidnightUTC(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Data inválida: ${date}`);
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return ms / 86400000 + 2440587.5;
}

interface Astro {
  declDeg: number;
  /** Equação do tempo em minutos. */
  eqTime: number;
}

function astro(jd: number): Astro {
  const T = (jd - 2451545) / 36525;
  const L0 = mod(280.46646 + T * (36000.76983 + T * 0.0003032), 360);
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = M * RAD;
  const C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) + Math.sin(3 * Mr) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const meanObliq = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const obliq = meanObliq + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(obliq * RAD) * Math.sin(appLong * RAD));
  const y = Math.tan((obliq * RAD) / 2) ** 2;
  const L0r = L0 * RAD;
  const eqTime =
    4 *
    DEG *
    (y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) - 0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr));
  return { declDeg: decl * DEG, eqTime };
}

/**
 * Azimute e elevação do sol.
 * @param date AAAA-MM-DD (data local)
 * @param minutes hora local, em minutos desde 0h
 * @param lat latitude (graus, sul negativo)
 * @param lon longitude (graus, oeste negativo)
 * @param tzOffsetHours fuso em relação a UTC (Brasília = -3)
 */
export function sunPosition(date: string, minutes: number, lat: number, lon: number, tzOffsetHours: number): SunAngles {
  const jd = julianDayAtMidnightUTC(date) + minutes / 1440 - tzOffsetHours / 24;
  const { declDeg, eqTime } = astro(jd);
  const trueSolarTime = mod(minutes + eqTime + 4 * lon - 60 * tzOffsetHours, 1440);
  let ha = trueSolarTime / 4 - 180;
  if (ha < -180) ha += 360;
  const latR = lat * RAD;
  const decR = declDeg * RAD;
  const cosZen = Math.min(1, Math.max(-1, Math.sin(latR) * Math.sin(decR) + Math.cos(latR) * Math.cos(decR) * Math.cos(ha * RAD)));
  const zen = Math.acos(cosZen);
  const sinZen = Math.sin(zen);
  let azimuthDeg: number;
  if (sinZen < 1e-6) {
    azimuthDeg = 180; // sol a pino: azimute indefinido
  } else {
    const c = Math.min(1, Math.max(-1, (Math.sin(latR) * cosZen - Math.sin(decR)) / (Math.cos(latR) * sinZen)));
    const a = Math.acos(c) * DEG;
    azimuthDeg = ha > 0 ? mod(a + 180, 360) : mod(540 - a, 360);
  }
  return { azimuthDeg, elevationDeg: 90 - zen * DEG };
}

export interface SunTimes {
  /** Minutos locais desde 0h. */
  sunrise: number;
  sunset: number;
  /** Meio-dia solar (minutos locais). */
  solarNoon: number;
  /** true quando o sol não nasce ou não se põe nesse dia (latitudes polares; não ocorre no Brasil). */
  polar: boolean;
}

/** Nascer e pôr do sol (minutos locais). */
export function sunTimes(date: string, lat: number, lon: number, tzOffsetHours: number): SunTimes {
  const noonGuess = 720;
  const jd = julianDayAtMidnightUTC(date) + noonGuess / 1440 - tzOffsetHours / 24;
  const { declDeg, eqTime } = astro(jd);
  const solarNoon = 720 - 4 * lon - eqTime + 60 * tzOffsetHours;
  const latR = lat * RAD;
  const decR = declDeg * RAD;
  const cosHa = (Math.cos((90 - HORIZON_ELEVATION) * RAD) - Math.sin(latR) * Math.sin(decR)) / (Math.cos(latR) * Math.cos(decR));
  if (cosHa > 1) return { sunrise: solarNoon, sunset: solarNoon, solarNoon, polar: true };
  if (cosHa < -1) return { sunrise: 0, sunset: 1440, solarNoon, polar: true };
  const ha = Math.acos(cosHa) * DEG;
  return { sunrise: solarNoon - 4 * ha, sunset: solarNoon + 4 * ha, solarNoon, polar: false };
}

/**
 * Direção para o sol no referencial do motor (x, y em planta, z para cima), unitária.
 * `northDeg`: graus no sentido horário a partir de +y até o norte. O azimute (a partir do norte, horário)
 * soma-se a ele: direção em planta = (sen(N + az), cos(N + az)).
 */
export function sunVector(azimuthDeg: number, elevationDeg: number, northDeg: number): [number, number, number] {
  const a = (northDeg + azimuthDeg) * RAD;
  const el = elevationDeg * RAD;
  const h = Math.cos(el);
  const r = (n: number) => n + 0; // evita -0
  return [r(Math.sin(a) * h), r(Math.cos(a) * h), Math.sin(el)];
}

export interface UfLocation {
  city: string;
  lat: number;
  lon: number;
  /** Fuso em relação a UTC (sem horário de verão). */
  tz: number;
}

const L = (city: string, lat: number, lon: number, tz = -3): UfLocation => ({ city, lat, lon, tz });

const CAPITALS: Record<UF, UfLocation> = {
  AC: L('Rio Branco', -9.97, -67.81, -5),
  AL: L('Maceió', -9.67, -35.74),
  AP: L('Macapá', 0.03, -51.07),
  AM: L('Manaus', -3.12, -60.02, -4),
  BA: L('Salvador', -12.97, -38.51),
  CE: L('Fortaleza', -3.73, -38.53),
  DF: L('Brasília', -15.79, -47.88),
  ES: L('Vitória', -20.32, -40.34),
  GO: L('Goiânia', -16.68, -49.25),
  MA: L('São Luís', -2.53, -44.3),
  MT: L('Cuiabá', -15.6, -56.1, -4),
  MS: L('Campo Grande', -20.44, -54.65, -4),
  MG: L('Belo Horizonte', -19.92, -43.94),
  PA: L('Belém', -1.46, -48.5),
  PB: L('João Pessoa', -7.12, -34.86),
  PR: L('Curitiba', -25.43, -49.27),
  PE: L('Recife', -8.05, -34.88),
  PI: L('Teresina', -5.09, -42.8),
  RJ: L('Rio de Janeiro', -22.91, -43.17),
  RN: L('Natal', -5.79, -35.21),
  RS: L('Porto Alegre', -30.03, -51.23),
  RO: L('Porto Velho', -8.76, -63.9, -4),
  RR: L('Boa Vista', 2.82, -60.67, -4),
  SC: L('Florianópolis', -27.6, -48.55),
  SP: L('São Paulo', -23.55, -46.63),
  SE: L('Aracaju', -10.91, -37.07),
  TO: L('Palmas', -10.18, -48.33),
};

/** Capital da UF (coordenadas e fuso). */
export function ufLocation(uf: UF): UfLocation {
  return CAPITALS[uf];
}

/** Fuso aproximado para coordenadas digitadas à mão: pela UF do projeto (o Brasil não tem horário de verão). */
export function timezoneFor(uf: UF): number {
  return CAPITALS[uf].tz;
}

/** "15:30" a partir de minutos desde 0h (arredonda ao minuto, limita a 0–24h). */
export function formatMinutes(minutes: number): string {
  const m = Math.min(1440, Math.max(0, Math.round(minutes)));
  const h = Math.floor(m / 60) % 24;
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Nome do ponto cardeal mais próximo do azimute ("N", "NE", ...). */
export function compassLabel(azimuthDeg: number): string {
  const names = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
  return names[Math.round(mod(azimuthDeg, 360) / 45) % 8]!;
}

export interface ResolvedLocation {
  lat: number;
  lon: number;
  tz: number;
  /** Nome da cidade quando vem da capital da UF; null para coordenadas digitadas. */
  city: string | null;
  custom: boolean;
}

/** Local do projeto: coordenadas digitadas (`meta.location`) ou a capital da UF. */
export function resolveLocation(meta: { region: UF; location?: { lat: number; lon: number } }): ResolvedLocation {
  const cap = ufLocation(meta.region);
  if (meta.location) return { lat: meta.location.lat, lon: meta.location.lon, tz: cap.tz, city: null, custom: true };
  return { lat: cap.lat, lon: cap.lon, tz: cap.tz, city: cap.city, custom: false };
}
