import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { clickCanvas, expect, newScratchProject, openExample, openSection, planView, resultsTab, settled, state, test, totalCost } from './fixtures';

/** Marca um cômodo (ferramenta Cômodo) no centro da planta com o uso dado. Devolve o id do cômodo. */
async function markRoom(page: Page, use: string): Promise<string> {
  await planView(page);
  await page.keyboard.press('a');
  await expect.poll(() => state<string>(page, 's => s.tool')).toBe('room');
  await clickCanvas(page);
  await page.getByRole('menu', { name: 'Uso do cômodo' }).getByRole('menuitem', { name: use }).click();
  await expect.poll(() => state<number>(page, 's => s.project.rooms.length')).toBe(1);
  await settled(page);
  return state<string>(page, 's => s.project.rooms[0].id');
}

test('F1. cômodos: marcar Quarto mostra área no inspetor e rótulo na planta', async ({ page }) => {
  await newScratchProject(page);
  const id = await markRoom(page, 'Quarto');
  await expect.poll(() => state<string>(page, 's => s.selection?.kind + ":" + s.selection?.id')).toBe(`room:${id}`);
  const inspector = page.getByRole('complementary', { name: 'Propriedades' });
  await expect(inspector.getByText('Resumo')).toBeVisible();
  const area = await inspector.locator('dt', { hasText: /^Área$/ }).locator('xpath=following-sibling::dd[1]').innerText();
  expect(Number.parseFloat(area.replace(',', '.'))).toBeGreaterThan(0);
  expect(await state<number>(page, `s => s.results.model.rooms.find(r => r.id === "${id}").area`)).toBeGreaterThan(0);
  // rótulo na planta (HTML sobre o canvas)
  await expect(page.getByText(/^Quarto · [\d,.]+ m²$/)).toBeVisible();
});

test('F2. acabamentos: piso do cômodo e fachada entram no orçamento', async ({ page }) => {
  await newScratchProject(page);
  const id = await markRoom(page, 'Sala');
  const lines0 = await state<string[]>(page, 's => s.results.budget.lines.map(l => l.name)');
  const cost0 = await totalCost(page);
  // piso no inspetor do cômodo
  const inspector = page.getByRole('complementary', { name: 'Propriedades' });
  await inspector.getByRole('combobox', { name: 'Piso' }).click();
  await page.getByRole('option', { name: /Porcelanato/ }).click();
  await expect.poll(() => state<string>(page, `s => s.project.rooms.find(r => r.id === "${id}").floor`)).toBe('finish_floor_porcelain');
  // fachada nas propriedades do projeto
  await page.keyboard.press('Escape');
  await state(page, 's => s.select(null)');
  await openSection(page, /^Acabamentos/);
  await inspector.getByRole('combobox', { name: 'Fachada' }).click();
  await page.getByRole('option').nth(1).click();
  await expect.poll(() => state<string | undefined>(page, 's => s.project.finishes.facade')).toBeTruthy();
  await settled(page);
  const lines1 = await state<string[]>(page, 's => s.results.budget.lines.map(l => l.name)');
  expect(lines1.length).toBeGreaterThan(lines0.length);
  const floorLine = lines1.find((n) => /porcelanato/i.test(n));
  expect(floorLine, 'linha do piso no orçamento').toBeTruthy();
  expect(await totalCost(page)).not.toBe(cost0);
  await resultsTab(page, 'Orçamento');
  await expect(page.getByRole('tabpanel', { name: 'Orçamento' }).getByText('Acabamento', { exact: true }).first()).toBeVisible();
  await resultsTab(page, 'Materiais');
  await expect(page.getByRole('tabpanel', { name: 'Materiais' }).getByText(/porcelanato/i).first()).toBeVisible();
});

