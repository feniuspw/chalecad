import { chromium, type FullConfig } from '@playwright/test';

/**
 * Aquece o `next dev`: a primeira compilação de /editor (e dos chunks do worker) dispara recargas
 * completas da página, o que derruba o primeiro teste que bate nela. Aqui absorvemos esse custo.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL ?? 'http://localhost:3110';
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const path of ['/', '/projetos', '/editor']) {
    await page.goto(baseURL + path);
    await page.waitForLoadState('networkidle').catch(() => undefined);
  }
  // espera o editor assentar (sem novas recargas)
  await page.waitForFunction(() => !!document.querySelector('header'), undefined, { timeout: 60_000 }).catch(() => undefined);
  await page.waitForTimeout(5000);
  await browser.close();
}
