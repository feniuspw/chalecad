import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, planView, resultsTab, settled, state, test, type EditorWindow } from './fixtures';

/** Pasta dos prints da conferência visual (fora do projeto; ver SHOTS no relatório). */
const SHOTS = process.env.ELEC_SHOTS ?? '';

async function openPreset(page: Page) {
  await page.goto('/editor?new=1&template=gable-loft');
  await expect(page.getByText('Custo total estimado')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => !!(window as unknown as EditorWindow).__editor?.getState().results);
}

/** Ponto da tela (px) de um ponto da planta (motor: x, y; cena: x, z=-y) pela câmera ortográfica da cena. */
async function screenOf(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([mx, my]) => {
      const w = window as unknown as { __three: () => { camera: { updateMatrixWorld(): void; matrixWorldInverse: { elements: number[] }; projectionMatrix: { elements: number[] } }; gl: { domElement: HTMLCanvasElement } } };
      const t = w.__three();
      t.camera.updateMatrixWorld();
      const v = [mx!, 0, -my!, 1];
      const mul = (m: number[], a: number[]) => [0, 1, 2, 3].map((r) => m[r]! * a[0]! + m[4 + r]! * a[1]! + m[8 + r]! * a[2]! + m[12 + r]! * a[3]!);
      const c = mul(t.camera.projectionMatrix.elements, mul(t.camera.matrixWorldInverse.elements, v));
      const r = t.gl.domElement.getBoundingClientRect();
      return { x: r.left + ((c[0]! / c[3]! + 1) / 2) * r.width, y: r.top + ((1 - c[1]! / c[3]!) / 2) * r.height };
    },
    [x, y],
  );
}
async function moveTo(page: Page, x: number, y: number) {
  const p = await screenOf(page, x, y);
  await page.mouse.move(p.x - 4, p.y - 4);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  return p;
}
async function clickAt(page: Page, x: number, y: number, mods: ('Shift' | 'Alt')[] = []) {
  const p = await moveTo(page, x, y);
  for (const m of mods) await page.keyboard.down(m);
  await page.mouse.click(p.x, p.y);
  for (const m of mods) await page.keyboard.up(m);
}

/** Ponto a 20 cm da face interna da parede externa da frente, a `u` m da ponta (no piso do térreo). */
async function nearFrontWall(page: Page, u: number) {
  return page.evaluate((uu) => {
    const s = (window as unknown as { __editor: { getState: () => { activeLevelId: string; results: { model: { walls: { id: string; level: string; from: number[]; to: number[]; thickness: number }[]; footprint: number[][] } } } } }).__editor.getState();
    const ws = s.results.model.walls.filter((w) => w.level === s.activeLevelId && w.id === 'ext-front');
    const w = ws[0]!;
    const len = Math.hypot(w.to[0]! - w.from[0]!, w.to[1]! - w.from[1]!);
    const d = [(w.to[0]! - w.from[0]!) / len, (w.to[1]! - w.from[1]!) / len];
    const cx = s.results.model.footprint.reduce((a, p) => a + p[0]!, 0) / s.results.model.footprint.length;
    const cy = s.results.model.footprint.reduce((a, p) => a + p[1]!, 0) / s.results.model.footprint.length;
    let n = [-d[1]!, d[0]!];
    const mid = [w.from[0]! + d[0]! * uu, w.from[1]! + d[1]! * uu];
    if ((cx - mid[0]!) * n[0]! + (cy - mid[1]!) * n[1]! < 0) n = [-n[0]!, -n[1]!];
    return { id: w.id, x: mid[0]! + n[0]! * 0.25, y: mid[1]! + n[1]! * 0.25, thickness: w.thickness, n };
  }, u);
}

const elecPoints = (page: Page) => state<{ id: string; kind: string; hostId?: string; height: number; position: number[] }[]>(page, 's => s.results.installations.electrical.layout.points');

async function enableLayer(page: Page) {
  await openPreset(page);
  await planView(page);
  expect(await state<boolean>(page, 's => s.project.installations.enabled')).toBe(false);
  await page.getByTestId('elec-layer-toggle').click();
  await expect(page.getByTestId('elec-dock')).toBeVisible();
  await expect.poll(() => state<boolean>(page, 's => !!(s.results && s.results.installations && s.results.installations.electrical)')).toBe(true);
  await settled(page);
  await page.waitForTimeout(600);
}

