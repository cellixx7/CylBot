# Nova feature no CYLBOT

Fluxo: `Command / Route / Event → Handler → Service → Repository/Provider`. Use só as camadas necessárias; comando trivial (`/ping`) responde direto.

## Checklist

1. **Service** em `bot/src/services/<nome>Service.js` (ou `bot/src/<Feature>/services/` para features grandes como `Ticket/`).
   - Classe com colaboradores no construtor: `new ProfileService({ repository, users, plans, client })`.
   - Recebe dados simples (`{ guildId, userId, ... }`), valida, aplica autorização de domínio.
   - Erros esperados pelo cliente: `clientError(status, mensagem)` / `codedClientError(status, CODE, mensagem)` de `bot/src/api/http/errors.js`.
2. **Repository** (se persistir) em `bot/src/repositories/postgres<Nome>Repository.js`. Repository opcional: o service aceita `null` quando não há `DATABASE_URL` se a feature tiver fallback. Ver `database.md`.
3. **Composição**: instanciar em `bot/src/app/createServices.js` e expor no objeto retornado. Nunca instanciar em handler/rota.
4. **Slash command** em `bot/src/commands/<nome>.js`:
   ```js
   const { SlashCommandBuilder } = require('discord.js');
   module.exports = {
     data: new SlashCommandBuilder().setName('nome').setDescription('Descrição em português'),
     async execute(interaction) { /* commandHandler passa só a interaction: use interaction.client.services.<x> */ },
   };
   ```
   Registrar em `bot/src/commands/index.js` (fonte única usada pelo runtime e por `scripts/deploy-commands.js`).
5. **Botões/modais/selects**: handler em `bot/src/handlers/<nome>Handler.js` exportando `handle<Nome>Interaction(interaction, services) → boolean`.
   - Prefixo de `customId` próprio (`profile:`, `ann:`, `texta_ai:`): `action:id` após o prefixo. Retorne `false` cedo se o prefixo não for seu.
   - Adicionar ao array em `bot/src/handlers/interactionHandlers.js` (a ordem importa: o primeiro que retornar `true` consome).
   - Confira que o `userId` do `customId` é `interaction.user.id` quando a ação for pessoal.
6. **Rota HTTP** em `bot/src/api/routes/<nome>Routes.js`:
   ```js
   async function handle(request, response, { services, client, session }) {
     const url = new URL(request.url, 'http://localhost');
     if (!url.pathname.startsWith('/api/<nome>')) return false;
     const session = requireSession(request, services);
     // readJson(request) para corpo; sendJson(response, status, body)
     return true;
   }
   module.exports = { handle };
   ```
   Registrar no array `routes` de `bot/src/api/server.js`. O servidor já aplica CORS, headers de segurança, rate limit e `requireTrustedOrigin` em métodos mutáveis. Respostas com dados de usuário: `Cache-Control: no-store`.
7. **Web**: módulo `web/src/<feature>/<feature>Api.js` usando `readJson`/`apiError` de `web/src/lib/readApi.js` com mapa de mensagens em português; `fetch` com `credentials: 'include'`. Componente cuida de apresentação; coordenação vai para um hook se crescer. Regras de negócio ficam no backend.
8. **Testes**: `bot/test/<nome>.test.js` com fakes passados no construtor (veja `textaAIService.test.js`). Testes Postgres usam o padrão `*.postgres.test.js`.
9. **Config nova**: ler em `bot/src/config/env.js`, documentar em `bot/.env.example` e cobrir em `bot/test/env.test.js`.
