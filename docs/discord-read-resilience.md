# Investigação: leituras Web dependentes do Discord

## Baseline e preservação do workspace

Investigação em 24/09/2026. `git status` e `git log --oneline -5` foram executados antes de editar. Branch `main`, alinhada a `origin/main`; HEAD `4eefafb`. Commits anteriores: `f76899d`, `8f974a7`, `5098709`, `f822147`.

Já estavam modificados no início:

```text
README-VERIFICACAO.md
README.md
bot/README.md
bot/src/Ticket/repositories/postgresTicketRepository.js
bot/src/api/routes/dashboardRoutes.js
bot/src/api/server.js
bot/src/app/createServices.js
bot/test/dashboard.test.js
web/package.json
web/src/App.jsx
web/src/dashboard/Dashboard.jsx
web/src/dashboard/GuildCard.jsx
```

Já existiam, ainda não rastreados:

```text
bot/src/Ticket/api/ticketReadRoutes.js
bot/src/Ticket/services/ticketReadService.js
bot/test/ticketReadRepository.test.js
bot/test/ticketReadRoutes.test.js
docs/ticket-web.md
web/src/tickets/TicketsPage.jsx
web/src/tickets/ticketsApi.js
web/src/tickets/tickets.css
web/src/tickets/polling.js
web/src/tickets/useTicketPolling.js
web/test/tickets.test.js
```

Essas alterações foram preservadas. A correção anterior de `dashboardRoutes` — erro interno 500, readiness 503 e upstream 502 — permanece. Não foram alterados Message Core, IA, transcript, delivery, schema/migrations ou autenticação base. Nenhum commit, push, registro de comandos ou chamada real a Discord/OpenRouter foi usado na validação.

## Conclusão e causa demonstrada

Há amplificação evitável de leituras: detalhe e mensagens são GETs paralelos, cada um exige lista OAuth e ator atual. Antes, cada request podia emitir uma chamada OAuth e uma chamada REST de membro independentes. StrictMode e abas adicionais podiam aumentar esse volume. Uma única falha OAuth encerrava a consulta do dashboard; não havia recuperação automática nessa tela. O polling de tickets já preservava dados, mas repetia qualquer erro não terminal a cada 15 segundos, inclusive 500, sem backoff progressivo.

Outra lacuna era a classificação: OAuth 429 perdia `Retry-After` e virava 502; erros REST de leitura de membro podiam virar 500 genérico, enquanto apenas o código de membro ausente era reconhecido. Não há evidência neste trabalho de corrida OAuth/cookie/sessão ou de 502 criado pelo Vite. A investigação demonstra caminhos no código e reproduções com fakes; não atribui uma ocorrência real a timeout ou rate limit sem logs dessa ocorrência.

## Respostas às 15 perguntas