test('F3. móveis: biblioteca, girar, excluir e mobiliar', async ({ page }) => {
  await newScratchProject(page);
  await markRoom(page, 'Quarto');
  await page.keyboard.press('f');
  await expect.poll(() => state<string>(page, 's => s.tool')).toBe('furniture');
  const lib = page.getByRole('region', { name: 'Biblioteca de móveis' });
  await expect(lib).toBeVisible();
  await lib.getByRole('button', { name: /Cama de casal/ }).click();
  await expect.poll(() => state<string>(page, 's => s.toolOptions.furnitureItem')).toBe('furn_bed_double');
  // clica à direita do centro, fora da biblioteca que cobre a esquerda do canvas
  await clickCanvas(page, 60, 0);
  await expect.poll(() => state<number>(page, 's => s.project.furniture.length')).toBe(1);
  // o móvel aparece na lista do cômodo (inspetor do cômodo)
  await page.keyboard.press('Escape');
  await state(page, 's => s.select({ kind: "room", id: s.project.rooms[0].id })');
  const inspector = page.getByRole('complementary', { name: 'Propriedades' });
  await expect(inspector.getByRole('button', { name: /Cama de casal/ })).toBeVisible();
  // R gira, Delete remove
  await inspector.getByRole('button', { name: /Cama de casal/ }).click();
  const rot0 = await state<number>(page, 's => s.project.furniture[0].rotation ?? 0');
  await page.keyboard.press('r');
  await expect.poll(() => state<number>(page, 's => s.project.furniture[0].rotation ?? 0')).not.toBe(rot0);
  await page.keyboard.press('Delete');
  await expect.poll(() => state<number>(page, 's => s.project.furniture.length')).toBe(0);
  // Mobiliar adiciona pelo menos 2 itens
  await state(page, 's => s.select({ kind: "room", id: s.project.rooms[0].id })');
  await inspector.getByRole('button', { name: 'Mobiliar' }).click();
  await expect.poll(() => state<number>(page, 's => s.project.furniture.length')).toBeGreaterThanOrEqual(2);
});

test('F4. ajustar às normas: contagens antes/depois; aplicar e desfazer volta o custo', async ({ page }) => {
  await openExample(page);
  // projeto com problemas: vão grande com perfil fraco
  await state(page, 's => s.update("Piorar", d => { d.typology.width = 9; d.typology.length = 12; })');
  await settled(page);
  const cost0 = await totalCost(page);
  await resultsTab(page, /^Alertas/);
  const btn = page.getByRole('tabpanel').getByRole('button', { name: 'Ajustar às normas' });
  await btn.click();
  const dlg = page.getByRole('dialog', { name: 'Ajustar às normas' });
  await expect(dlg.getByText('Verificações reprovadas')).toBeVisible();
  await expect(dlg.getByText('Alertas de atenção')).toBeVisible();
  await expect(dlg.getByText('Custo estimado')).toBeVisible();
  const apply = dlg.getByRole('button', { name: /^Aplicar/ });
  if (await apply.isDisabled()) test.skip(true, 'o projeto de exemplo não tem ajustes automáticos');
  await apply.click();
  await expect(dlg).toHaveCount(0);
  await settled(page);
  const cost1 = await totalCost(page);
  expect(cost1).not.toBe(cost0);
  await page.locator('body').click({ position: { x: 5, y: 450 } });
  await page.keyboard.press('Control+z');
  await settled(page);
  await expect.poll(() => totalCost(page)).toBe(cost0);
});

test('F5. instalações: ligar mostra a aba com circuitos', async ({ page }) => {
  await newScratchProject(page);
  await markRoom(page, 'Cozinha');
  await expect(page.getByRole('tab', { name: 'Instalações' })).toHaveCount(0);
  await state(page, 's => s.select(null)');
  await openSection(page, /^Instalações/);
  await page.getByRole('switch', { name: /Estimar instalações/ }).click();
  await expect.poll(() => state<boolean>(page, 's => s.project.installations.enabled')).toBe(true);
  await settled(page);
  await resultsTab(page, 'Instalações');
  expect(await state<number>(page, 's => s.results.installations.circuits.length')).toBeGreaterThanOrEqual(1);
  await expect(page.getByRole('tabpanel', { name: 'Instalações' }).getByText(/circuito/i).first()).toBeVisible();
});

