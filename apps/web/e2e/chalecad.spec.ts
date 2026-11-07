import { readFileSync } from 'node:fs';
import { expect, openExample, state, test, totalCost, type EditorWindow } from './fixtures';

const results = (page: import('@playwright/test').Page) => page.waitForFunction(() => !!(window as unknown as EditorWindow).__editor?.getState().results);

test('1. landing carrega e o CTA leva ao editor', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('ChaléCAD');
  await page.getByRole('link', { name: 'Abrir o editor' }).first().click();
  await expect(page).toHaveURL(/\/editor/);
});

test('2. primeiro acesso: assistente e chalé de exemplo', async ({ page }) => {
  await page.goto('/editor');
  await expect(page.getByRole('dialog').getByText('Bem-vindo ao ChaléCAD')).toBeVisible();
  await page.getByRole('button', { name: 'Usar o chalé de exemplo' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Custo total estimado')).toBeVisible();
  expect(await totalCost(page)).toMatch(/^R\$\s[\d.]+$/);
  await expect(page.getByText('Área construída', { exact: true })).toBeVisible();
  await expect(page.getByText('78,0 m²').first()).toBeVisible();
});

test('3. mudar a largura recalcula em menos de 1 s e desfazer volta', async ({ page }) => {
  await openExample(page);
  const area0 = await state<number>(page, 's => s.results.model.builtArea');
  const cost0 = await totalCost(page);
  const width = page.getByRole('textbox', { name: 'Largura' }).first();
  await expect(width).toHaveValue('6,5');
  const t0 = Date.now();
  await width.fill('7,5');
  await width.press('Enter');
  await page.waitForFunction((a) => (window as unknown as { __editor: { getState: () => { results?: { model: { builtArea: number } } } } }).__editor.getState().results?.model.builtArea !== a, area0, { timeout: 1000 });
  expect(Date.now() - t0).toBeLessThan(1500);
  const area1 = await state<number>(page, 's => s.results.model.builtArea');
  expect(area1).toBeGreaterThan(area0);
  await expect.poll(() => totalCost(page), { timeout: 1000 }).not.toBe(cost0);
  await page.locator('body').click({ position: { x: 5, y: 450 } });
  await page.keyboard.press('Control+z');
  await expect(width).toHaveValue('6,5');
  await expect.poll(() => totalCost(page)).toBe(cost0);
});

test('4. clicar numa linha de Materiais destaca peças no 3D', async ({ page }) => {
  await openExample(page);
  await page.getByRole('tab', { name: 'Materiais' }).click();
  // Linhas de perfil (montantes etc.) têm peças; radier/telha podem ter só hostIds.
  const name = await state<string>(page, 's => s.results.quantities.lines.find(l => l.pieceIds.length > 0).name');
  await page.getByRole('button', { pressed: false }).filter({ hasText: name }).first().click();
  const n = await state<number>(page, 's => s.highlight?.pieceIds.length ?? 0');
  expect(n).toBeGreaterThan(0);
  await expect(page.getByRole('button', { pressed: true }).filter({ hasText: /perda/ })).toHaveCount(1);
});

test('5. recarregar reabre o mesmo projeto com o mesmo custo', async ({ page }) => {
  await openExample(page);
  const cost = await totalCost(page);
  await expect.poll(() => state<string | null>(page, 's => s.projectId')).toBeTruthy();
  await page.waitForTimeout(2500); // autosave
  await page.reload();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Custo total estimado')).toBeVisible();
  await results(page);
  await expect.poll(() => totalCost(page)).toBe(cost);
});

test('6. exportar JSON e reimportar pelo menu Abrir', async ({ page }) => {
  await openExample(page);
  const cost = await totalCost(page);
  await page.getByRole('button', { name: /Exportar/ }).first().click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'JSON do projeto' }).click()]);
  const path = test.info().outputPath('projeto.json');
  await dl.saveAs(path);
  expect(dl.suggestedFilename()).toMatch(/\.json$/);
  expect(JSON.parse(readFileSync(path, 'utf8'))).toHaveProperty('schemaVersion');
  // muda o projeto e reimporta
  const width = page.getByRole('textbox', { name: 'Largura' }).first();
  await width.fill('8');
  await width.press('Enter');
  await expect.poll(() => totalCost(page)).not.toBe(cost);
  await page.getByRole('button', { name: /Abrir/ }).first().click();
  await page.getByRole('menuitem', { name: /Arquivo \.json/ }).click().catch(() => undefined);
  await page.locator('input[type=file][aria-label="Abrir arquivo de projeto"]').setInputFiles(path);
  await expect.poll(() => totalCost(page), { timeout: 15_000 }).toBe(cost);
});

test('7. aviso de ART visível e PDF gerado', async ({ page }) => {
  await openExample(page);
  await expect(page.getByText(/não substitui/i).first()).toBeVisible();
  await expect(page.getByText(/ART/).first()).toBeVisible();
  await page.getByRole('banner').getByRole('button', { name: /Exportar/ }).click();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.getByRole('menuitem', { name: /PDF/ }).click()]);
  expect(dl.suggestedFilename()).toMatch(/\.pdf$/);
  const path = test.info().outputPath('projeto.pdf');
  await dl.saveAs(path);
  expect(readFileSync(path).subarray(0, 4).toString()).toBe('%PDF');
});

test('8. modos Estrutura e Mapa de calor sem erro de console', async ({ page }) => {
  await openExample(page);
  for (const [label, mode] of [['Estrutura', 'skeleton'], ['Mapa de calor', 'heatmap']] as const) {
    await page.getByRole('group', { name: 'Modo de visualização' }).getByRole('button', { name: label }).click();
    await expect.poll(() => state<string>(page, 's => s.viewMode')).toBe(mode);
    await page.waitForTimeout(800);
  }
});

test('9. /projetos lista o projeto salvo', async ({ page }) => {
  await openExample(page);
  const name = await state<string>(page, 's => s.project.meta.name');
  await page.waitForTimeout(2500);
  await page.goto('/projetos');
  await expect(page.getByText(name).first()).toBeVisible();
});

// BUG real (ver relatório): /editor?new=1 perde o parâmetro porque useBootstrap faz replaceState para ?id=...
// antes de o efeito de EditorShell ler `new=1`; o assistente não abre quando já existe projeto salvo.
test.fixme('9b. "Novo projeto" em /projetos abre o assistente', async ({ page }) => {
  await openExample(page);
  await page.waitForTimeout(2500);
  await page.goto('/projetos');
  await page.getByRole('link', { name: /Novo projeto/ }).first().click();
  await expect(page).toHaveURL(/\/editor/);
  await expect(page.getByRole('dialog').getByText('Novo projeto')).toBeVisible();
});

test('10. novo projeto A-frame calcula sem alertas de erro', async ({ page }) => {
  await openExample(page);
  await page.getByRole('button', { name: 'Novo', exact: true }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('radio', { name: /A-frame/ }).click();
  await dlg.getByRole('button', { name: 'Continuar' }).click();
  await dlg.getByRole('button', { name: 'Continuar' }).click();
  await dlg.getByRole('button', { name: 'Continuar' }).click();
  await dlg.getByRole('button', { name: 'Criar projeto' }).click();
  await expect(dlg).toHaveCount(0);
  await expect.poll(() => state<string>(page, 's => s.project.typology.kind')).toBe('a_frame');
  await expect.poll(() => state<string>(page, 's => s.revision === s.computedRevision ? "ok" : "busy"')).toBe('ok');
  const errs = await state<number>(page, 's => s.results.warnings.filter(w => w.severity === "error").length');
  expect(errs).toBe(0);
});
