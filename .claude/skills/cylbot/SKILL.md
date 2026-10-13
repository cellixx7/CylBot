---
name: cylbot
description: Fluxos de desenvolvimento do CYLBOT (bot discord.js CommonJS, API node:http, web React/Vite, PostgreSQL/Drizzle, OpenRouter, Spotify). Use ao criar ou alterar slash commands, botões/modais, eventos, rotas /api, services, repositories, migrations, features de IA (Texta_AI, TicketAI, anúncios) ou a integração Spotify neste repositório.
---

# CYLBOT

As regras invioláveis estão no `CLAUDE.md` da raiz. `docs/architecture.md` é a fonte da arquitetura; consulte-o antes de mudanças estruturais em vez de duplicá-lo.

## Fluxo

1. Identifique o tipo de mudança e abra **somente** a referência correspondente:

   | Mudança | Referência | Skill auxiliar (só se necessário) |
   | --- | --- | --- |
   | Feature nova, comando, botão/modal, rota `/api`, tela web | `references/new-feature.md` | `react-expert` para UI |
   | Discord: intents, permissões, componentes, eventos, deploy de comandos | `references/discord.md` | `discord-developers` para campos/limites da API |
   | IA: prompt, schema, modelo, política, erros do OpenRouter | `references/openrouter.md` | `prompt-engineer` |
   | Tabela, coluna, índice, migration, repository | `references/database.md` | `postgres-pro` |
   | Spotify / presence | `references/spotify.md` | — |

2. Leia o código vizinho da feature mais parecida (tickets, perfil, anúncios) e siga o mesmo estilo.
3. Escreva ou atualize o teste `node:test` com substitutos locais; nunca chame Discord, OpenRouter ou Spotify reais em teste.
4. Valide com os comandos do `CLAUDE.md` e `git diff --check`. Se tocar `bot/src/commands`, lembre o usuário de rodar `npm --prefix bot run commands:register`.
5. Se a mudança alterar arquitetura, contratos ou variáveis de ambiente, atualize `docs/` e `bot/.env.example`.

## Antes de concluir

- Rodar `/security-review` (ou a skill `security-reviewer`) quando a mudança tocar auth, sessões, cookies, CORS, transcripts ou entrada de usuário renderizada como HTML.
- Commits no padrão `tipo(escopo): descrição` (ex.: `feat(profile): ...`, `fix(ci): ...`).
