# ADR 007 — Tipagem via JSDoc + `// @ts-check`

**Status:** Accepted
**Data:** 2026-05-14

## Contexto

TypeScript oferece inferência poderosa e refactor seguro, mas exige:
- Build step
- Source maps em produção
- Configuração `tsconfig.json`
- Watch mode em dev
- Tooling adicional

A solução tem ~1.500 LOC frontend + 1.000 LOC backend — escopo onde JSDoc oferece 80% do valor com 0% do custo.

## Decisão

1. Cada arquivo `.js` inicia com `// @ts-check`
2. Funções públicas anotadas com JSDoc `@param` / `@returns`
3. Typedefs explícitos para objetos complexos (`@typedef`)
4. VSCode/IDEs validam em tempo real

## Consequências

**Positivas:**
- Validação estática sem build
- Editor com auto-completar e go-to-definition
- Erros pegos no save

**Negativas:**
- Sem features avançadas de TS (decorators, enums, etc.)
- Sintaxe JSDoc verbosa em alguns casos

## Migração futura

Se a solução crescer > 10k LOC, considerar migrar:
1. Renomear `.js` → `.ts`
2. Adicionar `tsconfig.json` com `allowJs: true`
3. Build via esbuild para `dist/`
4. Atualizar imports do servidor para `dist/`

Por ora, JSDoc cobre o caso de uso.
