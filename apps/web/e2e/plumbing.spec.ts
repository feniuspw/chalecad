import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { expect, openExample, planView, settled, state, test } from './fixtures';

const FIXTURE = JSON.parse(readFileSync(fileURLToPath(new URL('./plumb-chalet.json', import.meta.url)), 'utf8')) as unknown;
const SHOTS = process.env.PLUMB_SHOT_DIR;

/** Carrega o chalé com mezanino, banheiro no mezanino e torre da caixa d'água (instalações ligadas). */
async function loadChalet(page: Page) {
  await openExample(page);
  await page.evaluate((p) => (window as unknown as { __editor: { getState: () => { loadProject: (p: unknown) => void } } }).__editor.getState().loadProject(p), FIXTURE);
  await page.waitForFunction(() => {
    const s = (window as unknown as { __editor: { getState: () => { results?: { installations?: { plumbing?: unknown } } | null; revision: number; computedRevision: number } } }).__editor.getState();
    return s.revision === s.computedRevision && !!s.results?.installations?.plumbing;
  });
}

/** Ponto da tela (px) de um ponto da planta (motor: x, y; cena: x, z=-y) com a câmera ortográfica. */
async function screenOf(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([mx, my]) => {
      const w = window as unknown as { __three: () => { camera: unknown; gl: { domElement: HTMLCanvasElement } } };
      const t = w.__three();
      const cam = t.camera as { updateMatrixWorld(): void; matrixWorldInverse: { elements: number[] }; projectionMatrix: { elements: number[] } };
      cam.updateMatrixWorld();
      const v = [mx!, 0, -my!, 1];
      const mul = (m: number[], a: number[]) => [0, 1, 2, 3].map((r) => m[r]! * a[0]! + m[4 + r]! * a[1]! + m[8 + r]! * a[2]! + m[12 + r]! * a[3]!);
      const c = mul(cam.projectionMatrix.elements, mul(cam.matrixWorldInverse.elements, v));
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
async function clickAt(page: Page, x: number, y: number) {
  const p = await moveTo(page, x, y);
  await page.mouse.click(p.x, p.y);
}

const seals = (page: Page) => page.getByTestId('pressure-seal');
const mcaOf = async (page: Page, pointId: string): Promise<number> => {
  const t = await page.locator(`[data-testid="pressure-seal"][data-point="${pointId}"]`).innerText();
  return Number.parseFloat(/([\d,]+) m\.c\.a\./.exec(t)![1]!.replace(',', '.'));
};

test('F16-W2. hidráulica: camada H com selos de pressão, tabela, caixa 1 m acima e PDF', async ({ page }) => {
  await loadChalet(page);
  await planView(page);

  // H liga a camada (e abre a paleta)
  await page.keyboard.press('h');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __plumb: { getState: () => { layer: boolean } } }).__plumb.getState().layer)).toBe(true);
  await expect(page.getByTestId('plumb-palette').getByRole('button', { name: /Rotear automaticamente/ })).toBeVisible();
  // selos de pressão do térreo (cozinha, chuveiro, bacia e lavatório), todos com m.c.a. e kPa
  await expect(seals(page)).toHaveCount(4);
  await expect(seals(page).first()).toContainText(/m\.c\.a\. · \d+,\d kPa/);
  expect(await seals(page).evaluateAll((els) => els.every((e) => e.getAttribute('data-ok') === '1'))).toBe(true);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'plumb-plan-L0.png') });

  // mezanino: selos dos pontos de cima (bacia, lavatório e chuveiro), e a caixa d'água aparece tracejada
  await page.getByRole('group', { name: 'Nível ativo' }).getByRole('button').nth(1).click();
  await expect(seals(page)).toHaveCount(3);
  await page.waitForTimeout(500);
  if (SHOTS) {
    await page.screenshot({ path: join(SHOTS, 'plumb-plan-L1.png') });
    // tela grande: confere a legibilidade dos traços e rótulos
    await page.setViewportSize({ width: 2400, height: 1500 });
    await page.getByRole('group', { name: 'Vistas' }).getByRole('button', { name: 'Planta' }).click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(SHOTS, 'plumb-plan-L1-big.png') });
    await page.getByRole('group', { name: 'Nível ativo' }).getByRole('button').nth(0).click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(SHOTS, 'plumb-plan-L0-big.png') });
    await page.getByRole('group', { name: 'Nível ativo' }).getByRole('button').nth(1).click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(800);
  }

  // resultados: aba Hidráulica com a tabela de pressão por ponto
  await page.getByRole('tab', { name: 'Hidráulica' }).click();
  const tab = page.getByTestId('plumbing-tab');
  await expect(tab.getByTestId('pressure-row')).toHaveCount(7);
  await expect(tab.getByText(/Todos os pontos|Pressão/).first()).toBeVisible();
  await expect(tab.getByText(/não substitui projeto estrutural com ART/i)).toBeVisible();

  // caixa 1 m mais alta pelas propriedades: a pressão do ponto sobe cerca de 1 m.c.a.
  // (com a caixa baixa o motor engrossa canos para atender e, ao subir, volta a afinar: parte de uma cota alta)
  await state(page, 's => s.setActiveLevel("L0")');
  const props = page.getByRole('complementary', { name: 'Propriedades' });
  const section = props.getByRole('button', { name: /^Instalações/ });
  if ((await section.getAttribute('aria-expanded')) !== 'true') await section.click();
  const field = props.getByLabel('Cota do fundo da caixa (m)');
  await field.fill('9,1');
  await field.press('Enter');
  await settled(page);
  await expect.poll(() => state<number>(page, 's => s.project.installations.plumbing.tank.bottomZ')).toBeCloseTo(9.1, 2);
  const shower = 'auto-pt-f-11';
  await expect(page.locator(`[data-testid="pressure-seal"][data-point="${shower}"]`)).toBeVisible();
  const before = await mcaOf(page, shower);
  await field.fill('10,1');
  await field.press('Enter');
  await settled(page);
  await expect.poll(async () => (await mcaOf(page, shower)) - before, { timeout: 8000 }).toBeGreaterThan(0.85);
  const after = await mcaOf(page, shower);
  expect(after - before).toBeLessThan(1.05);

  // PDF da hidráulica
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), tab.getByRole('button', { name: 'PDF da hidráulica' }).click()]);
  expect(download.suggestedFilename()).toMatch(/hidraulica\.pdf$/);

  // 3D: tubos como cilindros por sistema
  await page.getByRole('group', { name: 'Vistas' }).getByRole('button', { name: '3D' }).click();
  await expect.poll(() => state<string>(page, 's => s.cameraView')).toBe('3d');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const t = (window as unknown as { __three: () => { scene: { traverse: (f: (o: { name: string }) => void) => void } } }).__three();
        let n = 0;
        t.scene.traverse((o) => {
          if (o.name === 'plumb-pipes') n++;
        });
        return n;
      }),
    )
    .toBeGreaterThanOrEqual(3);
});

