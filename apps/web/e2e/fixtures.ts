import { expect, test as base, type Page } from '@playwright/test';

/** Erros de console esperados: 404 de /api/projects/<id> quando o projeto só existe no navegador. */
function isExpected(url: string, text: string): boolean {
  // Ruído conhecido do drei <Html> (menus e rótulos HTML sobre o canvas) com React 19: o cleanup desmonta a raiz durante o render.
  if (/Attempted to synchronously unmount a root while React was already rendering/.test(text)) return true;
  return /\/api\/projects\/[^/?]+$/.test(url) && /404/.test(text);
}

export type EditorWindow = { __editor?: { getState: () => { results?: unknown } } };

export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error' && !isExpected(m.location().url, m.text())) errors.push(`${m.text()} (${m.location().url})`);
      });
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      await use(errors);
      // Encerra a página antes do teste seguinte: um autosave pendente chegaria ao servidor depois da limpeza
      // do beforeEach e o próximo teste abriria o projeto antigo em vez do primeiro acesso.
      await page.goto('about:blank').catch(() => undefined);
      await new Promise((r) => setTimeout(r, 300));
      expect(errors, 'erros de console inesperados').toEqual([]);
    },
    { auto: true },
  ],
});

test.beforeEach(async ({ request }) => {
  // O servidor SQLite é compartilhado entre testes; o navegador começa limpo (IndexedDB novo).
  // Autosaves do teste anterior ainda chegam ao servidor depois da primeira limpeza: só segue quando duas
  // leituras seguidas, com pausa entre elas, vierem vazias.
  let empty = 0;
  for (let pass = 0; pass < 10 && empty < 2; pass++) {
    const list = (await (await request.get('/api/projects')).json()) as { id: string }[];
    for (const p of list) await request.delete(`/api/projects/${p.id}`);
    empty = list.length === 0 ? empty + 1 : 0;
    await new Promise((r) => setTimeout(r, 500));
  }
});

export { expect };

export const BRL_TOTAL = /R\$\s?[\d.]+(,\d+)?/;

/** Abre o editor no primeiro acesso e fecha o assistente com o chalé de exemplo. */
export async function openExample(page: Page) {
  await page.goto('/editor');
  // Normalmente é o primeiro acesso. Se um projeto do teste anterior ainda aparece na lista (autosave tardio), o editor
  // já abre o chalé padrão (o mesmo modelo do exemplo) sem o assistente.
  const welcome = page.getByRole('button', { name: 'Usar o chalé de exemplo' });
  if (await welcome.waitFor({ timeout: 6000 }).then(() => true, () => false)) await welcome.click();
  await expect(page.getByText('Custo total estimado')).toBeVisible();
  await page.waitForFunction(() => !!(window as unknown as EditorWindow).__editor?.getState().results);
}

export const state = <T>(page: Page, fn: string): Promise<T> => page.evaluate(`(${fn})(window.__editor.getState())`) as Promise<T>;

/** Texto do custo total (KPI em destaque). */
export async function totalCost(page: Page): Promise<string> {
  const t = await page.getByText('Custo total estimado').locator('xpath=following-sibling::p[1]').innerText();
  return t.trim();
}

/** Abre o editor, descarta o assistente de primeiro acesso e cria um projeto "Do zero" (tipologia padrão). */
export async function newScratchProject(page: Page) {
  await page.goto('/editor');
  const dlg = page.getByRole('dialog');
  // Normalmente é o primeiro acesso (assistente aberto). Se um autosave do teste anterior chegou ao servidor
  // depois da limpeza, o editor abre o projeto salvo; nesse caso o botão "Novo" abre o mesmo diálogo.
  const welcome = await dlg.getByText('Bem-vindo ao ChaléCAD').waitFor({ timeout: 4000 }).then(() => true, () => false);
  if (!welcome) await page.getByRole('button', { name: 'Novo', exact: true }).click();
  await dlg.getByRole('tab', { name: 'Do zero' }).click();
  await dlg.getByRole('button', { name: 'Continuar' }).click();
  await dlg.getByRole('button', { name: 'Continuar' }).click();
  await dlg.getByRole('button', { name: 'Continuar' }).click();
  await dlg.getByRole('button', { name: 'Criar projeto' }).click();
  await expect(dlg).toHaveCount(0);
  await expect(page.getByText('Custo total estimado')).toBeVisible();
  await page.waitForFunction(() => !!(window as unknown as EditorWindow).__editor?.getState().results);
}

/** Espera o cálculo do worker alcançar a última edição. */
export const settled = (page: Page) => page.waitForFunction(() => {
  const s = (window as unknown as { __editor: { getState: () => { revision: number; computedRevision: number; results: unknown } } }).__editor.getState();
  return s.revision === s.computedRevision && !!s.results;
});

/** Expande uma seção do painel de propriedades (idempotente). */
export async function openSection(page: Page, title: RegExp) {
  const btn = page.getByRole('complementary', { name: 'Propriedades' }).getByRole('button', { name: title });
  if ((await btn.getAttribute('aria-expanded')) !== 'true') await btn.click();
}

/** Vista em planta e ponto da tela correspondente ao centro da edificação (+ deslocamento em px). */
export async function planView(page: Page) {
  await page.getByRole('group', { name: 'Vistas' }).getByRole('button', { name: 'Planta' }).click();
  await expect.poll(() => state<string>(page, 's => s.cameraView')).toBe('plan');
  await page.waitForTimeout(1200); // transição da câmera
}

export async function canvasPoint(page: Page, dx = 0, dy = 0): Promise<{ x: number; y: number }> {
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('canvas sem caixa');
  return { x: box.x + box.width / 2 + dx, y: box.y + box.height / 2 + dy };
}

export async function clickCanvas(page: Page, dx = 0, dy = 0) {
  const p = await canvasPoint(page, dx, dy);
  await page.mouse.move(p.x - 3, p.y - 3);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.mouse.click(p.x, p.y);
}

/** Aba dos resultados (painel direito). */
export const resultsTab = (page: Page, name: RegExp | string) => page.getByRole('tab', { name }).click();