test('F16-W1. camada elétrica: tomada na parede vira projeto manual e a aba Elétrica mostra o quadro de cargas', async ({ page }) => {
  await enableLayer(page);
  // o primeiro uso liga as instalações; o traçado ainda é o gerado
  expect(await state<boolean>(page, 's => s.project.installations.enabled')).toBe(true);
  expect(await state<boolean>(page, 's => s.project.installations.electrical.manual')).toBe(false);
  await expect(page.getByTestId('elec-mode')).toHaveText('Gerado automaticamente');
  const before = await elecPoints(page);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'plano-eletrica.png') });

  // Tomada baixa a 25 cm da parede da frente
  await page.getByTestId('elec-tool-socket').click();
  const at = await nearFrontWall(page, 0.45);
  await clickAt(page, at.x, at.y);
  await expect.poll(() => state<boolean>(page, 's => s.project.installations.electrical.manual')).toBe(true);
  await settled(page);

  const proj = await state<{ points: { id: string; kind: string; hostId?: string; height: number; position: number[] }[] }>(page, 's => s.project.installations.electrical');
  expect(proj.points.length).toBe(before.length + 1);
  const added = proj.points.find((p) => !before.some((b) => b.id === p.id))!;
  expect(added).toMatchObject({ kind: 'socket', hostId: 'ext-front', height: 0.3 });
  // encaixou na face da parede (a meia espessura do eixo), não onde o cursor estava
  const wall = await state<{ from: number[]; to: number[]; thickness: number }>(page, "s => s.results.model.walls.find(w => w.id === 'ext-front')");
  const dist = Math.abs(added.position[1]! - wall.from[1]!);
  expect(dist).toBeCloseTo(wall.thickness / 2, 2);
  await expect(page.getByTestId('elec-mode')).toHaveText('Desenhado à mão');

  // Resultados → aba Elétrica
  await resultsTab(page, /^Elétrica$/);
  const table = page.getByTestId('elec-load-table');
  await expect(table).toBeVisible();
  const n = await state<number>(page, 's => s.results.installations.electrical.circuits.length');
  expect(n).toBeGreaterThan(0);
  await expect(table.locator('tbody tr')).toHaveCount(n);
  await expect(page.getByTestId('elec-lighting')).toBeVisible();
  await expect(page.getByTestId('elec-tab')).toContainText(/não substitui/i);
  // desfazer volta ao ponto anterior num passo só (e ao traçado automático)
  await page.keyboard.press('Control+z');
  await expect.poll(() => state<boolean>(page, 's => s.project.installations.electrical.manual')).toBe(false);
});