test('F16-W2. desenhar na planta: ponto de água e tubo da caixa até ele, com desfazer atômico', async ({ page }) => {
  await loadChalet(page);
  await planView(page);
  await page.keyboard.press('h');
  await expect(seals(page)).toHaveCount(4);
  const plumb = page.getByTestId('plumb-palette');
  const n = (expr: string) => state<number>(page, expr);
  const pts0 = await n('s => s.results.installations.plumbing.layout.points.length');
  const pipesAuto = await n('s => s.results.installations.plumbing.layout.pipes.length');
  expect(await state<boolean>(page, 's => s.project.installations.plumbing.manual')).toBe(false);

  // ponto de água novo (lavatório) num canto livre do térreo
  await plumb.getByRole('button', { name: 'Ponto de água' }).click();
  await expect(plumb.getByLabel('Aparelho')).toBeVisible();
  const tank = await state<[number, number]>(page, 's => s.results.installations.plumbing.layout.tank.position');
  const spot: [number, number] = [tank[0] - 1.2, tank[1] - 1.9];
  await clickAt(page, spot[0], spot[1]);
  await expect.poll(() => n('s => s.project.installations.plumbing.points.length')).toBe(pts0 + 1);
  expect(await state<boolean>(page, 's => s.project.installations.plumbing.manual')).toBe(true);
  await settled(page);
  // sem tubo ainda: o motor avisa que o ponto está sem ligação
  await expect.poll(() => state<boolean>(page, 's => s.results.warnings.some(w => w.code === "water.disconnected")')).toBe(true);

  // tubo de água fria: clica na caixa d'água e termina no ponto novo (snap + cotas padrão)
  await plumb.getByRole('button', { name: 'Tubo de água fria' }).click();
  const pipes0 = pipesAuto;
  await clickAt(page, tank[0], tank[1]);
  await clickAt(page, tank[0], spot[1]);
  await clickAt(page, spot[0], spot[1]);
  await expect.poll(() => n('s => s.project.installations.plumbing.pipes.length')).toBeGreaterThan(pipes0);
  await settled(page);
  await expect.poll(() => state<boolean>(page, 's => s.results.warnings.some(w => w.code === "water.disconnected")')).toBe(false);
  await expect(seals(page)).toHaveCount(5);

  // o tubo novo termina na altura do aparelho e corre no forro (pé-direito - 0,1)
  const z = await state<number[]>(page, 's => s.project.installations.plumbing.pipes.at(-1).path.map(v => v[2])');
  expect(z.at(-1)).toBeCloseTo(0.6, 3);
  expect(Math.max(...z)).toBeGreaterThan(2);

  // desfazer volta passo a passo; o último desfaz tudo e o traçado volta a ser automático
  await state(page, 's => s.undo()');
  await expect.poll(() => n('s => s.project.installations.plumbing.pipes.length')).toBe(pipes0);
  await state(page, 's => s.undo()');
  await expect.poll(() => n('s => s.project.installations.plumbing.points.length')).toBe(0);
  expect(await state<boolean>(page, 's => s.project.installations.plumbing.manual')).toBe(false);
});
