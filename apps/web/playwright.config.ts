import { defineConfig, devices } from '@playwright/test';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const PORT = 3110;
const dbPath = join(tmpdir(), 'chalecad-e2e', 'e2e.sqlite');

// Banco temporário limpo a cada execução. Fica fora do projeto: arquivos mudando dentro de apps/web
// fazem o watcher do Next dev recarregar a página em loop.
rmSync(dirname(dbPath), { recursive: true, force: true });
mkdirSync(dirname(dbPath), { recursive: true });

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  outputDir: './test-results/artifacts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `pnpm --filter @chalecad/web dev --port ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { CHALECAD_DB_PATH: dbPath, DATA_MODE: 'sqlite', AI_ENABLED: 'false' },
  },
});
