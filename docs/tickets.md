# Tickets Discord — MVP

`/ticket` inicia o setup privado da guild. Existem routes protegidas para IA e mensagens, mas ainda não há chat React, cobrança ou Premium. PostgreSQL é a persistência de referência quando `DATABASE_URL` está configurada.

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

Os repositories encapsulam persistência. PostgreSQL usa transações, advisory lock por guild/usuário, constraint única `(guild_id, public_number)` e atualização condicional para claim. O fallback JSON usa arquivo temporário e rename e pressupõe um processo. A sequência nunca usa `channelId`; reservas interrompidas podem deixar lacunas. O diretório efetivo dos transcripts HTML é `bot/src/data/ticket-transcripts/`, fora do banco, com hash SHA-256 e limites de tamanho. Esse caminho legado foi preservado para manter válidas as referências existentes, que contêm somente a chave do arquivo.

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

As regras de privacidade e retenção das capturas estão na seção [Privacidade e retenção de transcripts](#privacidade-e-retenção-de-transcripts).

O botão do log inclui ticketId/ciclo e só funciona para staff/admin no canal de log correspondente. O repository é a fonte de identidade; não se consulta o canal antigo para reconstruir o ticket. É necessário que o criador ainda pertença à guild e que a configuração/roles continuem válidos.

O service verifica CLOSED e captura anterior, reserva uma reabertura, cria novo canal privado, publica a mensagem com referência ao fechamento/reabertura e anexa o HTML anterior. Mantém UUID/sequência/criador/histórico, incrementa `reopenCount`, atualiza channelId e limpa responsável/claimedAt. A reabertura pendente também pode ser retomada após falha/reinício sem alocar outra identidade. Botões de ciclos antigos não alteram o ciclo atual.

Se o canal antigo ainda existir, fica bloqueado e preservado; a reabertura cria um novo. Para evitar acumular canais antigos, use Remover canal antes de Reabrir. Não há exclusão automática de canais antigos ao reabrir.

## Privacidade e retenção de transcripts

### Dados e destinatários

Trate todo HTML gerado como documento privado de atendimento, mesmo em uma guild de teste. Ele contém nomes, IDs Discord, datas, assunto, descrição, motivo/resumo e mensagens. Os links de anexos podem incluir parâmetros assinados; não devem aparecer em logs ou commits. Escaping evita interpretar conteúdo como HTML, mas **não anonimiza** dados pessoais nem elimina segredos escritos pelos participantes.

O Message Core fornece somente mensagens `PUBLIC` para a captura; mensagens `INTERNAL` não são exportadas. O fallback legado captura as mensagens disponíveis no canal privado do ticket. A aplicação não adiciona credenciais/configuração/objetos internos do SDK ao HTML. Não há remoção automática de dados sensíveis digitados no atendimento: orientar os participantes e revisar antes de compartilhar.

O anexo final é enviado ao canal privado de logs, com permissões revalidadas no momento da publicação. Na reabertura, o HTML anterior é anexado ao **novo canal privado**, ficando disponível também ao criador do ticket, além de suporte/bot e administradores. Este comportamento existente foi preservado. Downloads e cópias já realizadas não são revogados por alterações posteriores de permissão. O acesso às cópias Discord e aos backups deve ser revisado separadamente.

Não existe rota HTTP pública para esses arquivos. Não copie o diretório para `web/public`, `web/dist`, buckets públicos ou diretórios servidos pelo proxy; não amplie `server.fs.allow` do Vite para abranger dados privados. O UUID/nome do arquivo e seu hash são referências de integridade, **não mecanismos de autorização**.

### Armazenamento e integridade

- O runtime cria `bot/src/data/ticket-transcripts/` quando necessário. `.gitignore` cobre todo esse diretório, inclusive temporários. Testes geram capturas sintéticas em diretórios temporários próprios; nenhum teste precisa dos HTMLs de runtime.
- Novos diretórios/arquivos solicitam modos POSIX `0700`/`0600`. Não são alteradas automaticamente as permissões de diretórios antigos. No Windows, restrinja as ACLs à conta do serviço e aos administradores responsáveis; os bits POSIX não garantem esse isolamento. Proteja também os diretórios pais e o volume de backup.
- As chaves seguem `UUID-ciclo-UUID.html`. A leitura rejeita traversal, links simbólicos no diretório final/arquivo, arquivos não regulares, múltiplos hardlinks e substituições detectáveis entre a inspeção e a abertura. Os diretórios pais precisam ser confiáveis; estas verificações não isolam o processo de um administrador local malicioso.
- A gravação cria um temporário exclusivo, grava e sincroniza os bytes e publica o nome final por hardlink sem sobrescrita. Depois remove somente o temporário criado pela própria operação. É necessário um filesystem com hardlinks (como NTFS/ext4); não há fallback silencioso para sobrescrita em volumes incompatíveis. Referências e HTML permanecem no formato existente.
- A limpeza ocorre também em falhas de escrita, sincronização ou publicação. Uma colisão nunca autoriza apagar o temporário de outra operação. Queda abrupta, falta de permissão na limpeza ou falha posterior ao salvar o HTML podem deixar temporários/capturas sem referência; isso exige inventário manual. Um arquivo com hardlink temporário remanescente será recusado na leitura até revisão. Não se promete durabilidade transacional entre filesystem, banco e Discord.
- O SHA-256 continua obrigatório na leitura pelo service. Capturas anteriores não são regravadas, inclusive quando muda o renderer. Para novas capturas, título, textos e atributos são escapados; links aceitam apenas HTTPS, sem credenciais/portas alternativas, nos hosts exatos `cdn.discordapp.com` e `media.discordapp.net`. Parâmetros assinados são preservados. CSP/referrer continuam restritivos; não há JavaScript nem download automático dos anexos.

### Política de retenção e revisão manual

**A política atual não tem expiração automática: a retenção é indefinida até decisão explícita do operador.** A Issue #3 não institui um prazo arbitrário nem exclui dados por idade. Isso evita quebrar leitura, reabertura, checkpoints de fechamento e a validação exigida antes de remover canais.

Antes de qualquer limpeza, o responsável deve definir e registrar prazo/finalidade e revisar separadamente: arquivos locais, referências em `closing.transcript` e em todos os `archives[].transcript`, operações interrompidas, mensagens/anexos de logs Discord e backups. Não considere um arquivo órfão apenas por ser antigo ou por não constar no último encerramento. Se o banco estiver indisponível ou o inventário for incompleto, adie a limpeza. Excluir só o arquivo local pode impedir a reabertura e não remove suas cópias externas.

Não há coleta automática de temporários deixados por uma queda de processo. Inspecione propriedade e existência de escritor ativo antes de removê-los; preserve capturas e evidências em caso de dúvida. Esta revisão não fornece nem executa um comando de exclusão em massa.

### Revisão antes de commit e resultado da auditoria (#3)

Foram encontrados quatro HTMLs no histórico: um introduzido em `d9a4478` e três em `bc34a28`. Eles contêm metadados identificáveis e conversas que não correspondem às fixtures sintéticas. Mesmo que tenham sido produzidos durante testes manuais, foram classificados como **potencialmente reais**, não como fixtures reutilizáveis. Não foram encontrados links externos nesses quatro arquivos nem correspondências com as credenciais locais verificadas; isso não prova ausência de qualquer segredo em texto livre.

Eles foram retirados somente do índice com `git rm --cached`, preservando os bytes locais, os hashes e os commits anteriores. Nenhum transcript foi substituído por conteúdo fictício no caminho de runtime, o que invalidaria hashes/referências. **A remoção do índice não apaga a exposição histórica**: o responsável pelo repositório precisa avaliar acesso, clones, artefatos de CI e eventual remediação do histórico em tarefa separada e explicitamente autorizada.

Antes de cada commit, confira `git status --short`, `git diff --cached --stat` e `git diff --cached --name-only --diff-filter=ACMR`. Não use `git add -f` em dados de runtime. Revise localmente qualquer fixture nova: nomes, IDs, mensagens, URLs, timestamps e credenciais devem ser inventados, sem copiar atendimentos reais. `.gitignore` não protege contra inclusão forçada, cópias fora do diretório ou dados já presentes no histórico.

Logs de geração usam somente IDs operacionais e contagem de mensagens; falhas de fechamento usam a classificação sanitizada de erro. Não registrar HTML, nomes, assunto, descrição, motivo/resumo, conteúdo de mensagens, URLs assinadas ou erro bruto do filesystem/SDK. Os próprios IDs operacionais continuam identificáveis e exigem controle de acesso aos logs.

Validação automatizada: `node --test bot/test/ticketTranscript.test.js bot/test/ticketTranscriptSecurity.test.js bot/test/discordTicketAdapter.test.js bot/test/tickets.test.js bot/test/ticketMessages.test.js`. Confira também a suíte completa. Validação manual: ACLs do volume real e backups, permissões reais do canal de logs, download/abertura do HTML em navegador e acesso à captura anterior após reabertura numa guild de teste com dados sintéticos. Não reutilize os arquivos identificáveis do histórico como exemplos.

## Arquitetura e pontos de extensão

```text
Ticket/commands/ticket → Ticket/handlers/ticketHandler → TicketSetupService / TicketService
                                                        ├→ TicketPermissionService
                                                        ├→ TicketTranscriptService → TicketTranscriptRepository
                                                        ├→ TicketConfigRepository / TicketRepository
                                                        └→ DiscordTicketAdapter
```

O código exclusivo da feature fica em `bot/src/Ticket/`, separado por `api`, `commands`, `domain`, `handlers`, `lib`, `providers`, `repositories` e `services`. O composition root instancia as dependências compartilhadas. O handler recebe services, interpreta componentes e produz respostas. Os services recebem DTOs com IDs/dados simples; não recebem Interaction. O adapter concentra SDK, REST, overwrites, mensagens e renderização Discord. `Ticket/lib/ticketComponents.js` reúne builders de interface. Nenhum service conhece fs; nenhum handler conhece JSON. `interactionHandlers.js` registra a feature e `commands/index.js` alimenta runtime/deploy.

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
- A IA opcional usa a conversa canônica em `ticket_messages`. Somente tickets legados ainda não sincronizados dependem temporariamente do histórico disponível no Discord para importação/fallback. Configuração, pausa, escalation, auditoria e mensagens multicanal são persistentes. Consulte [IA de tickets](ticket-ai.md) e [Message Core](ticket-messages.md).

## Validação

`npm --prefix bot test`, `npm --prefix web run build`, `git diff --check`. Nenhum teste registra comandos nem chama Discord/OpenRouter/Spotify reais. Veja a matriz de testes em `bot/test/README.md`.

Os totais da suíte mudam conforme novas etapas adicionam regressões; use a execução atual dos comandos acima como evidência, sem manter um número congelado neste documento operacional.

| Arquivos novos (caminhos relativos à raiz) | Papel |
| --- | --- |
| `bot/src/Ticket/commands/ticket.js`, `Ticket/handlers/ticketHandler.js`, `Ticket/lib/ticketComponents.js` | Comando, interações e componentes Discord |
| `bot/src/Ticket/services/ticketService.js`, `ticketSetupService.js`, `ticketPermissionService.js`, `ticketTranscriptService.js`, `ticketConstants.js` | Regras, autorização, setup, transcript e estados/eventos |
| `bot/src/Ticket/providers/discordTicketAdapter.js` | Integração Discord |
| `bot/src/Ticket/repositories/ticketRepository.js`, `ticketConfigRepository.js`, `ticketTranscriptRepository.js`, `ticketJsonStore.js` | Persistência local |
| `bot/test/tickets.test.js`, `ticketSetup.test.js`, `ticketTranscript.test.js`, `ticketHandler.test.js`, `discordTicketAdapter.test.js` (todos em test), `bot/test/helpers/ticketFixture.js` | Testes e fixture |
| `docs/tickets.md` | Operação e arquitetura do MVP |

Arquivos existentes integrados nesta etapa: `app/createServices.js`, `handlers/interactionHandlers.js`, `commands/index.js`, `config/env.js`, `index.js`, `.env.example`, `test/composition.test.js`, `test/env.test.js`, `README.md`, `bot/README.md`, `bot/test/README.md` e `docs/architecture.md`. As alterações anteriores de saneamento permanecem no workspace.
## Message Core e conversa multicanal

Desde a Etapa 3.5, novas mensagens humanas, Web e IA são persistidas em `ticket_messages`; PostgreSQL é a fonte de verdade da conversa. Discord permanece a interface atual e o transporte de entrega. O `messageCreate` persiste antes de acionar IA, e mensagens produzidas pelo Core são gravadas diretamente para evitar loops.

O transcript usa mensagens públicas canônicas quando disponíveis. Tickets anteriores à migration, sem linhas no Message Core, continuam fechando e reabrindo com fallback explícito para o histórico Discord. Ao receber a primeira mensagem nova, tickets ativos importam o canal sob demanda e de forma idempotente; não existe varredura global no startup. Mensagens internas não entram no transcript do usuário. Consulte [Message Core de tickets](ticket-messages.md) para schema, idempotência, routes, delivery/retry e smoke test.
