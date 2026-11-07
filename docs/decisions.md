# Decisões de arquitetura (registro)

Decisões tomadas pelo orquestrador com autonomia dada pelo usuário em 2026-11-07.

0. **Local do repositório:** o projeto começou em `~/Documents/Projects/chalecad`, mas o macOS bloqueou o acesso da sessão a `~/Documents` no meio da Fase 0. O trabalho continuou em `~/Developer/chalecad` e, com o acesso de volta, o repositório voltou para `~/Documents/Projects/chalecad`. A spec completa original está em `docs/spec.md`; o resumo operacional ficou em `docs/spec-resumo.md`.
1. **pnpm 11.5** (instalado) em vez de pnpm 9; **TypeScript 5.9** (o 7.0 nativo ainda é novo demais para Next/ESLint); **ESLint 9**; **Vitest 4**; **Zod 4**; **Next 16**, **React 19.3**, **three 0.187**, **R3F 9**, **drei 10**, **Tailwind 4**.
2. **Paredes externas, empenas e águas do telhado são derivadas da tipologia**, não salvas no JSON, com IDs estáveis (`ext-front`, `ext-back`, `ext-left`, `ext-right`, `roof-a`, `roof-b`, `wing-*`). Aberturas referenciam esses IDs em `host`. `walls` guarda só paredes do usuário.
3. **Schema v1 cobre todas as fases** (tipologias das Fases 2/3, terreno da Fase 4, extras, premissas estruturais e de orçamento). O motor ignora o que ainda não implementa e gera alerta.
4. **Preços editados ficam no projeto** (`priceOverrides`), sobre a base `priceBookId`: projeto reaberto reproduz os mesmos resultados.
5. **Mão de obra paramétrica por etapa** (R$/m² ou R$/kg, na base de preços), zerada nas etapas "eu faço".
6. **Paredes renderizadas com `ExtrudeGeometry` + furos** para aberturas, em vez de CSG.
7. **Banco:** `DATA_MODE=sqlite` usa Drizzle + better-sqlite3 em `./data/chalecad.sqlite`; autosave local em IndexedDB. Sem login no modo local.
8. **Paralelismo:** a regra "nunca 2 subagents no mesmo pacote" foi relaxada para `apps/web` quando os cards têm pastas disjuntas e as dependências já estão no main.
9. **Flechas** no catálogo como denominador (L/350 → 350). **Seções** dos perfis com cantos arredondados (raio da linha média = 2t).
10. **Worktrees** dos agentes em `../chalecad-wt/<card>` (fora do repositório), criados pelo orquestrador.
11. **Índice de aço:** o motor conta peça por peça o que modela. O chalé 6,5 x 8,5 da spec, com montantes a 60 cm e cobertura em caibros (sem tesouras nem forro), dá cerca de 16 kg/m²; com 40 cm, cerca de 19 kg/m². A faixa 21,9–24,7 kg/m² da literatura vale para residências com tesouras e forro estruturado. Mantivemos a faixa como alerta (não ajustamos o motor para "caber"). Caibros seguem a modulação dos montantes (estrutura alinhada).
