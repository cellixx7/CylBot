# Message Core de tickets — Etapa 3.5

O PostgreSQL é a fonte de verdade da conversa dos tickets. Discord é uma interface e um mecanismo de entrega; a futura interface Web consumirá o mesmo `TicketMessageService`.

```text
Discord inbound ─┐
Web/API ─────────┼→ TicketMessageService → ticket_messages
IA ──────────────┘             │
                               ├→ contexto da IA
                               ├→ transcript
                               └→ Discord delivery
```

Não há chat React nesta etapa. As routes permitem validar o backend com polling e preparar a Etapa 4 sem redefinir autoria, histórico, idempotência ou autorização.

## Modelo persistente

`ticket_messages` vincula cada mensagem ao ticket e à guild. O conteúdo é texto simples, limitado pelo backend; HTML fornecido pelo usuário não recebe tratamento especial e continua escapado no transcript.

| Conceito | Valores | Significado |
| --- | --- | --- |
| `origin` | `DISCORD`, `WEB`, `AI`, `SYSTEM` | Interface ou componente que originou a mensagem |
| `authorType` | `USER`, `STAFF`, `AI`, `SYSTEM` | Papel canônico do autor |
| `visibility` | `PUBLIC`, `INTERNAL`, `SYSTEM` | Público do ticket; equipe; ou apresentação do sistema |
| `deliveryStatus` | `PENDING`, `SENDING`, `SENT`, `FAILED`, `NOT_REQUIRED` | Estado da entrega ao Discord |

Origem e autoria são independentes: uma mensagem `origin=WEB` pode ter `authorType=USER` ou `STAFF`. O navegador não escolhe nome, ID nem papel; a sessão fornece a identidade e o backend consulta o membro atual pelo bot.

O limite de armazenamento é 2.000 caracteres. O POST Web aceita até 1.800 para reservar espaço à identificação visual publicada pelo bot. Upload/anexos Web não são suportados nesta etapa; o schema pode ser ampliado depois sem alterar a identidade da mensagem.

## Idempotência e entrega

- `(ticket_id, client_message_id)` é único quando o client ID existe. Retry HTTP devolve a mesma mensagem.
- `(guild_id, discord_message_id)` é único quando o ID Discord existe. O mesmo `messageCreate` não é ingerido duas vezes.
- A mensagem Web/IA é persistida como `PENDING` antes da rede.
- Uma atualização curta reserva a tentativa como `SENDING`; só então o adapter chama Discord.
- Outra atualização curta grava `SENT` ou `FAILED`.
- A conclusão é condicionada ao número da tentativa: uma chamada antiga não pode sobrescrever o resultado de um recovery mais novo.
- `deliveryAttempts` e um código técnico limitado permitem diagnóstico sem armazenar payload ou mensagem de erro arbitrária.
- Uma entrega `SENDING` abandonada pode ser retomada após 60 segundos. O nonce Discord deriva do UUID canônico, evitando criar uma segunda mensagem na retomada.

Não existe transação distribuída. Uma queda depois do envio e antes de `SENT` deixa estado recuperável; `retryDelivery()` reutiliza a mesma mensagem canônica. Não há worker automático nesta etapa.

## Discord inbound

`messageCreate` continua ignorando DMs, bots, webhooks e mensagens de sistema. Para uma mensagem humana:

```text
channelId → ticket persistido → VIEW/autoria → insert idempotente → consumidor IA
```

A IA nunca recebe o evento antes da persistência. Mensagens produzidas pelo próprio Core são inseridas diretamente e não dependem de reler o evento do bot, evitando loops.

## Autorização e visibilidade

As permissões `VIEW` e `RESPOND` ficam em `TicketPermissionService`:

- criador: vê e responde no próprio ticket ativo;
- cargo em `supportRoleIds`: vê e responde, mesmo sem ManageGuild;
- ManageGuild/Administrator: permanece staff/admin;
- outro usuário: não acessa o ticket.

Routes de conversa seguem `sessão → membership OAuth → ticket → TicketPermissionService`. Configuração administrativa continua usando `requireManageableGuild()`. OAuth comprova membership da sessão; o bot consulta `guild.members.fetch()` para obter cargos atuais. `PUBLIC` é visível ao criador e à equipe; `INTERNAL` e `SYSTEM` são filtradas para o criador. Não há UI de nota interna.

## API para a futura Web

| Método | Route | Contrato |
| --- | --- | --- |
| GET | `/api/tickets/:ticketId/messages?guildId=...&limit=50&before=<uuid>` | Página ordenada por `createdAt` e UUID; limite de 1 a 100 |
| POST | `/api/tickets/:ticketId/messages` | `{ guildId, clientMessageId, content }`; persiste e tenta entregar |

As duas routes exigem sessão e membership real. POST exige Origin confiável. A resposta não expõe `deliveryErrorCode`, tentativas, IDs internos do Discord, logs ou mensagens internas sem autorização.

## IA, transcript e legado

`TicketAIContextService` lê as últimas 12 mensagens públicas do Message Core, mantendo 700 caracteres por mensagem e 6.000 no conjunto. Mensagens Discord, Web e IA participam da mesma ordem canônica.

`TicketTranscriptService` usa mensagens públicas canônicas quando elas existem. `INTERNAL` não entra no transcript entregue ao usuário. Tickets anteriores à migration podem não ter linhas em `ticket_messages`; nesses casos o service usa fallback explícito para o histórico disponível no Discord. Na primeira mensagem Discord ou Web de um ticket ativo ainda vazio, `syncDiscordHistory()` importa o canal sob demanda e de forma idempotente antes de continuar. Não ocorre importação global no startup e HTMLs antigos não são migrados.

O import usa `origin=DISCORD` e `discordMessageId` para idempotência, ordena por snowflake antes do insert e aceita conflitos sem duplicar linhas. Uma linha isolada de IA/sistema não é tratada como prova de sincronização legada; a fronteira só existe depois de mensagem Discord/Web. Mensagens antigas do próprio bot são classificadas como `SYSTEM`; não se tenta reconstruir retroativamente se eram respostas de IA. O fallback não afirma que um histórico ainda não sincronizado está no banco.

## Eventos seguros

São registrados `ticket.message.persisted`, `delivery_started`, `delivered`, `delivery_failed`, `ingested` e `duplicate`, apenas com ticket, guild, mensagem, origem e estado. O conteúdo não entra nos logs.

## Smoke test backend

Depois de aplicar `npm --prefix bot run db:migrate` e iniciar bot/API:

1. Envie uma mensagem no canal do ticket e confirme uma linha `origin=DISCORD`, `delivery_status=SENT` em `ticket_messages`.
2. Faça POST autenticado em `/api/tickets/:ticketId/messages` com um `clientMessageId` novo; confirme persistência e publicação no Discord.
3. Repita o POST com o mesmo `clientMessageId`; confirme o mesmo UUID e somente uma linha.
4. Simule falha de entrega; confirme `FAILED` e que a conversa continua armazenada.
5. Execute retry pelo service/teste operacional; confirme o mesmo UUID e `SENT`.
6. Envie mensagem Web e gere uma sugestão IA; confirme que o contexto inclui Discord, Web e IA na ordem.
7. Feche um ticket novo e verifique o transcript multicanal. Feche um ticket antigo sem linhas canônicas e confirme o fallback Discord.

Sessões Web continuam em memória: reiniciar o backend exige novo login. Polling será suficiente para a primeira versão do chat; SSE/WebSocket, anexos, worker de recovery e UI React permanecem fora do escopo.
