# Tickets Discord — MVP

`/ticket` inicia o setup privado da guild. Não há rotas Web de tickets, IA, cobrança, Premium ou chat Web nesta etapa. PostgreSQL é a persistência de referência quando `DATABASE_URL` está configurada.

## Ativação

1. No Discord Developer Portal, habilite **Message Content Intent** para a aplicação; aplicações sujeitas à aprovação precisam obtê-la. O conteúdo também é restringido na API REST sem esse acesso. [Referência oficial de mensagens](https://github.com/discord/discord-api-docs/blob/main/developers/resources/message.mdx).
2. Em `bot/.env`, defina `TICKETS_MESSAGE_CONTENT_ENABLED=true` e reinicie o bot. A config central adiciona `GuildMessages` e `MessageContent` ao bootstrap. O padrão é `false`, preservando o startup das instalações que ainda não habilitaram o intent; nesse caso o setup informa como habilitar.
3. Conceda ao bot: ViewChannel, ReadMessageHistory, SendMessages, AttachFiles, EmbedLinks, ManageChannels, ManageRoles, AddReactions, SendMessagesInThreads, CreatePublicThreads e CreatePrivateThreads. Os bits de threads/reações são necessários para negá-los nos overwrites; o bot não cria threads. Não é necessário conceder Administrator.
4. Execute o script existente `npm --prefix bot run commands:register` quando quiser publicar a nova definição de slash command. Esse comando faz uma alteração real no Discord e **não** faz parte dos testes. O registry oficial já inclui `/ticket`.
5. Como administrador com ManageGuild ou Administrator, execute `/ticket` na guild.

Discord exige ManageRoles para alterar overwrites. A implementação herda essa permissão da guild, pois defini-la no overwrite de criação exige Administrator. [Referência de criação de canais](https://github.com/discord/discord-api-docs/blob/main/developers/resources/guild.mdx#create-guild-channel), [alteração de canais](https://github.com/discord/discord-api-docs/blob/main/developers/resources/channel.mdx#modify-channel).

## Setup

O wizard usa respostas ephemeral, botões, Role Select, Channel Select e modal. Cada sessão dura 15 minutos e pertence a um usuário/guild; permissões são consultadas novamente no backend. A confirmação é serializada por guild.

```text
/ticket → Começar → cargo de suporte → estrutura automática/existente
       → categorias padrão/personalizadas → Confirmar e publicar
```

No modo automático, cria duas categorias e dois canais:

```text
TICKETS (pública, sem escrita para @everyone)
└─ abrir-ticket (painel público do bot)
em-atendimento (privada)
├─ ticket-log (logs e transcrições para suporte)
└─ ticket-000001, ticket-000002, ... (criados sob demanda)
```

“Encerrados” é a área lógica dos registros `CLOSED` e seus logs, sem categoria física adicional. No modo existente, selecione canal público, canal privado de logs e categoria de atendimento. Eles devem pertencer à guild e ter tipos/permissões válidos. O setup não modifica os overwrites desses canais existentes. O log deve negar ViewChannel a @everyone e permitir leitura somente ao bot e aos cargos de suporte selecionados; administradores continuam sujeitos às regras próprias do Discord e podem acessar canais privados.

Categorias padrão: Suporte, Denúncia, Financeiro e Outro. Alternativamente, informe até cinco linhas `Nome | Descrição`. Cada categoria possui `id`, `name` e `description`. `supportRoleIds` é um array; a UI seleciona um cargo neste MVP. @everyone e cargos gerenciados não são aceitos como suporte.

Em PostgreSQL, a configuração persiste em `ticket_configs` e `ticket_categories`; sem `DATABASE_URL`, o fallback de desenvolvimento usa `bot/data/ticket-config.json`. Cada recurso criado tem seu ID salvo antes do próximo. Uma publicação interrompida é retomada por `/ticket` → Confirmar usando os dados salvos. Configuração concluída não é editável pelo wizard nesta versão; ele aponta que já existe um sistema configurado. Cancelar encerra a sessão de UI, sem apagar recursos/dados já provisionados.

## Entidade e armazenamento

Ticket não é canal. Em PostgreSQL, `tickets` guarda a entidade e `ticket_sequences` gera o número por guild; sem banco, o fallback usa `bot/data/tickets.json`. Um ticket possui:

| Grupo | Campos |
| --- | --- |
| Identidade | `id` (UUID), `sequence` (visível como #000001), `guildId`, `guildName` |
| Solicitante/conteúdo | `creatorUserId`, `creatorName`, `categoryId`, `categoryName`, `subject`, `description` |
| Atendimento | `status`, `assignedUserId`, `assignedName`, `createdAt`, `claimedAt`, `closedAt` |
| Representação Discord | `channelId` (nullable), `initialMessageId`, `openingLogId`, `logChannelId`, `supportRoleIds` |
| Recuperação/histórico | `initialized`, `closing`, `reopening`, `reopenCount`, `reopenedAt`, `reopenedBy`, `archives`, `events` |

Estados centralizados: `OPEN`, `CLAIMED`, `CLOSED`, `REOPENED`. `closing` e `reopening` são checkpoints de operações, não estados de atendimento adicionais. WAITING_USER/WAITING_STAFF podem ser acrescentados ao enum e às transições futuramente.

Eventos persistidos: `TICKET_CREATED`, `TICKET_CLAIMED`, `TICKET_CLOSED`, `TICKET_REOPENED`, com `type`, `ticketId`, `actorUserId`, `createdAt`, `metadata`. Eventos descrevem transições; transcript descreve mensagens. `archives` mantém cada ciclo encerrado, canal antigo, motivo/resumo, referência da captura e mensagem de log.

Os repositories encapsulam persistência. PostgreSQL usa transações, advisory lock por guild/usuário, constraint única `(guild_id, public_number)` e atualização condicional para claim. O fallback JSON usa arquivo temporário e rename e pressupõe um processo. A sequência nunca usa `channelId`; reservas interrompidas podem deixar lacunas. Transcripts HTML continuam em `bot/data/ticket-transcripts/`, fora do banco, com hash SHA-256 e limites de tamanho.

## Abertura e claim

Painel → Abrir ticket → categoria → modal de assunto (100 caracteres) e descrição (2.000). Só membros não bots podem abrir. O service exige configuração pronta, categoria válida e canal oficial do painel.

Limites persistidos: **um ticket ativo por categoria por usuário**, **três ativos no total**, **60 segundos entre aberturas**. OPEN, CLAIMED, REOPENED e reaberturas pendentes contam para os limites. Tickets encerrados não contam. A reabertura aplica os limites ao criador original e também exige 60 segundos após o fechamento.

O registro é reservado antes de criar o canal. O canal nega ViewChannel a @everyone e permite leitura/escrita ao criador, cargos de suporte e bot. Threads são desabilitadas para os participantes. A mensagem inicial mostra categoria, criador, assunto, descrição, status e responsável, com Assumir/Fechar. O log de abertura não copia a descrição. Todas as mensagens do bot usam `allowedMentions: { parse: [] }`.

Uma abertura interrompida pode ser retomada submetendo novamente a categoria pelo mesmo usuário. O ticket reservado e os dados originais são preservados. Canais são identificados também por topic contendo ticketId/ciclo, permitindo recuperar um canal criado antes de falhar a persistência do ID.

Somente suporte ou administradores assumem. A atribuição e o evento são persistidos antes de atualizar o embed. O bloqueio por guild melhora a UX dentro do processo, mas PostgreSQL é a autoridade: claim usa atualização condicional e criação revalida limites sob advisory lock. Falha puramente visual não desfaz um claim persistido.

## Encerramento, transcript e remoção

Criador, suporte ou administrador podem fechar; membros comuns alheios não podem. O botão abre um modal com motivo obrigatório e resumo opcional, ambos de até 1.000 caracteres.

1. Revalidar guild, canal, ator e estado.
2. Persistir `closing` com ator, motivo, resumo e horário; claim/reabertura ficam bloqueados.
3. Avançar checkpoints `transcriptGenerated`, `transcriptPersisted`, `logPublished`, `channelLocked` e `completed` após cada operação externa.
3. Paginar mensagens (100 por chamada) e salvar HTML local versionado.
4. Persistir referência/hash do transcript.
5. Publicar log privado com HTML anexado e salvar messageId.
6. Bloquear escrita de criador/suporte no canal. Se chegaram mensagens durante a coleta inicial, gerar nova captura. Atualizar o anexo do log final mesmo em retries.
7. Persistir CLOSED, arquivo de ciclo e evento; atualizar a mensagem inicial.

O fechamento **não apaga o canal**. No log, staff pode selecionar Remover canal e confirmar em uma resposta privada. O service exige ciclo atual encerrado, checkpoints completos, arquivo local íntegro e log final existente com anexo. O adapter bloqueia novamente o canal e recusa remover se há mensagens posteriores à captura. Só então chama a exclusão Discord e limpa channelId no registro.

Falha na geração, escrita, persistência, publicação ou bloqueio preserva o canal. Use Fechar novamente para retomar o checkpoint, inclusive após reiniciar o bot; motivo/resumo originais são mantidos. O log usa nonce/ID persistido para edição em retries. Se o Discord aceitou uma exclusão e a gravação posterior falhou, repetir Remover reconhece o canal já ausente e termina a atualização local.

O HTML inclui ticket/guild/categoria/criador/atendente/datas, assunto, descrição, motivo/resumo, mensagens, IDs dos autores, timestamps, texto de embeds e links de anexos Discord. Todo texto é escapado; não há JavaScript, recursos externos embutidos ou objetos internos do SDK. Links só aceitam HTTPS nos hosts CDN Discord previstos. O arquivo inclui CSP restritiva e política de referrer. O serviço não recebe configuração de autenticação nem adiciona tokens/secrets do bot. Conteúdo que os próprios participantes escreverem faz parte do atendimento: orientar usuários a não publicar credenciais.

Capturas são imutáveis, com SHA-256 verificado antes de anexar/reabrir/remover. Limites do MVP: **5.000 mensagens** e **7 MiB**; exceder qualquer limite falha explicitamente, sem truncar nem autorizar exclusão. Anexos binários não são baixados; URLs podem expirar. Mensagens apagadas não são recuperáveis, nem há captura contínua de edições. Administradores, bots e webhooks com privilégios podem contornar bloqueios normais; novas mensagens detectadas impedem exclusão, mas não há transação atômica entre captura e Discord. Intervenção manual é necessária quando a conferência final detecta novas mensagens depois de CLOSED.

## Reabertura

O botão do log inclui ticketId/ciclo e só funciona para staff/admin no canal de log correspondente. O repository é a fonte de identidade; não se consulta o canal antigo para reconstruir o ticket. É necessário que o criador ainda pertença à guild e que a configuração/roles continuem válidos.

O service verifica CLOSED e captura anterior, reserva uma reabertura, cria novo canal privado, publica a mensagem com referência ao fechamento/reabertura e anexa o HTML anterior. Mantém UUID/sequência/criador/histórico, incrementa `reopenCount`, atualiza channelId e limpa responsável/claimedAt. A reabertura pendente também pode ser retomada após falha/reinício sem alocar outra identidade. Botões de ciclos antigos não alteram o ciclo atual.

Se o canal antigo ainda existir, fica bloqueado e preservado; a reabertura cria um novo. Para evitar acumular canais antigos, use Remover canal antes de Reabrir. Não há exclusão automática de canais antigos ao reabrir.

## Arquitetura e pontos de extensão

```text
commands/ticket → handlers/ticketHandler → TicketSetupService / TicketService
                                               ├→ TicketPermissionService
                                               ├→ TicketTranscriptService → TicketTranscriptRepository
                                               ├→ TicketConfigRepository / TicketRepository
                                               └→ DiscordTicketAdapter
```

O composition root instancia as dependências compartilhadas. O handler recebe services, interpreta componentes e produz respostas. Os services recebem DTOs com IDs/dados simples; não recebem Interaction. O adapter concentra SDK, REST, overwrites, mensagens e renderização Discord. `lib/ticketComponents.js` reúne builders de interface. Nenhum service conhece fs; nenhum handler conhece JSON. `interactionHandlers.js` registra a feature e `commands/index.js` alimenta runtime/deploy.

Futuramente a Web poderá chamar o mesmo TicketService com identidade autenticada e autorização revalidada no backend. O repository PostgreSQL atual é a referência para transações, unicidade e locks; o JSON permanece apenas fallback de desenvolvimento. O adapter Discord permanecerá uma representação do ticket.

Branding continua concentrado no payload do painel. O acesso experimental à IA fica centralizado na policy por configuração do ambiente, sem billing ou condicionais de Premium espalhadas. `TicketAIService`, context, policy e action services já atendem Discord/API com autorização e auditoria persistentes; capacidades comerciais futuras podem substituir somente essa decisão de acesso. Veja [IA de tickets](ticket-ai.md).

## Limitações operacionais

- PostgreSQL é obrigatório em produção; sem `DATABASE_URL`, o startup falha. Em desenvolvimento, o fallback JSON e o bloqueio conservador por guild continuam disponíveis.
- SIGINT/SIGTERM encerram HTTP, Discord e pool PostgreSQL; retries de fechamento/reabertura usam checkpoints persistidos.
- Sem edição de configuração concluída, adicionar participantes, prioridades ou regras por categoria.
- Sem limpeza automática/retention de tickets, arquivos HTML antigos ou capturas sem referência; administrar backups e acesso ao disco/logs.
- Não há atomicidade com Discord. Se uma chamada remota tiver sucesso e a resposta/gravação local falhar, podem restar recursos/mensagens duplicados. Nonce de envio e topic reduzem duplicações, mas não garantem entrega única após longos intervalos. Setup nunca apaga recursos como rollback.
- Canais/logs/roles removidos ou permissões alteradas manualmente podem exigir reparo administrativo; erros preservam dados e canais em vez de conceder acesso mais amplo.
- Os testes usam Discord simulado. Permissões, habilitação do intent e experiência real devem ser conferidas numa guild de desenvolvimento antes de uso operacional.
- A IA opcional depende do histórico ainda disponível no Discord; mensagens multicanal persistentes ficam para a Etapa 4. Configuração, pausa, escalation e auditoria são persistentes. Consulte [IA de tickets](ticket-ai.md) para policy, routes, privacidade e roteiro manual.

## Validação

`npm --prefix bot test`, `npm --prefix web run build`, `git diff --check`. Nenhum teste registra comandos nem chama Discord/OpenRouter/Spotify reais. Veja a matriz de testes em `bot/test/README.md`.

Resultado desta etapa, com Node.js 24: **171 testes passaram**, build Web passou e diff sem erros de whitespace. Inspeção dos 61 módulos locais do backend não encontrou ciclos de imports.

| Arquivos novos (caminhos relativos à raiz) | Papel |
| --- | --- |
| `bot/src/commands/ticket.js`, `bot/src/handlers/ticketHandler.js`, `bot/src/lib/ticketComponents.js` | Comando, interações e componentes Discord |
| `bot/src/services/ticketService.js`, `ticketSetupService.js`, `ticketPermissionService.js`, `ticketTranscriptService.js`, `ticketConstants.js` (todos em services) | Regras, autorização, setup, transcript e estados/eventos |
| `bot/src/providers/discordTicketAdapter.js` | Integração Discord |
| `bot/src/repositories/ticketRepository.js`, `ticketConfigRepository.js`, `ticketTranscriptRepository.js`, `ticketJsonStore.js` (todos em repositories) | Persistência local |
| `bot/test/tickets.test.js`, `ticketSetup.test.js`, `ticketTranscript.test.js`, `ticketHandler.test.js`, `discordTicketAdapter.test.js` (todos em test), `bot/test/helpers/ticketFixture.js` | Testes e fixture |
| `docs/tickets.md` | Operação e arquitetura do MVP |

Arquivos existentes integrados nesta etapa: `app/createServices.js`, `handlers/interactionHandlers.js`, `commands/index.js`, `config/env.js`, `index.js`, `.env.example`, `test/composition.test.js`, `test/env.test.js`, `README.md`, `bot/README.md`, `bot/test/README.md` e `docs/architecture.md`. As alterações anteriores de saneamento permanecem no workspace.
