import { describe, expect, it } from 'vitest';
import { compassLabel, formatMinutes, sunLight, sunPosition, sunTimes, sunVector, timezoneFor, ufLocation } from './index';

const SP = ufLocation('SP');

describe('sunPosition', () => {
  it('São Paulo no solstício de dezembro: sol quase a pino ao meio-dia solar', () => {
    const t = sunTimes('2024-12-21', SP.lat, SP.lon, SP.tz);
    const p = sunPosition('2024-12-21', t.solarNoon, SP.lat, SP.lon, SP.tz);
    expect(p.elevationDeg).toBeGreaterThan(88);
  });

  it('um pouco ao sul quando o sol passa ao sul do zênite (cidade ao norte do trópico)', () => {
    // Brasília (15,8°S) em 21/12: sol ao sul do zênite? decl -23,4 < lat -15,8, logo ao sul.
    const b = ufLocation('DF');
    const t = sunTimes('2024-12-21', b.lat, b.lon, b.tz);
    const p = sunPosition('2024-12-21', t.solarNoon, b.lat, b.lon, b.tz);
    expect(p.azimuthDeg).toBeGreaterThan(170);
    expect(p.azimuthDeg).toBeLessThan(190);
    expect(p.elevationDeg).toBeGreaterThan(70);
  });

  it('São Paulo em junho ao meio-dia: sol ao norte, ~43° de elevação', () => {
    const t = sunTimes('2024-06-21', SP.lat, SP.lon, SP.tz);
    const p = sunPosition('2024-06-21', t.solarNoon, SP.lat, SP.lon, SP.tz);
    expect(p.elevationDeg).toBeGreaterThan(41.5);
    expect(p.elevationDeg).toBeLessThan(44.5);
    const off = Math.min(p.azimuthDeg, 360 - p.azimuthDeg);
    expect(off).toBeLessThan(3);
  });

  it('de manhã o sol está a leste e à tarde a oeste', () => {
    const am = sunPosition('2024-03-20', 8 * 60, SP.lat, SP.lon, SP.tz);
    const pm = sunPosition('2024-03-20', 16 * 60, SP.lat, SP.lon, SP.tz);
    expect(am.azimuthDeg).toBeGreaterThan(45);
    expect(am.azimuthDeg).toBeLessThan(135);
    expect(pm.azimuthDeg).toBeGreaterThan(225);
    expect(pm.azimuthDeg).toBeLessThan(315);
  });

  it('é noite à meia-noite', () => {
    expect(sunPosition('2024-06-21', 0, SP.lat, SP.lon, SP.tz).elevationDeg).toBeLessThan(-30);
  });
});

describe('sunTimes', () => {
  const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
  it('São Paulo em 21/06: nascer ~06:47 e pôr ~17:35 (±15 min)', () => {
    const t = sunTimes('2024-06-21', SP.lat, SP.lon, SP.tz);
    expect(Math.abs(t.sunrise - minutes('06:47'))).toBeLessThanOrEqual(15);
    expect(Math.abs(t.sunset - minutes('17:35'))).toBeLessThanOrEqual(15);
  });
  it('São Paulo em 21/12: nascer ~05:21 e pôr ~18:47 (±15 min)', () => {
    const t = sunTimes('2024-12-21', SP.lat, SP.lon, SP.tz);
    expect(Math.abs(t.sunrise - minutes('05:21'))).toBeLessThanOrEqual(15);
    expect(Math.abs(t.sunset - minutes('18:47'))).toBeLessThanOrEqual(15);
  });
  it('Manaus quase não varia: dia de ~12 h', () => {
    const m = ufLocation('AM');
    const t = sunTimes('2024-06-21', m.lat, m.lon, m.tz);
    expect((t.sunset - t.sunrise) / 60).toBeGreaterThan(11.8);
    expect((t.sunset - t.sunrise) / 60).toBeLessThan(12.3);
  });
  it('a elevação no nascer é ~ -0,8°', () => {
    const t = sunTimes('2024-06-21', SP.lat, SP.lon, SP.tz);
    expect(sunPosition('2024-06-21', t.sunrise, SP.lat, SP.lon, SP.tz).elevationDeg).toBeCloseTo(-0.83, 0);
  });
});