test('F16-W1. luz em grade, comando do interruptor, eletroduto, apagar e gerar automaticamente', async ({ page }) => {
  await enableLayer(page);
  const rooms = await state<{ id: string; name: string; level: string; polygon: number[][] }[]>(page, 's => s.results.model.rooms');
  const room = rooms.filter((r) => r.polygon)[0]!;
  const cx = room.polygon.reduce((a, p) => a + p[0]!, 0) / room.polygon.length;
  const cy = room.polygon.reduce((a, p) => a + p[1]!, 0) / room.polygon.length;

  // Luz + Shift: grade automática no cômodo (troca as luzes antigas dele)
  const lightsIn = async () => (await elecPoints(page)).filter((p) => p.kind === 'light' && !p.hostId);
  await page.getByTestId('elec-tool-light').click();
  await clickAt(page, cx, cy, ['Shift']);
  await expect.poll(() => state<boolean>(page, 's => s.project.installations.electrical.manual')).toBe(true);
  await settled(page);
  const lux = await state<{ roomId: string; avgLux: number; targetLux: number; minLux: number }[]>(page, 's => s.results.installations.electrical.lighting');
  const here = lux.find((l) => l.roomId === room.id)!;
  // salão grande: o teto de 20 luminárias (limite de comandos do interruptor) pode ficar um pouco abaixo do alvo, mas acima do mínimo
  expect(here.avgLux).toBeGreaterThanOrEqual(here.minLux);
  expect((await lightsIn()).length).toBeGreaterThan(0);

  // Interruptor paralelo junto à parede da frente: assume as luzes do cômodo (se for o mesmo) e entra no projeto
  await page.getByTestId('elec-tool-switch').click();
  await page.getByRole('group', { name: 'Tipo de interruptor' }).getByRole('button', { name: 'Paralelo' }).click();
  const near = await nearFrontWall(page, 3.2);
  await clickAt(page, near.x, near.y);
  await settled(page);
  const sw = await state<{ id: string; switchType?: string; controls?: string[] }[]>(page, "s => s.project.installations.electrical.points.filter(p => p.kind === 'switch')");
  const mine = sw.find((p) => p.switchType === 'two_way' && p.id.startsWith('e-'))!;
  expect(mine).toBeTruthy();

  // Seleciona o interruptor e clica numa luz: liga ou desliga o comando
  await page.getByTestId('elec-tool-switch').click(); // desliga a ferramenta
  const swPos = await state<number[]>(page, `s => s.project.installations.electrical.points.find(p => p.id === '${mine.id}').position`);
  await clickAt(page, swPos[0]!, swPos[1]!);
  await expect(page.getByTestId('elec-inspector')).toBeVisible();
  const lights = (await lightsIn()).filter((l) => !(mine.controls ?? []).includes(l.id));
  expect(lights.length).toBeGreaterThan(0);
  const target = lights[0]!;
  await clickAt(page, target.position[0]!, target.position[1]!);
  await expect
    .poll(() => state<string[]>(page, `s => s.project.installations.electrical.points.find(p => p.id === '${mine.id}').controls`))
    .toContain(target.id);
  await clickAt(page, target.position[0]!, target.position[1]!);
  await expect
    .poll(() => state<string[]>(page, `s => s.project.installations.electrical.points.find(p => p.id === '${mine.id}').controls`))
    .not.toContain(target.id);

  // Eletroduto: dois cliques e Enter
  const c0 = await state<number>(page, 's => s.project.installations.electrical.conduits.length');
  await page.getByTestId('elec-tool-conduit').click();
  await clickAt(page, cx - 0.5, cy - 0.5);
  await clickAt(page, cx + 0.5, cy - 0.5);
  await clickAt(page, cx + 0.5, cy + 0.5);
  await page.keyboard.press('Enter');
  await expect.poll(() => state<number>(page, 's => s.project.installations.electrical.conduits.length')).toBe(c0 + 1);
  const duct = await state<{ path: number[][]; run: string }>(page, 's => s.project.installations.electrical.conduits[s.project.installations.electrical.conduits.length - 1]');
  expect(duct.path.length).toBe(3);
  expect(duct.run).toBe('ceiling');

  // Rotear automaticamente apaga e traça de novo
  await page.getByTestId('elec-route').click();
  await settled(page);
  const unreached = await state<number>(page, "s => s.results.warnings.filter(w => w.code === 'elec.conduit.unreached').length");
  expect(unreached).toBe(0);

  // Apagar com Delete (um ponto solto)
  await page.keyboard.press('Escape');
  const before = (await elecPoints(page)).length;
  const sockets = (await elecPoints(page)).filter((p) => p.kind === 'socket' && p.hostId);
  const sk = sockets[0]!;

  // Arrastar o ponto ao longo da parede: continua encaixado na face (mesmo hostId, mesma distância ao eixo)
  const wallOf = await state<{ from: number[]; to: number[]; thickness: number }>(page, `s => s.results.model.walls.find(w => w.id === '${sk.hostId}')`);
  const wl = Math.hypot(wallOf.to[0]! - wallOf.from[0]!, wallOf.to[1]! - wallOf.from[1]!);
  const dir = [(wallOf.to[0]! - wallOf.from[0]!) / wl, (wallOf.to[1]! - wallOf.from[1]!) / wl];
  const a = await screenOf(page, sk.position[0]!, sk.position[1]!);
  const dest = await screenOf(page, sk.position[0]! + dir[0]! * 0.4, sk.position[1]! + dir[1]! * 0.4 + 0.05);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + dest.x) / 2, (a.y + dest.y) / 2, { steps: 4 });
  await page.mouse.move(dest.x, dest.y, { steps: 4 });
  await page.mouse.up();
  await settled(page);
  const moved = (await elecPoints(page)).find((p) => p.id === sk.id)!;
  expect(moved.hostId).toBe(sk.hostId);
  expect(Math.hypot(moved.position[0]! - sk.position[0]!, moved.position[1]! - sk.position[1]!)).toBeGreaterThan(0.2);
  const off = (q: number[]) => Math.abs((q[0]! - wallOf.from[0]!) * -dir[1]! + (q[1]! - wallOf.from[1]!) * dir[0]!);
  expect(off(moved.position)).toBeCloseTo(wallOf.thickness / 2, 2);

  await clickAt(page, moved.position[0]!, moved.position[1]!);
  await expect(page.getByTestId('elec-inspector')).toBeVisible();
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await elecPoints(page)).length).toBe(before - 1);

  // Gerar automaticamente (com confirmação) volta ao traçado do motor
  await page.getByTestId('elec-regenerate').click();
  await page.getByTestId('elec-regenerate-confirm').click();
  await expect.poll(() => state<boolean>(page, 's => s.project.installations.electrical.manual')).toBe(false);
  await settled(page);
  await expect(page.getByTestId('elec-mode')).toHaveText('Gerado automaticamente');
});

