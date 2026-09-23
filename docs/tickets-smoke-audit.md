# Auditoria pós smoke test de tickets — Etapa 2

Baseline: `f822147` (`feat(ticket): harden ticket lifecycle and recovery`), sobre `562364d` (`feat(database): add PostgreSQL persistence foundation`). Auditoria realizada em 23/09/2026.

O working tree já continha alterações em `README.md`, exclusão de `PROMPT-FRONNT.md` e `README-VERIFICACAO.md` não rastreado. Essas alterações foram preservadas. Nenhuma alteração de schema ou configuração de credenciais foi necessária.

## Causas e limites da evidência

| Código | Origem auditada | Conclusão |
| --- | --- | --- |
| 409 | Claim já atribuído (`TicketAlreadyClaimedError`), disputa de claim no repository, operação simultânea na guild, estado/ciclo inválido, reconciliação e verificações de fechamento/delete | Claim duplicado é comportamento esperado: mantém 409, resposta explicativa e nível `warn`. O trecho antigo após `ticket.claimed` é compatível com repetição do claim, mas não identifica a ação com certeza. |
| 500 | `TicketService.close` declarava `const ticket` e depois executava `ticket = await repository.beginClose(...)` | Bug reproduzido: `TypeError: Assignment to constant variable.`. O PostgreSQL grava o checkpoint antes da exceção; a tentativa seguinte encontra `closing` e pula a reatribuição, explicando o sucesso posterior. Alterado para `let`, sem remover checkpoints. |
| 429 | `TicketService.limits`: três tickets ativos ou intervalo de 60 segundos entre aberturas; `reopen`: intervalo de 60 segundos após fechamento | No handler anterior, somente erros controlados preservavam 429; erros SDK não controlados viravam 500. Portanto, esse 429 é compatível com limite interno, não evidência de HTTP 429 do Discord. O trecho fornecido não permite escolher qual cooldown/limite foi atingido. |

Permissões normalmente produzem 403; ticket ausente/outra guild produz 404. Erros inesperados de repository, SDK e resposta da interação chegam como 500. Falhas durante a etapa de transcript/log/bloqueio do fechamento são encapsuladas em 503 para permitir retomada. A causa técnica desse 503 agora é preservada no diagnóstico, sem serializar mensagens ou payloads.

O teste que reproduz o 500 foi executado antes da correção e falhou precisamente na reatribuição de `ticket`. Depois da correção, passa no primeiro fechamento. Isso comprova o defeito nesse caminho; os logs históricos sem ação/error class não permitem atribuir todo 500 observado à mesma causa.

Também havia uma falha anterior na instância iniciada pela assistência: o Discord devolveu código `40060` (interação já reconhecida), e a tentativa de responder ao erro propagou outra exceção. O handler de tickets agora captura a falha de resposta e registra somente metadados seguros, impedindo que esse SDK error com payload chegue ao handler global por esse caminho. Não é possível concluir, somente com esse erro, por que a interação já havia sido reconhecida.

## Canal removido e divergência do log

Consulta somente de leitura ao PostgreSQL encontrou o ticket `36312c1d-f683-41ca-8d40-be3c307f6d1b`:

- Canal original arquivado, ciclo 0: `1552362696840716382`.
- `logChannelId`: `1552362502635921411`, exatamente o ID registrado no evento antigo.
- O registro atual está `CLOSED`, com `channelId=null`; também existe um arquivo de ciclo 1 após reabertura.

`removeChannel` já carregava o ticket do repository e passava esse ticket ao adapter, que buscava `ticket.channelId`. O evento antigo, porém, usava o parâmetro `channelId` da interação no log privado. O alvo do ciclo original era, portanto, `1552362696840716382`; o log mostrava o canal de onde o botão foi acionado. Não foi executada nova exclusão para realizar esta auditoria, nem consultado o audit log remoto do Discord.

**Existe risco de apagar canal errado?** O canal da interação não escolhe o alvo, tanto no baseline quanto após a correção. Entretanto, havia uma lacuna defensiva: um ID persistido inconsistente apontando para outro canal de texto da mesma guild não era comparado à identidade/ciclo do ticket. A correção bloqueia essa divergência. Não há caminho testado em que trocar apenas `interaction.channelId` ou o canal no custom ID redirecione a exclusão.

Antes da chamada de exclusão, agora são exigidos:

1. Ticket carregado pelo ID esperado e mesma guild da interação.
2. Interação no log privado persistido, usuário autorizado, ciclo atual e fechamento concluído.
3. `ticket.channelId` igual ao canal arquivado no fechamento daquele ciclo e diferente do log privado.
4. Transcript íntegro e mensagem de log final existente.
5. Canal Discord com ID, guild e tipo corretos e topic exato `cylbot-ticket:<ticketId>:<ciclo>`.
6. Canal bloqueado e nenhuma mensagem posterior ao transcript.

