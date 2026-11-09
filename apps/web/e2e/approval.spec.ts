import { readFileSync } from 'node:fs';
import { expect, openExample, settled, state, test } from './fixtures';

test('Aprovação: dados, lote 12×30, verificação, parecer persistente e pacote .zip', async ({ page }) => {
  test.setTimeout(180_000);
  await openExample(page);

  // abre pela barra superior
  await page.getByRole('button', { name: 'Aprovação' }).click();
  const dlg = page.getByTestId('approval-dialog');
  await expect(dlg).toBeVisible();

  // dados: proprietário e lote 12 x 30
  await dlg.getByLabel('Nome do proprietário').fill('Maria Teste');
  await dlg.getByLabel('CPF/CNPJ do proprietário').fill('52998224725');
  await expect(dlg.getByLabel('CPF/CNPJ do proprietário')).toHaveValue('529.982.247-25');
  await dlg.getByTestId('lot-create').click();
  await expect(dlg.getByTestId('lot-preview')).toBeVisible();
  const front = dlg.getByLabel('Testada (largura)');
  await front.fill('12');
  await front.press('Enter');
  const depth = dlg.getByLabel('Profundidade', { exact: true });
  await depth.fill('30');
  await depth.press('Enter');
  await expect.poll(() => state<string>(page, 's => s.project.legal.owner.name + "|" + s.project.legal.lot.front + "x" + s.project.legal.lot.depth')).toBe('Maria Teste|12x30');
  await settled(page);

  // verificação: índices urbanísticos (com o motor da aprovação) ou o estado vazio, sem erro
  await dlg.getByRole('tab', { name: 'Verificação' }).click();
  const hasApproval = await state<boolean>(page, 's => !!s.results.approval');
  if (hasApproval) {
    await expect(dlg.getByTestId('approval-compliance')).toBeVisible();
    await expect(dlg.getByTestId('urban-indices')).toBeVisible();
  } else {
    await expect(dlg.getByTestId('compliance-empty')).toBeVisible();
  }

  // parecer "Aceito" num item (com o motor da aprovação) e persistência ao recarregar
  let reviewId = '__e2e.item';
  const first = dlg.getByTestId('compliance-item').first();
  if (hasApproval && (await first.count()) > 0) {
    reviewId = (await first.getAttribute('data-id'))!;
    await first.getByRole('button', { name: 'Aceito' }).click();
  } else {
    await state(page, `s => s.update("Dados legais: parecer", d => { d.legal.reviews["${reviewId}"] = { status: "accepted", note: "", at: "2026-11-09" }; })`);
  }
  await expect.poll(() => state<string>(page, `s => s.project.legal.reviews["${reviewId}"]?.status`)).toBe('accepted');
  // espera o autosave gravar
  await expect.poll(() => state<boolean>(page, 's => !s.dirty'), { timeout: 15_000 }).toBe(true);
  await page.reload();
  await page.waitForFunction(() => !!(window as unknown as { __editor?: { getState: () => { results?: unknown } } }).__editor?.getState().results);
  await expect.poll(() => state<string>(page, `s => s.project.legal.reviews["${reviewId}"]?.status`)).toBe('accepted');
  await expect.poll(() => state<string>(page, 's => s.project.legal.owner.name')).toBe('Maria Teste');

  // camada Lote na planta (L): liga sem erro de console
  await page.getByRole('group', { name: 'Vistas' }).getByRole('button', { name: 'Planta' }).click();
  await expect.poll(() => state<string>(page, 's => s.cameraView')).toBe('plan');
  await page.getByRole('button', { name: /^Lote/ }).click();
  await expect(page.getByRole('button', { name: /^Lote/ })).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(800);

  // exportar o pacote
  await page.keyboard.press('Shift+A');
  const dlg2 = page.getByTestId('approval-dialog');
  await expect(dlg2).toBeVisible();
  await dlg2.getByRole('tab', { name: 'Exportar' }).click();
  const download = page.waitForEvent('download', { timeout: 120_000 });
  await dlg2.getByTestId('export-package').click();
  const confirm = dlg2.getByTestId('export-confirm');
  if (await confirm.waitFor({ timeout: 3000 }).then(() => true, () => false)) await confirm.getByRole('button', { name: 'Exportar mesmo assim' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^aprovacao-.+-\d{4}-\d{2}-\d{2}\.zip$/);
  const path = await file.path();
  const buf = readFileSync(path);
  expect(buf.readUInt32LE(0)).toBe(0x04034b50); // assinatura de zip
  const names = buf.toString('latin1');
  expect(names).toContain('LEIA-ME.txt');
  expect(names).toContain('projeto.chalecad.json');
  const readme = buf.toString('utf8');
  expect(readme).toContain('PACOTE DE APROVAÇÃO');
});
