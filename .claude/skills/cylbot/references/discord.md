# Discord no CYLBOT

Para campos, limites e enums da API do Discord, consulte a skill `discord-developers` (abra uma referência por vez via `references/INDEX.md`). Este arquivo cobre só como o CYLBOT usa o Discord.

## Bootstrap e intents

- `bot/src/index.js` cria o client com `Guilds`, `GuildVoiceStates`, `GuildMessages`; `MessageContent` só entra quando `TICKETS_MESSAGE_CONTENT_ENABLED=true` (intent privilegiado: precisa estar ligado no Developer Portal).
- Não adicione intents sem necessidade; se precisar, condicione a uma config e documente em `bot/.env.example`.

## Comandos

- Fonte única: `bot/src/commands/index.js`. Registro global via `npm --prefix bot run commands:register` (`Routes.applicationCommands`). Propagação global pode levar alguns minutos.
- Não registrar comandos no `ready` nem a cada inicialização.

## Interações

- `events/interactionCreate.js` percorre `handlers/interactionHandlers.js`; se nenhum consumir, despacha slash command por `handlers/commandHandler.js`.
- Responder em até 3 s: use `deferReply({ ephemeral: true })` antes de chamar IA, banco ou REST lento, depois `editReply`.
- `showModal` precisa ser a primeira resposta da interação (sem defer antes).
- Mensagens com texto de usuário: `allowedMentions: { parse: [] }` e `escapeMarkdown` (padrão em `profileHandler.js`).
- Limites usados com frequência: embed description 4096, field value 1024, até 5 action rows, 5 botões por row, 25 opções por select, `customId` até 100 caracteres.

## Eventos

`bot/src/events/` (um arquivo por evento: `name`, `execute`). Mensagens de ticket entram por `messageCreate` → `services.ticketMessageInbound`.

## REST e OAuth

- OAuth Web: `providers/discordOAuthProvider.js` (scopes, troca de token, `getCurrentUserGuilds`). Callback fixo em `/api/auth/discord/callback` na mesma origem da web.
- Erros de leitura do Discord: `providers/discordReadErrors.js` + `docs/discord-read-resilience.md`.
