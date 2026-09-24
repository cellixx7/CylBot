# Tickets Web — Etapa 4A

O dashboard oferece consulta de tickets por servidor. Após entrar com Discord, use **Ver tickets** no cartão de um servidor com o CylBot instalado. Criadores e membros do suporte podem abrir essa tela sem a permissão Gerenciar Servidor.

## Escopo

- Lista paginada de tickets acessíveis, incluindo encerrados, em ordem decrescente do número público (25 por página).
- Detalhe com assunto, descrição, categoria, criador, responsável, status e datas.
- Histórico canônico via `TicketMessageService.list`, em páginas de 50 mensagens, cada página em ordem cronológica. **Mensagens anteriores** navega pelo histórico; **Voltar às últimas mensagens** retorna à conversa atual.
- Identificação do autor, papel, origem, visibilidade, horário e estado de entrega.
- Atualização por polling a cada 15 segundos após a consulta terminar. Apenas a página selecionada é atualizada. Não há rolagem automática nem chamadas sobrepostas no mesmo componente.
- Polling pausado em abas ocultas; retomado ao voltar. Requisições são canceladas ao navegar, trocar a página ou sair da tela. Respostas antigas são descartadas.
- Estados de carregamento, vazio, falha temporária, falta de acesso, ticket inexistente e sessão expirada. Falhas temporárias indicam que os dados são da última consulta; 401/403/404 encerram o polling e removem o conteúdo. Falhas transitórias consecutivas usam 15/30/60s; 429 respeita `Retry-After` quando maior. Erros internos 500 e outros erros não transitórios interrompem a atualização automática e exigem tentativa manual. Os GETs têm timeout total de 30s. Veja a [investigação de resiliência](discord-read-resilience.md).

Não há campo de composição, envio, upload, nota interna, claim, encerramento, reabertura ou retry de delivery na interface. O POST de mensagens que já existia na Etapa 3.5 permanece inalterado; esta interface usa somente GET. IA, transcript, delivery e arquitetura do Message Core não foram alterados.

## Rotas

| Método | Rota | Resposta |
| --- | --- | --- |
| GET | `/api/tickets?guildId=...&limit=25&before=<numero>` | `{ tickets, nextBefore }`; cursor pelo número público, limite de 1 a 100 |
| GET | `/api/tickets/:ticketId?guildId=...` | `{ ticket }`, com campos explícitos de apresentação |
| GET | `/api/tickets/:ticketId/messages?guildId=...&limit=50&before=<uuid>` | Contrato existente do Message Core: `{ messages, nextBefore }` |

Links da interface: `/#/dashboard/:guildId/tickets` e `/#/dashboard/:guildId/tickets/:ticketId`.

As consultas exigem sessão, membership OAuth e presença do bot no servidor. Os cargos e permissões atuais são consultados pelo adapter Discord. A listagem aplica no PostgreSQL, **antes da paginação**, a mesma regra de VIEW do Core: criador, cargo em `supportRoleIds` salvo no ticket, ManageGuild ou Administrator. O detalhe passa por `TicketPermissionService.VIEW`. O navegador não determina identidade nem autorização.

O Message Core filtra `INTERNAL` e `SYSTEM` para membros da equipe; o criador sem permissões de suporte recebe apenas `PUBLIC`. A UI não monta filtros de segurança por conta própria. DTOs de ticket excluem arquivos de transcript, eventos, cargos, checkpoints e dados técnicos de encerramento. Respostas não devem ser armazenadas em cache; todas as consultas participam do rate limit existente de tickets.

## Dados e pré-requisitos

Requer PostgreSQL, migrations da Etapa 3.5 aplicadas, bot/API conectados e OAuth do dashboard configurado. Não há migration adicional. A consulta Web não utiliza o fallback JSON nem importa mensagens do Discord. Um ticket legado ainda sem mensagens canônicas apresenta o estado vazio com a observação de histórico possivelmente não sincronizado. Tickets fechados continuam consultáveis mesmo após remover o canal Discord.

## Verificação automatizada

Na raiz:

```sh
npm --prefix bot test
npm --prefix web test
npm --prefix web run build
```

No PowerShell com execução de scripts desabilitada, use `npm.cmd`.

Os testes de API usam sessões e adapters fictícios para validar criador, suporte sem ManageGuild, administração, perda de cargos, membership, isolamento entre servidores, metadados permitidos, leitura de ticket fechado, ausência de PostgreSQL e rate limit. A consulta SQL é verificada sem banco. Com `DATABASE_TEST_URL` apontando para um banco exclusivo de testes, a suíte também executa a integração real de filtro e paginação; sem a variável, ela é pulada explicitamente. Os testes Web verificam GET autenticado, polling, cancelamento, respostas antigas, erros terminais e espera por `Retry-After` com relógio controlado.

## Smoke test com Discord e PostgreSQL

1. Entre como criador sem ManageGuild. No dashboard, clique em **Ver tickets**. Confira que apenas seus tickets aparecem e que consegue abrir um link direto autorizado.
2. Entre como suporte apenas com o cargo configurado. Confira a listagem e o detalhe de tickets de outros criadores. Repita com ManageGuild/Administrator.
3. Tente um UUID de outro servidor ou ticket sem acesso. Confira 403/404, ausência de conteúdo e encerramento do polling. Remova o cargo de suporte durante a consulta e aguarde a próxima atualização.
4. Confira metadados de ticket aberto, em atendimento, fechado sem canal e reaberto. Em tickets legados sem mensagens canônicas, confira a explicação de histórico vazio.
5. Abra uma conversa com mais de 50 mensagens. Navegue para páginas anteriores e retorne às últimas. Confira a ordem e a ausência de duplicação dentro das páginas, inclusive em horários iguais.
6. Envie uma mensagem pelo Discord e aguarde até a próxima atualização. Confira texto, autoria e origem. Verifique que mensagens internas só aparecem à equipe e que perder o cargo também atualiza a visibilidade de um criador que era staff.
7. Use conteúdo como `<script>alert(1)</script>` e múltiplas linhas. Confira exibição literal, sem execução HTML. Teste também texto longo em tela de celular.
8. Oculte a aba e navegue entre tickets. Em Network, confira pausa/cancelamento e ausência de respostas antigas na nova tela. Durante falhas temporárias, confira o aviso de dados desatualizados e a retomada; expire a sessão e confira a solicitação de novo login.
9. Confira em Network que a tela de tickets só faz GET e que nenhuma leitura cria mensagens, executa IA ou tenta delivery.

Validações com adapters fictícios e build não substituem este roteiro com uma conta Discord e um banco configurados.