1. **Dependências live:** `/api/dashboard/guilds` lê `GET /users/@me/guilds?limit=200` com token OAuth e consulta readiness/cache do bot. Listagem, detalhe e mensagens de tickets repetem essa comprovação de membership e usam `guild.members.fetch({ user, force: true })` para cargos/permissões atuais. `guilds.fetch(id)` usa o cache do discord.js se a guild estiver disponível; sem cache faz REST. As mensagens e metadados vêm do PostgreSQL depois da autorização, não do Discord.
2. **Uma falha OAuth precisa encerrar o dashboard?** Não. Um GET com timeout, falha de conexão reconhecida ou HTTP 502/503/504 pode ser repetido uma vez. Se continuar falhando, a API mantém erro explícito. A tela pode manter dados previamente exibidos, marcados como desatualizados.
3. **Fallback da sessão:** não há lista de guilds na sessão. Ela contém perfil, tokens, scopes e expirações. Inventar membership ou gerenciamento com esses campos seria inseguro. Não foi implementado fallback de autorização ou cache temporal de permissões.
4. **Distinção de falhas:** ver tabela abaixo. O 500 interno continua separado. Agora 429 preserva atraso e erros conhecidos de leitura do ator são classificados sem serializar erros brutos do SDK.
5. **Duplicação em tickets:** sim, detalhe/mensagens fazem membership e ator separadamente. Cada rota continua autorizando, mas chamadas simultâneas compartilham a leitura OAuth pendente da mesma sessão/token e a leitura de ator pendente da mesma guild/usuário. Resultados concluídos, incluindo falhas, são descartados imediatamente.
6. **Polling de 15s amplifica?** Pode amplificar chamadas e alertas em falhas persistentes, sobretudo com múltiplas abas/usuários. Antes eram até quatro leituras externas por ciclo de detalhe (duas OAuth, duas de membro), normalmente 16/minuto por tela, sem contar retries internos do SDK. Quando os requests se sobrepõem, passam a ser uma OAuth e uma de membro por ciclo. Não se promete deduplicação quando chegam depois da conclusão anterior. Falhas consecutivas de tickets usam 15/30/60s; `Retry-After` maior prevalece.
7. **N+1 na listagem:** não há N+1 Discord. `TicketReadService.list` resolve um ator e a consulta PostgreSQL filtra os tickets antes de paginar. Nenhum ator é carregado por linha. O detalhe e o Core podem ler eventos no banco; isso não é N+1 Discord nem foi alterado.
8. **Reutilização segura:** sim, somente a leitura pendente da mesma identidade, sem TTL de sucesso. Cada request mantém sua checagem de sessão/membership e sua regra VIEW. Um novo ciclo força nova consulta do membro. Não foi necessário alterar os contratos do Message Core para transportar atores.
9. **502/503 no frontend:** tickets já os tratavam genericamente como recuperáveis; dashboard exigia ação manual. Agora ambos apresentam mensagens específicas, preservam o último estado e aguardam o próximo ciclo. O dashboard usa 60s; tickets usam 15s em condições normais.
10. **Dados anteriores:** tickets já preservavam durante polling; dashboard limpava no efeito de tentativa. Agora o hook compartilhado preserva dados e o aviso até uma consulta bem-sucedida, inclusive durante retry manual. 401/403/404 removem conteúdo e encerram polling.
11. **Paralelismo:** a tela de detalhe faz GET de ticket e mensagens em `Promise.all`; a tela anterior do dashboard desmonta ao navegar. Não há três consultas de UI obrigatoriamente simultâneas, mas as duas rotas de detalhe consultam a mesma membership. O paralelismo foi mantido com deduplicação no backend.
12. **Timeouts:** OAuth já tinha 10s por tentativa; o GET de guilds mantém esse limite, com no máximo duas tentativas e 200–399ms de espera. O SDK instalado possui timeout REST de 15s por tentativa e até três retries, além de espera por rate limit; isso foi confirmado no código local de `@discordjs/rest`. Não havia prazo total no cliente Web; os GETs de dashboard/tickets agora têm 30s cobrindo fetch e leitura do JSON. Os limites são explícitos, mas não idênticos: o prazo total da fila do SDK pode exceder o prazo do navegador. Não se modificou globalmente o SDK, pois isso também afetaria mutações/delivery.
13. **Retry do provider:** o fetch OAuth não tinha retry; agora somente o GET de guilds tem no máximo uma repetição, com jitter curto e falhas selecionadas. Troca de code OAuth, perfil e mutações não receberam retry. Não foi adicionado outro retry sobre o SDK de membros, que já tem política própria.
14. **Backoff seguro:** sim. Retry curto no GET OAuth apenas para falhas selecionadas; nenhum retry rápido em 429 ou resposta com `Retry-After` positivo. O próximo ciclo da UI respeita o atraso. 401/403/404 não recebem retry automático; 400, 500 e erros inesperados param o polling e exigem tentativa manual, mantendo dados anteriores sinalizados quando existirem.
15. **“Erro e depois funciona”:** o caminho anterior permitia esse sintoma: uma falha upstream encerrava a consulta, uma próxima requisição nova podia funcionar. O retry limitado cobre falhas isoladas antes de responder à UI. Persistindo a falha, o aviso continua visível e dados válidos não desaparecem. Falhas reais não são convertidas em sucesso.

## Classificação e segurança

| Condição | Comportamento |
| --- | --- |
| Exceção interna não reconhecida | 500; sem recuperação automática no frontend |
| Cliente Discord não pronto, inclusive ao terminar leitura | 503; nenhuma conclusão falsa sobre instalação |
| Guild sem bot ou membership OAuth ausente | 403 nas rotas protegidas |
| Membro ausente (`10007`) | 403 `DISCORD_MEMBER_MISSING`; sem retry da aplicação |
| Guild inacessível / Missing Access / Missing Permissions na leitura do ator | 403 `DISCORD_ACCESS_DENIED` |
| OAuth 401/403 | 401/relogin, comportamento existente preservado |
| HTTP upstream 5xx | 502; apenas 502/503/504 recebem um retry curto no GET OAuth |
| Timeout/conexão reconhecida | 502 com código limitado; retry único no GET OAuth |
| Rate limit OAuth | 429 com `Retry-After`; se ausente/inválido, 15s conservadores |
| RateLimitError do SDK, quando exposto | 429, atraso do SDK convertido de ms para segundos |
| Payload OAuth inválido | 502 explícito, sem retry rápido de erro semântico |