test('F6. wood frame: KPI mostra Madeira e a lista tem peças de madeira', async ({ page }) => {
  await openExample(page);
  await openSection(page, /^Sistema construtivo/);
  await page.getByRole('group', { name: 'Sistema', exact: true }).getByRole('button', { name: 'Wood frame' }).click();
  await expect.poll(() => state<string>(page, 's => s.project.system.structure')).toBe('wood');
  await settled(page);
  await expect(page.getByText('Madeira', { exact: true }).first()).toBeVisible();
  expect(await state<number>(page, 's => s.results.quantities.woodM3')).toBeGreaterThan(0);
  await resultsTab(page, 'Materiais');
  await expect(page.getByRole('tabpanel', { name: 'Materiais' }).getByText(/madeira|pinus|eucalipto/i).first()).toBeVisible();
});

test('F7. desempenho: cartão da parede com U e energia solar com kWp', async ({ page }) => {
  await openExample(page);
  await resultsTab(page, /^Desempenho/);
  const panel = page.getByRole('tabpanel', { name: /Desempenho/ });
  await expect(panel.getByRole('heading', { name: /parede/i }).first()).toBeVisible();
  await expect(panel.getByText('Transmitância (U)').first()).toBeVisible();
  await openSection(page, /^Desempenho/);
  await page.getByRole('switch', { name: /Energia solar/ }).click();
  await expect.poll(() => state<boolean>(page, 's => s.project.performance.solar')).toBe(true);
  await settled(page);
  await expect(panel.getByText(/kWp/).first()).toBeVisible();
});

test('F8. obra: data de início e item comprado mudam o total pago', async ({ page }) => {
  await openExample(page);
  await resultsTab(page, /^Obra/);
  const panel = page.getByRole('tabpanel', { name: /Obra/ });
  await panel.getByLabel('Data de início da obra').fill('2027-03-01');
  await expect.poll(() => state<string | undefined>(page, 's => s.project.progress.startDate')).toBe('2027-03-01');
  await expect(panel.getByText('informe a data de início')).toHaveCount(0);
  const paid = () => panel.locator('dt', { hasText: /^Pago$/ }).locator('xpath=following-sibling::dd[1]').innerText();
  const paid0 = await paid();
  await panel.getByRole('button', { expanded: false }).first().click();
  await panel.getByRole('checkbox', { name: /^Comprado:/ }).first().check();
  await expect.poll(() => state<number>(page, 's => Object.keys(s.project.progress.purchased).length')).toBe(1);
  // marcar como comprado só entra em "Pago" quando o valor pago é informado
  await panel.getByRole('textbox', { name: /^Pago \(R\$\):/ }).first().fill('1500');
  await panel.getByRole('textbox', { name: /^Pago \(R\$\):/ }).first().press('Enter');
  await expect.poll(paid).not.toBe(paid0);
});

test('F9. apresentação: painel do sol e mudar a hora sem erro', async ({ page }) => {
  await openExample(page);
  await page.getByRole('group', { name: 'Modo de visualização' }).getByRole('button', { name: 'Apresentação' }).click();
  // o clique prepara em segundo plano (progresso e Cancelar) e só abre no "Abrir"; o modo não troca antes
  await expect(page.getByRole('status', { name: /Preparando a apresentação|Apresentação pronta/ })).toBeVisible();
  expect(await state<string>(page, 's => s.viewMode')).not.toBe('presentation');
  await page.getByRole('status', { name: 'Apresentação pronta' }).getByRole('button', { name: 'Abrir' }).click({ timeout: 45_000 });
  await expect.poll(() => state<string>(page, 's => s.viewMode')).toBe('presentation');
  const sun = page.locator('[aria-label="Painel do sol"]');
  await expect(sun).toBeVisible();
  const min0 = await state<number>(page, 's => s.sun.minutes');
  const slider = sun.getByRole('slider', { name: 'Hora do dia' });
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => state<number>(page, 's => s.sun.minutes')).not.toBe(min0);
  await page.waitForTimeout(1000);
});

test('F10. exportar DXF: download começa com SECTION', async ({ page }) => {
  await openExample(page);
  await page.getByRole('banner').getByRole('button', { name: /Exportar/ }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /DXF/ }).click()]);
  expect(dl.suggestedFilename()).toMatch(/\.dxf$/);
  const path = test.info().outputPath('projeto.dxf');
  await dl.saveAs(path);
  expect(readFileSync(path, 'utf8').replace(/\r\n/g, '\n').startsWith('0\nSECTION')).toBe(true);
});