describe('ufLocation', () => {
  it('fusos', () => {
    for (const uf of ['AM', 'MT', 'MS', 'RO', 'RR'] as const) expect(ufLocation(uf).tz).toBe(-4);
    expect(ufLocation('AC').tz).toBe(-5);
    for (const uf of ['SP', 'RJ', 'BA', 'DF', 'PA', 'RS'] as const) expect(ufLocation(uf).tz).toBe(-3);
    expect(timezoneFor('AC')).toBe(-5);
  });
  it('coordenadas dentro do que o schema aceita', () => {
    for (const uf of ['AC', 'AP', 'RR', 'RS', 'PB'] as const) {
      const l = ufLocation(uf);
      expect(l.lat).toBeGreaterThanOrEqual(-34);
      expect(l.lat).toBeLessThanOrEqual(6);
      expect(l.lon).toBeGreaterThanOrEqual(-75);
      expect(l.lon).toBeLessThanOrEqual(-28);
    }
  });
});

describe('sunVector', () => {
  const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 6));
  it('é unitário', () => {
    const v = sunVector(123, 37, 200);
    expect(Math.hypot(...v)).toBeCloseTo(1, 9);
  });
  it('norte nos fundos (0°): sol ao norte fica em +y', () => {
    close(sunVector(0, 0, 0), [0, 1, 0]);
    close(sunVector(90, 0, 0), [1, 0, 0]);
  });
  it('norte na frente (180°, padrão): sol ao norte fica em -y (na frente)', () => {
    close(sunVector(0, 0, 180), [0, -1, 0]);
    close(sunVector(90, 0, 180), [-1, 0, 0]);
  });
  it('a pino aponta para cima', () => {
    close(sunVector(10, 90, 180), [0, 0, 1]);
  });
});

describe('formatMinutes e compassLabel', () => {
  it('formata', () => {
    expect(formatMinutes(15 * 60 + 30)).toBe('15:30');
    expect(formatMinutes(5)).toBe('00:05');
    expect(formatMinutes(1440)).toBe('00:00');
  });
  it('pontos cardeais', () => {
    expect(compassLabel(0)).toBe('N');
    expect(compassLabel(358)).toBe('N');
    expect(compassLabel(92)).toBe('L');
    expect(compassLabel(268)).toBe('O');
  });
});

describe('sunLight', () => {
  it('meio-dia é branco e forte; horizonte alaranjado e fraco; noite só lua', () => {
    const noon = sunLight(70);
    const low = sunLight(3);
    const night = sunLight(-20);
    expect(noon.sun).toBeGreaterThan(low.sun);
    expect(low.sun).toBeGreaterThan(0);
    expect(night.sun).toBe(0);
    expect(night.moon).toBeGreaterThan(0.5);
    expect(noon.moon).toBe(0);
    const r = (c: string) => parseInt(c.slice(1, 3), 16);
    const b = (c: string) => parseInt(c.slice(5, 7), 16);
    expect(r(low.color) - b(low.color)).toBeGreaterThan(r(noon.color) - b(noon.color));
    expect(noon.daylight).toBe(1);
    expect(night.daylight).toBe(0);
  });
});

import { resolveLocation } from './index';
describe('resolveLocation', () => {
  it('usa a capital da UF por padrão e as coordenadas digitadas quando existem', () => {
    expect(resolveLocation({ region: 'PR' })).toMatchObject({ city: 'Curitiba', custom: false, tz: -3 });
    const c = resolveLocation({ region: 'MT', location: { lat: -12, lon: -55 } });
    expect(c).toMatchObject({ lat: -12, lon: -55, tz: -4, custom: true, city: null });
  });
});
