import { expect, test as base, type Page } from '@playwright/test';

/** Erros de console esperados: 404 de /api/projects/<id> quando o projeto só existe no navegador. */
function isExpected(url: string, text: string): boolean {
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
      expect(errors, 'erros de console inesperados').toEqual([]);
    },
    { auto: true },
  ],
});

test.beforeEach(async ({ request }) => {
  // O servidor SQLite é compartilhado entre testes; o navegador começa limpo (IndexedDB novo).
  const list = (await (await request.get('/api/projects')).json()) as { id: string }[];
  for (const p of list) await request.delete(`/api/projects/${p.id}`);
});

export { expect };

export const BRL_TOTAL = /R\$\s?[\d.]+(,\d+)?/;

/** Abre o editor no primeiro acesso e fecha o assistente com o chalé de exemplo. */
export async function openExample(page: Page) {
  await page.goto('/editor');
  await page.getByRole('button', { name: 'Usar o chalé de exemplo' }).click();
  await expect(page.getByText('Custo total estimado')).toBeVisible();
  await page.waitForFunction(() => !!(window as unknown as EditorWindow).__editor?.getState().results);
}

export const state = <T>(page: Page, fn: string): Promise<T> => page.evaluate(`(${fn})(window.__editor.getState())`) as Promise<T>;

/** Texto do custo total (KPI em destaque). */
export async function totalCost(page: Page): Promise<string> {
  const t = await page.getByText('Custo total estimado').locator('xpath=following-sibling::p[1]').innerText();
  return t.trim();
}