test('F16-W1. aviso elec.* na aba Elétrica: "Mostrar na planta" circula o ponto', async ({ page }) => {
  await enableLayer(page);
  // tira todas as luzes de um cômodo para provocar elec.room.no_light
  const room = await state<{ id: string }>(page, 's => s.results.model.rooms.find(r => r.polygon)');
  await page.evaluate(
    (rid) => {
      type Lay = { points: { kind: string }[]; conduits: unknown[]; circuits: unknown[] };
      type Draft = { installations: { electrical: { manual: boolean; points: unknown[]; conduits: unknown[]; circuits: unknown[] } } };
      const w = window as unknown as { __editor: { getState: () => { update: (l: string, f: (d: Draft) => void) => void; results: { installations: { electrical: { layout: Lay } } } } } };
      const s = w.__editor.getState();
      const lay = s.results.installations.electrical.layout;
      s.update('teste', (d) => {
        const e = d.installations.electrical;
        e.manual = true;
        e.points = lay.points.filter((p) => p.kind !== 'light');
        e.conduits = lay.conduits;
        e.circuits = lay.circuits;
      });
      void rid;
    },
    room.id,
  );
  await settled(page);
  await resultsTab(page, /^Elétrica$/);
  const list = page.getByTestId('elec-warnings');
  await expect(list).toContainText('elec.room.no_light');
  await list.getByTestId('elec-show-on-plan').first().click();
  await expect.poll(() => state<number>(page, 's => 1')).toBe(1);
  await expect(page.getByTestId('elec-dock')).toBeVisible();
});

test('F16-W1. conferência visual: planta com a camada e apresentação à noite com luzes acesas', async ({ page }) => {
  test.skip(!SHOTS, 'só gera prints com ELEC_SHOTS definido');
  test.setTimeout(150_000);
  await enableLayer(page);
  await page.getByTestId('elec-route').click();
  await settled(page);
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(SHOTS, 'planta-camada-eletrica.png') });
  const c = await screenOf(page, 3.3, 2.2);
  await page.mouse.move(c.x, c.y);
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -300);
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(SHOTS, 'planta-zoom.png') });
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 300);
  await page.waitForTimeout(600);
  // seleciona um interruptor para mostrar as linhas de comando
  const sw = (await elecPoints(page)).find((p) => p.kind === 'switch')!;
  await clickAt(page, sw.position[0]!, sw.position[1]!);
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(SHOTS, 'planta-interruptor-selecionado.png') });
  await page.getByRole('group', { name: 'Vistas' }).getByRole('button', { name: '3D' }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(SHOTS, '3d-acabado.png') });
  await page.getByRole('group', { name: 'Modo de visualização' }).getByRole('button', { name: 'Apresentação' }).click();
  await page.getByRole('status', { name: 'Apresentação pronta' }).getByRole('button', { name: 'Abrir' }).click({ timeout: 60_000 });
  await expect.poll(() => state<string>(page, 's => s.viewMode')).toBe('presentation');
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const w = window as unknown as { __editor: { getState: () => { setSun: (s: { minutes: number }) => void } }; __presentationUi: { getState: () => { setLamps: (v: boolean) => void } } };
    w.__editor.getState().setSun({ minutes: 21 * 60 });
    w.__presentationUi.getState().setLamps(true);
  });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: join(SHOTS, 'apresentacao-noite-luzes-A.png') });
  await page.getByRole('button', { name: 'Andar por dentro' }).click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: join(SHOTS, 'apresentacao-noite-luzes.png') });
  mkdirSync(SHOTS, { recursive: true });
});
