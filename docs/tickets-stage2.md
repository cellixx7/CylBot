# Etapa 2 — Central de Tickets

Implementada como evolução do módulo existente, dentro do Workspace da Etapa 1. A direção visual é o [Workspace / 02 Tickets no Figma](https://www.figma.com/design/wgs6nv0o2VrxYHNTitCzHm?node-id=70-133). O comportamento de mensagens, permissões, polling, IA e recuperação de operações foi preservado. Esta entrega não inclui commit, push ou implementação da Etapa 3.

## Arquitetura

O `ServerWorkspace` continua responsável pelo servidor atual, switcher, navegação, Header, Footer e tema. As rotas permanecem `#/dashboard/:guildId/tickets` e `#/dashboard/:guildId/tickets/:ticketId`. A página é montada pela identidade do servidor, enquanto a conversa é montada pela identidade do ticket: selecionar outro ticket preserva fila, pesquisa, filtros e paginação. Trocar de servidor reinicializa esse contexto.

Arquivos criados nesta etapa:

| Área | Arquivos |
| --- | --- |
| Central e filtros | `web/src/tickets/TicketQueue.jsx`, `TicketFilters.jsx`, `TicketStatusSummary.jsx`, `ticketFilterView.js` |
| Conversa e interação | `web/src/tickets/TicketConversation.jsx`, `TicketShared.jsx`, `TicketDialog.jsx`, `TicketTools.jsx`, `MessageAttachments.jsx` |
| Serviços | `bot/src/Ticket/services/ticketFilters.js`, `ticketAttachments.js`, `ticketToolsService.js` |
| API | `bot/src/Ticket/api/ticketToolsRoutes.js` |
| Persistência | `bot/src/database/migrations/0010_slim_sir_ram.sql`, `meta/0010_snapshot.json` |
| Testes | `bot/test/ticketStage2.test.js`, `ticketStage2.postgres.test.js`, `ticketToolsRoutes.test.js`, `web/test/ticketCentral.test.js` |

Arquivos existentes refatorados ou estendidos:

- Frontend: `TicketsPage.jsx`, `tickets.css`, `ticketsApi.js`, `MessageAvatar.jsx`, `MessageContent.jsx`, `conversationPresentation.js`, `messageReconciliation.js` e integração em `ServerWorkspace.jsx`.
- Domínio: `ticketConstants.js`, `ticketDomain.js`, `ticketPermissionService.js`, `ticketService.js`, `ticketReadService.js`, `ticketReconciliationService.js` e `ticketTranscriptService.js`.
- Persistência: `ticketRepository.js`, `postgresTicketRepository.js`, `postgresTicketMessageRepository.js`, schema e journal de migrations.
- Discord e API: adapter, handlers, componentes/diagnósticos de Tickets, rotas de leitura e ações, eventos de mensagens, `ticketMessageService.js`, `createServices.js`, servidor HTTP e estatísticas do dashboard.
- Testes existentes receberam apenas adaptações de contratos alterados e cobertura adicional; não foram removidos para acomodar o refactor.

`TicketsPage` coordena a fila. `TicketConversation` conserva a lógica existente de detalhe, mensagens e IA. Routes validam sessão, origem, membership e formato; os serviços aplicam autorização e domínio; repositories e adapter executam persistência e chamadas Discord.

## Domínio e migração

O modelo anterior possuía `OPEN`, `CLAIMED`, `CLOSED` e `REOPENED`. Foi acrescentado `CONCLUDED`, com evento `TICKET_CONCLUDED` e permissão explícita `CONCLUDE` para staff.

| Estado | Significado | Próximas ações de ciclo |
| --- | --- | --- |
| `OPEN`, `CLAIMED`, `REOPENED` | Atendimento ativo | Assumir conforme estado/permissão, encerrar ou concluir |
| `CLOSED` | Encerrado sem solução registrada | Reabrir conforme permissão e cooldown |
| `CONCLUDED` | Finalizado com solução registrada | Reabrir conforme permissão e cooldown |

Tickets antigos `CLOSED` permanecem encerrados. Nenhum ticket é convertido automaticamente em concluído. Ambos os estados finais usam conversa em modo `history`, somente leitura, mantendo revisões e arquivos anteriores ao reabrir.

Encerramento e conclusão usam a mesma infraestrutura existente de finalização, com outcome persistido, checkpoints de transcript/log/bloqueio, recuperação e retry. Uma finalização parcial conserva sua intenção e só pode ser retomada com o mesmo outcome. Reconciliação e recuperação de canal também reconhecem `CONCLUDED`.

A migration `0010_slim_sir_ram.sql` acrescenta:

- `CONCLUDED` ao enum `ticket_status`;
- `TICKET_CONCLUDED` e `TICKET_TOOL` ao enum de eventos;
- `ticket_messages.attachments`, JSONB obrigatório com default `[]`.

Foi gerada com Drizzle e aplicada com sucesso em PostgreSQL 16 temporário e isolado durante os testes. **Não foi aplicada ao banco da aplicação.** Para implantar, execute `npm run db:migrate` dentro de `bot`, com `DATABASE_URL` do ambiente de destino, antes de iniciar a versão nova do backend.

## Central, filtros e contagens

Desktop apresenta fila à esquerda e conversa à direita, mantendo deep link, refresh e navegação pelo histórico do navegador. Sem seleção, o painel apresenta uma orientação para escolher um ticket. Mobile apresenta fila ou conversa, com `← Tickets` para retornar. A fila e a conversa têm scroll independente; o composer permanece no fundo do painel, sem cobrir Footer ou sidebar.

As linhas da fila mostram número, assunto, estado, categoria, criador, responsável e data/hora, com seleção visual e `aria-current`. Não foi criado um estado fictício de mensagens não lidas.

Existe uma pesquisa com debounce de 300 ms e um único botão `Filtros`. O diálogo oferece:

- Todos os cinco estados individuais;
- Categoria real da configuração do servidor, em single select;
- Todos, não atribuído, eu e responsáveis presentes nos resultados carregados;
- Hoje, últimos 7 dias, últimos 30 dias, este mês e intervalo personalizado com controles de data;
- Chips removíveis e limpeza dos filtros aplicados.

As datas do calendário local são convertidas em limites UTC para a API. Status, categoria, responsável, intervalo e pesquisa são validados e aplicados no backend **antes do cursor e do limite**. A pesquisa cobre número público, assunto e criador; não percorre textos de mensagens. O PostgreSQL usa parâmetros, inclusive escapando curingas da pesquisa. A paginação existente por cursor foi preservada.

As três contagens são calculadas por consulta agregada: ativos (`OPEN`/`CLAIMED`/`REOPENED`), encerrados e concluídos. Não dependem da página carregada nem dos filtros de pesquisa. Respeitam o escopo de acesso do usuário. A agregação de várias guilds também foi estendida, com zeros para servidores sem tickets.

## Chat, IA e mensagens

Mensagens próprias de staff enviadas pela Web ficam à direita. Criador, IA e mensagens externas do Discord ficam à esquerda. A IA mantém avatar próprio e identificação explícita. Mensagens adjacentes de mesma autoria, origem, visibilidade e dia podem compartilhar identificação visual; cada mensagem conserva horário.

Separadores usam Hoje, Ontem ou data completa. Conteúdo continua escapado pelo React; links HTTP/HTTPS seguros são clicáveis, com proteção para abertura externa e sem HTML arbitrário.

Anexos recebidos do Discord agora são persistidos, incluindo mensagens só com anexo, edição/ingestão e importação legada. Backend e frontend validam URLs HTTPS dos hosts Discord permitidos, sem credenciais ou portas alternativas. Imagens têm thumbnail somente para tipos e extensões permitidos; outros arquivos mostram nome, tamanho e link. SVG não é usado como thumbnail. Transcripts incluem anexos seguros; snapshots antigos conservam compatibilidade de hash.

O composer preserva `clientMessageId`, reconciliação otimista, estados de entrega, retry, edição, revisões e comportamento de Enter/Shift+Enter/IME. O autoscroll acompanha novas mensagens somente quando o usuário está perto do fim; leitura de mensagens antigas conserva a posição.

O botão Assistente abre as ações existentes de status, pause, resume, sugestão e configuração. A configuração completa permanece em diálogo próprio. A sugestão fica próxima ao composer com usar/descartar e não é enviada automaticamente. Detalhes adicionais do ticket e eventos ficam em diálogo, mantendo espaço para a conversa.

## Workflow

- **Assumir:** usa a action e a autorização existentes, revalidando estado e responsável.
- **Fechar ticket:** confirmação com motivo obrigatório e resumo opcional; persiste `CLOSED`.
- **Concluir ticket:** confirmação com solução obrigatória e motivo opcional; persiste `CONCLUDED`.
- **Reabrir ticket:** admite os dois estados finais, respeita permissões, limites e cooldown, conservando identidade e arquivos do ciclo anterior.

O contrato expõe `canConclude` separadamente. A conclusão também está integrada aos controles/modal do Discord, com a mesma autorização de staff e solução obrigatória. Para acesso à central, o administrador é reconhecido pelo proprietário da guild ou pela permissão Discord `Administrator`; `ManageGuild` e os cargos de suporte continuam compatíveis com o contrato anterior.

### Correção de acesso 403

O Dashboard usa a lista OAuth da guild para `canManage` e `canViewTickets`, enquanto a API revalida o membro no Discord antes de executar `VIEW`. O cache local de membros podia conter permissões incompletas e substituir a permissão administrativa correta da lista OAuth, produzindo um falso 403 no Workspace. `cachedActor` agora combina os bits OAuth com os bits do membro em cache; a API continua revalidando o membro e não há bypass no frontend.

Os 403 da leitura agora têm códigos estáveis: `TICKET_ACCESS_DENIED`, `GUILD_MEMBERSHIP_REQUIRED` e `GUILD_NOT_FOUND`. O frontend exibe mensagens específicas, sem refletir texto privado do backend. O polling já trata 401/403/404 como estados terminais e oferece `Tentar novamente` manualmente, sem repetir o 403 a cada ciclo.

## Ferramentas e segurança

As ferramentas disponíveis são adicionar cargo, remover cargo, aplicar timeout, remover timeout e banir. Capabilities completas são buscadas quando o painel é aberto. Cada execução consulta membros e cargos atuais no Discord, sem confiar nas capabilities mostradas anteriormente.

O backend deriva o ator da sessão e o alvo do criador do ticket. Não aceita um alvo arbitrário enviado pelo navegador. Exige membership, acesso ao ticket, staff, motivo e confirmação explícita, além de permissão Discord específica do ator **e do bot**. A hierarquia é verificada antes da chamada Discord.

As regras impedem agir sobre o owner, o próprio ator, o bot e outros bots, bem como alvos acima da hierarquia permitida. Cargos `@everyone`, managed ou acima do ator/bot não podem ser gerenciados. Cargos concedidos/removidos precisam ter permissões contidas nas do ator e bot para evitar escalada. Timeout exige `ModerateMembers`, não atua sobre administrador e aceita de 1 minuto a 28 dias. Ban exige `BanMembers` e preserva mensagens existentes.

Essas regras seguem a [documentação oficial de permissões e hierarquia do Discord](https://docs.discord.com/developers/topics/permissions) e o [contrato de timeout de membros](https://docs.discord.com/developers/resources/guild#modify-guild-member).

O servidor possui limites separados de leitura, escrita, IA e moderação; moderação tem default de cinco requisições por minuto por usuário. Configuração e valores permitidos seguem `config/env.js` e `.env.example`. Erros de limite HTTP preservam `Retry-After`; cooldown de reabertura é tratado como conflito de domínio com indicação de tempo restante.

Ferramentas registram logs estruturados e eventos `TICKET_TOOL` com guild, ticket, ator, alvo, ação, timestamp e resultado. Os eventos são inseridos separadamente e preservados ao salvar snapshots antigos do ticket. Logs não incluem conteúdo completo de mensagens nem tokens. Se o Discord concluiu a ação e a persistência da auditoria falha, há log específico; a resposta não incentiva repetir uma ação já realizada.

## Performance

- Fila carrega metadata, categorias e agregados; não carrega mensagens ou eventos de cada ticket.
- Detalhe e mensagens são buscados somente para a conversa selecionada.
- Agregados usam `COUNT ... FILTER`, sem uma consulta por status.
- Filtros e cursor são executados no PostgreSQL, sem carregar todos os tickets para filtrar no navegador.
- Polling mantém `useTicketPolling`, resiliência e controle de visibilidade; contagens acompanham a listagem, sem timer adicional de stats.
- Capabilities de moderação são consultadas sob demanda; não há fetch de todos os membros Discord nem consulta de ferramentas a cada ciclo do detalhe.
- Não foi introduzido websocket ou N+1 de mensagens/eventos na fila.

## QA realizado

| Validação | Resultado |
| --- | --- |
| `bot`: `npm test` com `DATABASE_TEST_URL` temporária | **354/354 passaram; zero skips** |
| `web`: `npm test` | **37/37 passaram** |
| `web`: `npm run build` | **Passou** |
| Verificação do diff | Sem erros de whitespace |
| Navegador real, tema Dark e Light | Passou |
| Larguras 1920, 1440, 1280, 1024, 768, 390 e 320 | 14 combinações validadas; sem overflow horizontal |

As integrações em PostgreSQL cobrem migration, filtros combinados antes da paginação, pesquisa com caracteres especiais, stats/isolamento, persistência de anexos e preservação de auditoria durante salvamento de snapshot anterior. Os testes de domínio cobrem transições de todos os estados ativos, conclusão, encerramento, reabertura e recuperação parcial. HTTP cobre autorização, origem, membership, validação, sessão e rate limit; mocks cobrem permissões e hierarquia Discord.

A validação do navegador usou o build real, Chromium/Edge e respostas de API controladas. Cobriu entrada no servidor, filtros/chips, seleção e refresh por deep link, paginação, claim, resposta, sugestão sem envio automático, encerramento, reabertura, conclusão, nova reabertura, ferramenta permitida e negada, retorno mobile e revogação de acesso. Também validou Escape/foco dos diálogos e autoscroll ao chegar mensagem durante leitura do histórico ou perto do fim. Nenhuma ferramenta foi executada contra usuário ou servidor Discord real.

Screenshots da conversa, fila mobile, filtros e ferramentas, mais `results.json`, foram gerados no diretório temporário local `cyl-ticket-stage2-qa`. O PostgreSQL de QA usou container próprio, descartável, sem acesso ao banco da aplicação.

## Limitações reais

- A migration precisa ser aplicada ao ambiente de destino antes da ativação do backend atualizado.
- Anexos antigos que já estavam armazenados sem metadata continuam com `[]`; não foi criado backfill automático. URLs assinadas do CDN podem expirar; não foi criado proxy.
- Upload de anexos pela Web e criação de notas internas não possuem suporte de escrita no backend atual; a interface não oferece controles fictícios para essas operações.
- Categoria usa seleção única. A lista de responsáveis usa pessoas encontradas nos resultados carregados, sem diretório completo de membros.
- Chamadas de moderação e respostas de IA foram validadas com mocks; a aceitação por Discord real depende das permissões, hierarquia e estado atual do servidor.
- Uma falha isolada de armazenamento após ação Discord concluída é registrada nos logs; não existe outbox adicional de auditoria nesta etapa.
