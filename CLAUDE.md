# CYLBOT

Bot Discord + API HTTP + web. Monorepo com dois pacotes npm independentes: `bot/` (discord.js 14, API `node:http` na porta 3001, PostgreSQL/Drizzle, OpenRouter, Spotify) e `web/` (React 19 + Vite, proxy `/api` → 3001). Arquitetura em `docs/architecture.md`.

## Regras invioláveis

- `bot/` é **CommonJS** (`require`/`module.exports`); `web/` é ESM. Não converter, não introduzir TypeScript.
- Testes com **`node:test`** + `node:assert/strict` (`bot/test/*.test.js`, `web/test/*.test.js`). Não usar Jest/Vitest.
- Sem frameworks HTTP (Express/Fastify): rotas seguem `handle(request, response, context) → boolean` e são registradas em `bot/src/api/server.js`.
- `process.env` só é lido em `bot/src/config/env.js`; o resto recebe `config`.
- Services são criados apenas em `bot/src/app/createServices.js`. Handlers e rotas recebem `services`; services recebem dados simples, nunca `Interaction`/`request`.
- Autorização fica no service (Discord e Web chamam as mesmas regras). O modelo de IA nunca recebe ferramentas nem decide permissões.
- Nunca registrar segredos, tokens ou conteúdo bruto de erro do provider; use `logger` de `bot/src/lib/logger.js` com eventos `modulo.evento`.
- Textos para usuário, documentação e comentários em português.

## Comandos

```bash
npm --prefix bot test
npm --prefix web test
npm --prefix web run build
npm --prefix bot run db:status
```

Banco local: `docker compose up -d`, depois `npm --prefix bot run db:migrate`.

## Skills

Para criar ou alterar features, comandos, rotas, migrations, IA ou Spotify, use a skill `cylbot` (`.claude/skills/cylbot/`). Skills auxiliares e como instalá-las: `docs/claude-code.md`.
