# Diagnóstico parcial da Central de Tickets — 2026-10-06

Atualização: após a evidência GUILD_NOT_FOUND fornecida pelo usuário, o defeito de retorno de guild OAuth bruta no cache foi reproduzido e corrigido. Veja `ticket-guild-cache-fix.md` para o estado atual. As observações abaixo documentam a investigação anterior à correção.

Estado: bloqueado na captura da sessão real; problema NÃO considerado resolvido.

## Runtime observado

- Backend: PID 19376, node src/index.js, lançado pela cadeia npm --prefix bot start; início 2026-10-06 15:25:46 -03:00; escuta 127.0.0.1:3001.
- Frontend: PID 16312, Vite em D:/marce/Vscode/CylBot/web; início 15:25:53 -03:00; escuta 0.0.0.0:5173.
- Proxy configurado em web/vite.config.js: /api → http://127.0.0.1:3001. /api/health e /api/ready retornaram HTTP 200 diretamente e via proxy.
- DashboardService alterado às 15:22:05; DiscordTicketAdapter às 15:15:01; TicketPermissionService às 15:20:18. O processo iniciou depois desses arquivos. Não houve inspeção da memória dos módulos; os timestamps não provam a versão carregada de cada módulo.
- TicketsPage.jsx e ticketsApi.js servidos pelo Vite retornaram 200 e contêm os marcadores atuais de guildId/getTickets; ticketsApi inclui TICKET_ACCESS_DENIED. Isso não confirma o conteúdo já carregado na aba do usuário.
- Configuração resolvida em processo separado: auth.production=false, API 127.0.0.1:3001, webOrigin http://localhost:5173, cache actor 10000ms, cache OAuth guilds 15000ms. Não foi possível confirmar o ambiente herdado pelo processo em execução.

## Request real

Não capturada. Código do 403, requestId, guildId, usuário, OAuth owner/permissions, member permissions/roles, supportRoleIds e resultados VIEW/RESPOND/CLAIM/CLOSE/CONCLUDE/REOPEN não foram obtidos. Nenhum desses valores foi inferido a partir da mensagem genérica.

O Browser falhou antes da seleção de aba com: privileged native pipe bridge is not available; browser-client is not trusted. A tentativa de documentação de troubleshooting também falhou porque o bootstrap não criou agent. Uma segunda tentativa de conexão repetiu o mesmo erro. Necessário restabelecer a conexão do navegador integrado e autenticar nessa sessão para continuar. Não foram extraídos cookies, tokens ou Authorization de outro navegador.

## Rastreamento estático (não diagnóstico da causa real)

- ServerSwitcher → serverHref → parseServerRoute → ServerWorkspace → TicketsPage → ticketsApi → ticketReadRoutes mantém Snowflake como string, com igualdade estrita e regex de 17–20 dígitos. A igualdade do ID da request real com o servidor selecionado continua pendente.
- requireGuildMembership em bot/src/services/dashboardService.js consulta a lista retornada por guilds(session), que aplica filtros de visibilidade. É necessário distinguir guild ausente no OAuth de guild filtrada antes de interpretar GUILD_MEMBERSHIP_REQUIRED.
- DashboardService.guilds cria base sem permissions e a passa a ticketData; cachedActor tenta ler guild.permissions. Portanto, o merge OAuth/member nessa chamada não recebe o bitfield OAuth original. Não foi feita alteração: falta comprovar a relação com a request real.
- A autorização da lista usa TicketPermissionService.actor → DiscordTicketAdapter.getActor, separada da avaliação cachedActor do dashboard.
- TicketReadRoutes pode produzir GUILD_MEMBERSHIP_REQUIRED/GUILD_NOT_FOUND; TicketPermissionService.actor pode produzir TICKET_ACCESS_DENIED; memberReadError também pode produzir DISCORD_MEMBER_MISSING/DISCORD_ACCESS_DENIED. Esses últimos não possuem tradução específica em ticketsApi e podem aparecer com a mensagem genérica. Código real desconhecido.
- Cache de ator: chave guildId:userId; roles copiados no retorno; TTL configurado de 10s. Cache OAuth: WeakMap por sessão, vinculado ao token, TTL configurado de 15s; requisições pendentes também por sessão/token. Valores reais dos caches e integridade de roles não inspecionados.
- startPolling encerra seu ciclo quando recebe 403. useReadPolling cria um ciclo novo se load, requireRelogin, attempt ou interval mudarem. StrictMode está ativo; TicketsPage tem debounce inicial de 300ms que atualiza cursors; ServerWorkspace e TicketsPage têm key por guild. Isso exige observação do lifecycle real antes de atribuir as duplicações. TicketQueue não inicia requisições.

## Correção e validação

Nenhuma alteração no código da aplicação ou regras de permissão. Nenhum reinício ou limpeza da sessão realizado antes da captura original. Nenhum teste novo para uma causa hipotética. Nenhum commit ou push.

Quantidade de GET /api/tickets em 45s: não medida. Tentativa manual: não verificada. Navegação, stats, fila, seleção e conversa: não validados no navegador real.

## Testes executados

- Backend npm test: 357 testes, 351 aprovados, 6 ignorados, 0 falhas.
- Frontend npm test: 38 aprovados, 0 falhas.
- Frontend npm run build: concluído, Vite 7.3.6, 1961 módulos.

Esses resultados são baseline do código existente e não demonstram resolução do 403.

## Nova tentativa após autenticação informada pelo usuário

O usuário informou que o navegador integrado está autenticado e aberto na Central de Tickets. A nova tentativa de conexão repetiu: privileged native pipe bridge is not available; browser-client is not trusted. A falha ocorre antes da descoberta das abas; portanto, não foi possível inspecionar a sessão, capturar /api/tickets ou contar requests. Não se trata de ausência de login. A captura real e a validação continuam pendentes.