Não há cache de autorização nem resposta stale de sucesso no backend. As únicas cópias antigas ficam na tela que já havia recebido esses dados e são identificadas como última consulta. Cards stale não oferecem gerenciamento; o estado de instalação é rotulado como sendo da última consulta. Links de consulta de tickets continuam passando por autorização live no backend. 401/403/404 eliminam o conteúdo no frontend. Uma falha temporária não autoriza novo acesso ao banco.

## Arquivos desta investigação

- Backend: `bot/src/services/dashboardService.js`, `bot/src/providers/discordOAuthProvider.js`, novo `bot/src/providers/discordReadErrors.js`, `bot/src/api/routes/dashboardRoutes.js`, `bot/src/Ticket/providers/discordTicketAdapter.js`.
- Frontend: `web/src/dashboard/{Dashboard.jsx,GuildCard.jsx,dashboardApi.js}`, `web/src/tickets/{TicketsPage.jsx,ticketsApi.js,polling.js,useTicketPolling.js}`, novos `web/src/lib/{readApi.js,readPolling.js,useReadPolling.js}`, `web/src/lib/diagnostics.js` (compatibilidade da flag DEV com os testes Node).
- Testes: `bot/test/dashboard.test.js`, `bot/test/discordTicketAdapter.test.js`, novo `bot/test/discordReadResilience.test.js`, `web/test/tickets.test.js`, novo `web/test/readResilience.test.js`.
- Documentação: este relatório e atualização do comportamento em `docs/ticket-web.md`.

## Reprodução e monitoramento

Os testes injetam respostas 502/503, timeout, reset de conexão, 429 e erros semânticos, sem rede externa. Verificam contagem exata de tentativas, descarte das promises pendentes, isolamento de sessões, perda de cargo, guild não instalada, preservação de dados, parada em erros terminais, timeout/cancelamento e backoff com relógio controlado.

Monitore `discord.guilds_retry` (tentativa/atraso/código), `discord.guilds_response_recovered` (recuperação HTTP/JSON após retry, ainda sujeita à validação do payload), `discord.guilds_failed`, `dashboard.guilds_failed` e `api.request_failed`. Correlacione os dois últimos por request ID, usuário, rota e status; os eventos do provider não carregam token, sessão, body ou payload. `dashboard.guilds_loaded` confirma a validação completa da lista. Não foram adicionados logs de conteúdo de conversa.

## Riscos residuais

- Uma indisponibilidade real continua podendo impedir a primeira carga; não há fallback seguro para conceder novo acesso.
- Deduplicação é local ao processo e só cobre requests sobrepostos. Abas/processos distintos podem continuar gerando tráfego; limites HTTP existentes foram mantidos.
- O dashboard agora faz uma leitura a cada 60s enquanto visível. Isso adiciona atualização periódica, compensada por deduplicação concorrente e ausência de loops rápidos. Tickets continuam a cada 15s quando saudáveis.
- Até a próxima autorização bem-sucedida/negação explícita, dados já exibidos podem continuar visíveis sob aviso durante uma falha externa. Isso não concede leitura adicional nem permite mutações sem revalidação.
- O timeout/aborto do navegador não cancela uma leitura compartilhada no servidor, para não interromper outros consumidores. A chamada do SDK pode permanecer na fila até concluir; não recebeu novo retry da aplicação.
- Não há comprovação de qual falha ocorreu em uma sessão real sem os logs correspondentes. Os testes usam providers fictícios e não validam disponibilidade real do Discord.

## Validação

Comandos executados na raiz (no Windows, `npm.cmd`):

```sh
npm --prefix bot test
npm --prefix web test
npm --prefix web run build
git diff --check
```

Também são executados testes direcionados de dashboard, provider, auth, proxy, adapter de membro e rotas Web de tickets. A suíte PostgreSQL continua dependendo de `DATABASE_TEST_URL`; nenhuma conexão real ao Discord/OpenRouter é necessária.

Resultado desta execução: **258 testes backend aprovados, 4 integrações PostgreSQL puladas** por ausência de `DATABASE_TEST_URL`; **9 testes frontend aprovados**; **58 testes direcionados aprovados**. Build de produção concluído e `git diff --check` sem erros. O build e o teste local de proxy precisaram executar fora do sandbox para permitir a resolução de diretórios ancestrais pelo esbuild; isso não envolveu rede externa.