Inconsistências bloqueiam a remoção com mensagem segura e evento `ticket.channel.inconsistent`. Canal já ausente continua permitindo recuperação idempotente. A operação entre PostgreSQL e Discord continua sem transação distribuída; permanecem as limitações operacionais descritas em [tickets.md](tickets.md).

## Diagnóstico implementado

`ticket.interaction_failed` inclui `action`, `customIdAction`, `operationId`, `guildId`, `interactionChannelId`, `statusCode`, `errorName` e `stage`. Quando disponíveis, inclui `ticketId`, `channelId` do ticket carregado, `errorCode`, `causeErrorName`, `causeErrorCode`, `errorSource`, `upstreamStatusCode` e `rateLimitSource`.

O contexto é isolado por operação assíncrona. `channelId` não é preenchido com o canal da interação quando o ticket ainda não foi carregado. Erros de resposta produzem `ticket.interaction_response_failed` com o mesmo `operationId`. Falhas técnicas de fechamento e reconciliação também recebem contexto e metadados seguros.

Os limites internos possuem códigos `TICKET_ACTIVE_LIMIT`, `TICKET_OPEN_COOLDOWN` e `TICKET_REOPEN_COOLDOWN`, com `rateLimitSource=app`. HTTP 429/RateLimitError do SDK possuem `rateLimitSource=discord` e resposta específica. Exceções inesperadas continuam sendo 500; o bug de fechamento foi corrigido na causa.

`ticket.channel.deleted` registra `deletedChannelId`, `interactionChannelId`, `ticketId`, `guildId` e `channelId` do alvo persistido. Quando o canal já estava ausente, registra `alreadyAbsent=true` e `deletedChannelId=null`, sem alegar uma nova exclusão.

Os diagnósticos usam seleção explícita de campos e classes/códigos reconhecidos. Não incluem custom ID bruto, mensagens de erro arbitrárias, SQL, URL de conexão, tokens, conteúdo do ticket, modal, request body ou stack.

## Testes e validação

Foram adicionados 15 testes para primeiro fechamento com `beginClose` assíncrono, releitura do checkpoint, retry sem duplicação, alvo persistido do delete, divergências de canal/guild/topic/ciclo, recuperação de canal ausente, claim duplicado, classificação de 429, causa do erro, ausência de dados privados, isolamento de operações e falhas de resposta. O teste PostgreSQL existente também foi ampliado para fechar pelo service usando `beginClose` e persistência reais.

| Checagem | Resultado |
| --- | --- |
| Baseline `npm.cmd --prefix bot test` | 176 passaram; 1 integração ignorada; 0 falhas com acesso necessário ao Vite |
| Final `npm.cmd --prefix bot test` | 191 passaram; 1 integração ignorada; 0 falhas |
| `npm.cmd --prefix web run build` | Passou |
| `npm.cmd --prefix bot run db:status` | Passou; verifica Drizzle, não comprova migrations aplicadas |
| `node --env-file=bot/.env --test bot/test/postgres.integration.test.js` | `SKIP`: `DATABASE_TEST_URL` não configurada |
| `git diff --check` | Sem erros de whitespace |

No Windows foi utilizado `npm.cmd` devido à política do PowerShell. O sandbox bloqueou o carregamento do Vite e a consulta ao perfil do Windows pelo Drizzle; as checagens passaram quando repetidas com acesso ampliado. A consulta ao banco de desenvolvimento foi somente de leitura; a integração não foi redirecionada para ele. Não foi realizado novo smoke test no Discord nem reiniciado o bot nesta correção.

## Arquivos da correção

- `bot/src/Ticket/handlers/ticketHandler.js`: contexto e resposta segura a falhas.
- `bot/src/Ticket/lib/ticketDiagnostics.js`: contexto assíncrono e metadados seguros.
- `bot/src/Ticket/services/ticketService.js`: correção do fechamento, autoridade do delete e diagnóstico das etapas/limites.
- `bot/src/Ticket/services/ticketPermissionService.js`: identificação da etapa de autorização.
- `bot/src/Ticket/services/ticketReconciliationService.js`: diagnóstico seguro da reconciliação.
- `bot/src/Ticket/providers/discordTicketAdapter.js`: vínculo entre canal, ticket e ciclo na exclusão.
- `bot/test/tickets.test.js`, `ticketHandler.test.js`, `discordTicketAdapter.test.js`, `ticketDiagnostics.test.js`, `postgres.integration.test.js`: regressões e contrato PostgreSQL.
- `docs/tickets-smoke-audit.md`: este relatório.
