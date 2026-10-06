# GUILD_NOT_FOUND na Central de Tickets — 2026-10-06

Correção implementada e backend reiniciado. Fluxo local validado: o usuário confirmou novo login, entrada na guild, stats, fila e conversa carregados e 45 segundos sem interação. Os logs reais confirmam leituras autorizadas sem erros de Tickets.

## Evidência do navegador fornecida pelo usuário

`GET /api/tickets?guildId=1548161474227077212&limit=25` retornou HTTP 403:

```json
{"error":"GUILD_NOT_FOUND","message":"O servidor não está disponível para o CYLBot."}
```

O Dashboard havia retornado HTTP 200 e exibido a mesma guild como instalada. O requestId dessa resposta original não foi fornecido; não foi inventado.

## Origem e condição exatas

`ticketReadRoutes.handle` chama `services.dashboard.requireGuildMembership(session, guildId)`. Em `DashboardService.requireGuildMembership`, a guild é encontrada por igualdade estrita do ID, mas `!guild.botInstalled` produz GUILD_NOT_FOUND. A execução termina antes de TicketPermissionService.

O cache de DashboardService armazena a lista bruta retornada pelo OAuth, que não contém botInstalled. A primeira chamada aguardava o provider e montava o DTO, calculando botInstalled por `this.client.guilds.cache.has(guild.id)`. Os caminhos de cache válido e fallback durante cooldown retornavam diretamente `cached.guilds`, sem montar o DTO. Assim, Tickets recebia botInstalled=undefined, mesmo quando a guild estava presente no cliente Discord.

O defeito foi reproduzido antes da correção com a mesma string `1548161474227077212`, cache OAuth de 15 segundos, uma mesma sessão e uma mesma instância do cliente: Dashboard 200/botInstalled=true → Tickets 403/GUILD_NOT_FOUND. Os três testes novos falharam antes da mudança e passaram depois. Esta reprodução usa uma fixture; não é a resposta pós-correção do navegador do usuário.

## Correção

`DashboardService.guildDtos` centraliza a construção do DTO. Consulta nova, cache válido e fallback de cooldown passam por essa função, que verifica validade do token e readiness e recalcula a instalação a partir do cliente atual. A lista OAuth continua em cache; não foi introduzido fetch Discord de guild a cada request. DTOs não expõem o campo permissions bruto do OAuth.

Não foi adicionado bypass de acesso e as regras de TicketPermissionService permanecem inalteradas.

## Cliente, processo e Snowflake

No composition root, createServices recebe o client criado em index.js e passa esse mesmo objeto a DashboardService e DiscordTicketAdapter. TicketPermissionService usa esse adapter e TicketReadService usa essas mesmas permissões. A validação de membership das duas rotas usa o mesmo services.dashboard.

O Vite utiliza um único proxy `/api` → `http://127.0.0.1:3001`; as duas rotas são atendidas por createRequestHandler nesse listener. O backend original era PID 19376. Foi reiniciado como PID 12912 às 15:58:13 -03:00; API iniciou às 15:58:17 e Discord ficou pronto às 15:58:19. Readiness via Vite retornou HTTP 200. Frontend permaneceu PID 16312 na porta 5173.

ServerSwitcher/serverHref → parseServerRoute → ServerWorkspace → TicketsPage → ticketsApi/URLSearchParams → ticketReadRoutes mantém o ID como string. O parser backend usa regex de 17–20 dígitos. Não foi encontrada conversão numérica do Snowflake nesse fluxo. O teste inclui expressamente `1548161474227077212`.

O defeito demonstrado é o retorno de uma estrutura incorreta no caminho de cache. Os logs autenticados pós-correção confirmaram a mesma instância e processo nas duas rotas, sem alteração do ID nem falha de readiness.

## Diagnóstico de desenvolvimento

`api/http/guildDiagnostics.js` registra apenas uma lista explícita de campos: requestId, PID, identificador aleatório da instância do client, comparações de identidade com os clientes das rotas/TicketReadService, guildId e seu tipo, readiness, presença da guild no cache, botInstalled/canManage/canViewTickets, etapa e resultado/código.

