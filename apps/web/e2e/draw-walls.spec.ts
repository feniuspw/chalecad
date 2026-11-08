import type { Page } from '@playwright/test';
import { expect, newScratchProject, planView, settled, state, test } from './fixtures';

/** Ponto da tela (px) de um ponto da planta (motor: x, y; cena: x, z=-y) usando a câmera ortográfica da cena. */
async function screenOf(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const p = await page.evaluate(
    ([mx, my]) => {
      const w = window as unknown as { __three: () => { camera: { updateMatrixWorld(): void; matrixWorldInverse: unknown; projectionMatrix: unknown }; gl: { domElement: HTMLCanvasElement } } };
      const t = w.__three();
      t.camera.updateMatrixWorld();
      const cam = t.camera as unknown as { position: { x: number; y: number; z: number }; zoom: number; left: number; right: number; top: number; bottom: number; matrixWorldInverse: { elements: number[] }; projectionMatrix: { elements: number[] } };
      const v = [mx!, 0, -my!, 1];
      const mul = (m: number[], a: number[]) => [0, 1, 2, 3].map((r) => m[r]! * a[0]! + m[4 + r]! * a[1]! + m[8 + r]! * a[2]! + m[12 + r]! * a[3]!);
      const c = mul(cam.projectionMatrix.elements, mul(cam.matrixWorldInverse.elements, v));
      const ndcX = c[0]! / c[3]!;
      const ndcY = c[1]! / c[3]!;
      const r = t.gl.domElement.getBoundingClientRect();
      return { x: r.left + ((ndcX + 1) / 2) * r.width, y: r.top + ((1 - ndcY) / 2) * r.height };
    },
    [x, y],
  );
  return p;
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

test('F15-W2. desenho manual na planta: parede por medida digitada e retângulo 3x3 viram paredes e cômodo', async ({ page }) => {
  await newScratchProject(page);
  await planView(page);
  const walls0 = await state<number>(page, 's => s.project.walls.length');
  const rooms0 = await state<number>(page, 's => s.project.rooms.length');

  // Parede: W, clique no início, cursor à direita, digita 3 + Enter.
  await page.keyboard.press('w');
  await expect.poll(() => state<string>(page, 's => s.tool')).toBe('wall');
  await clickAt(page, 1, 1);
  await moveTo(page, 3.5, 1);
  await page.keyboard.type('3');
  await expect(page.getByTestId('typed-field')).toContainText('3');
  await page.keyboard.press('Enter');
  await expect.poll(() => state<number>(page, 's => s.project.walls.length')).toBe(walls0 + 1);
  const w1 = await state<{ from: number[]; to: number[] }>(page, 's => s.project.walls[s.project.walls.length - 1]');
  expect(Math.hypot(w1.to[0]! - w1.from[0]!, w1.to[1]! - w1.from[1]!)).toBeCloseTo(3, 2);
  await page.keyboard.press('Escape'); // encerra o encadeamento

  // Desfazer volta uma parede só.
  await page.keyboard.press('Control+z');
  await expect.poll(() => state<number>(page, 's => s.project.walls.length')).toBe(walls0);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(() => state<number>(page, 's => s.project.walls.length')).toBe(walls0 + 1);

  // Retângulo: R, clique no canto, cursor para cima/direita, digita 3x3 + Enter, escolhe o uso.
  await page.keyboard.press('r');
  await expect.poll(() => state<string>(page, 's => s.tool')).toBe('rect');
  await clickAt(page, 1, 3);
  await moveTo(page, 3.5, 5.5);
  await page.keyboard.type('3x3');
  await page.keyboard.press('Enter');
  await expect.poll(() => state<number>(page, 's => s.project.walls.length')).toBe(walls0 + 5);
  await page.getByRole('menu', { name: 'Uso do cômodo' }).getByRole('menuitem', { name: 'Quarto' }).click();
  await expect.poll(() => state<number>(page, 's => s.project.rooms.length')).toBe(rooms0 + 1);

  // O motor fecha o cômodo: contorno resolvido com ~9 m².
  await settled(page);
  const area = await state<number>(page, 's => s.results.model.rooms.find(r => r.id === s.project.rooms[s.project.rooms.length - 1].id).area');
  expect(area).toBeGreaterThan(6);
  expect(area).toBeLessThan(10);
  const sides = await state<number[]>(page, 's => s.project.walls.slice(-4).map(w => Math.round(Math.hypot(w.to[0]-w.from[0], w.to[1]-w.from[1])*100)/100)');
  expect(sides).toEqual([3, 3, 3, 3]);

  // Um segundo retângulo (2x3) que divide a aresta com o primeiro não duplica a parede comum.
  await page.keyboard.press('Escape');
  await page.keyboard.press('r');
  await clickAt(page, 4, 3);
  await moveTo(page, 5.5, 5);
  await page.keyboard.type('2x3');
  await page.keyboard.press('Enter');
  await expect.poll(() => state<number>(page, 's => s.project.walls.length')).toBe(walls0 + 5 + 3);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
});

test('F15-W2. arrastar a ponta de uma parede move as ligadas e desfaz em um passo', async ({ page }) => {
  await newScratchProject(page);
  await planView(page);
  // duas paredes ligadas em L, criadas pela store (a UI de desenho já é testada acima)
  await page.evaluate(`(() => {
    const s = window.__editor.getState();
    const level = s.project.levels[0].id;
    s.update('Desenhar', (d) => { d.walls.push({ id: 'wa', level, from: [1.5, 2], to: [4.5, 2] }, { id: 'wb', level, from: [4.5, 2], to: [4.5, 5] }); });
    s.select({ kind: 'wall', id: 'wa' });
  })()`);
  await settled(page);
  const before = await state<number>(page, 's => s.past.length');
  const a = await screenOf(page, 4.5, 2);
  const b = await screenOf(page, 6, 2);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, a.y, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => state<number>(page, 's => s.past.length')).toBe(before + 1);
  const moved = await state<{ wa: number[]; wb: number[] }>(page, 's => ({ wa: s.project.walls.find(w => w.id === "wa").to, wb: s.project.walls.find(w => w.id === "wb").from })');
  expect(moved.wa[0]!).toBeGreaterThan(5);
  expect(moved.wb).toEqual(moved.wa);
  await page.keyboard.press('Control+z');
  const back = await state<{ wa: number[]; wb: number[] }>(page, 's => ({ wa: s.project.walls.find(w => w.id === "wa").to, wb: s.project.walls.find(w => w.id === "wb").from })');
  expect(back).toEqual({ wa: [4.5, 2], wb: [4.5, 2] });
});