Dashboard registra o DTO por guild. Tickets registra validação de membership e leitura autorizada/negada. Não são registrados cookies, Authorization, tokens, sessão ou payload OAuth.

Logs do processo local: `docs/ticket-local-runtime.stdout.log` e `docs/ticket-local-runtime.stderr.log`. As sessões em memória e caches foram renovados pelo reinício; não foram apagados dados de tickets.

## Testes

- Backend `npm test`: 360 testes, 354 aprovados, 6 ignorados, zero falhas.
- Frontend `npm test`: 38 aprovados, zero falhas.
- Frontend `npm run build`: concluído, Vite 7.3.6, 1961 módulos.
- Testes de regressão: sequência Dashboard → Tickets; presença atual da guild/readiness com cache válido; fallback durante cooldown com DTO correto. Nenhum teste anterior foi removido.
- `git diff --check`: sem erros de whitespace.

## Validação real

A ferramenta Browser continua falhando antes de acessar abas: `privileged native pipe bridge is not available; browser-client is not trusted`. Foi solicitado ao usuário um login novo após o reinício, entrada na guild, abertura de Tickets, seleção de conversa e 45 segundos sem interação.

Após o novo login, a reprodução autenticada chegou ao processo corrigido. Os logs reais mostram:

| Campo | Dashboard | Tickets |
| --- | --- | --- |
| Horário local da primeira leitura | 16:01:08 | 16:01:11 |
| requestId | 78e711f0-b64b-4d10-9bb8-61e6da3415e1 | 413a443d-b266-461f-8695-0496e56fb9fe |
| processId | 12912 | 12912 |
| clientInstanceId | 14682c45-32fb-4e97-b2cd-fca6c3ef73b7 | 14682c45-32fb-4e97-b2cd-fca6c3ef73b7 |
| sameRouteClient / sameTicketClient | true / true | true / true |
| guildId / tipo | 1548161474227077212 / string | 1548161474227077212 / string |
| discordReady / cacheHasGuild | true / true | true / true |
| botInstalled | true | true |
| canManage / canViewTickets | true / true | true / true |
| resultado | DTO retornado | membership allowed; ticketRead allowed |

Na janela de 45 segundos iniciada em 16:01:11.778, os logs de Tickets registraram três requests distintas (inicial, 16:01:32.418 e 16:01:48.763), todas autorizadas e concluídas na etapa ticketRead. Não houve erro 403/GUILD_NOT_FOUND nos logs do backend reiniciado. Polling após leitura autorizada continua sendo o comportamento esperado.

Esses logs não incluem pathname para distinguir lista de detalhe e não capturam o status recebido no DevTools. A conclusão de ticketRead leva ao sendJson 200 no handler, mas a confirmação HTTP no navegador continua pendente. Não foram confundidas essas leituras autorizadas com um ensaio de polling após 403 terminal.

Na confirmação final, o usuário informou: fez login novamente, entrou no servidor `1548161474227077212`, abriu Tickets, selecionou um ticket, stats/fila/conversa carregaram normalmente e deixou a página sem interação por 45 segundos. Isso confirma o fluxo visual no navegador real; não foi uma simulação por fixture.

Na última inspeção dos logs do backend corrigido: 25 leituras autorizadas na etapa ticketRead, zero falhas de endpoints de Tickets, zero HTTP 403 e zero GUILD_NOT_FOUND. Lista e detalhe usam essa mesma etapa; a contagem total não foi apresentada como contagem exclusiva de GET /api/tickets.

Limites da observação:

- HTTP 200 corresponde ao caminho de sucesso do handler real, corroborado pelo carregamento no navegador e ausência de falhas; o status do DevTools não foi capturado automaticamente.
- A primeira janela de 45 segundos teve três leituras autorizadas; não houve 403 pós-correção. Portanto, a parada de polling após 403 terminal não foi ensaiada na sessão real e não foi confundida com polling normal após sucesso.
- StrictMode permanece ativo; não foi necessário alterar lifecycle para corrigir o GUILD_NOT_FOUND causado pelo cache.

A inconsistência Dashboard/Tickets foi corrigida e o carregamento da guild real foi confirmado pelo usuário e pelos logs locais. Nenhum commit ou push foi feito.
