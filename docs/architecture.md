# Arquitetura simples do CylBot

Convenção para novas features e mudanças incrementais, sem migração obrigatória do código existente:

```text
Command / Route / Event → Handler / Controller → Service
                                                   ├→ Repository (se houver persistência)
                                                   └→ Provider (se houver integração externa)
```

Repository e provider são colaboradores do service, não uma sequência obrigatória.

## Responsabilidades

| Papel | Responsabilidade | Local sugerido no bot |
| --- | --- | --- |
| Command / Route / Event | Receber entrada Discord ou HTTP e encaminhar execução | `src/commands/`, `src/api/`, `src/events/` |
| Handler / Controller | Interpretar campos e contexto, validar formato, chamar aplicação e traduzir resultado/erro em resposta | `src/handlers/` no Discord; controller junto da feature em `src/api/` no HTTP |
| Service | Aplicar regras de negócio e invariantes, orquestrar a feature | `src/services/` |
| Repository | Ler e gravar persistência, inclusive arquivos JSON | `src/repositories/`, quando necessário |
| Provider | Encapsular serviços externos como OpenRouter, Spotify ou Discord | `src/providers/`, quando necessário |

`src/repositories/` contém a persistência JSON de anúncios e `src/providers/` contém a integração OAuth Discord. Siga os nomes camelCase existentes, como `announcementHandler.js` e `announcementService.js`, usando sufixos `Repository` e `Provider` quando esses papéis justificarem módulos próprios.

## Regras práticas

- `index.js` chama `app/createServices.js` uma vez, registra eventos e inicia serviços. Novas regras de negócio ficam na feature.
- `server.js` conecta HTTP às rotas. Novas rotas com lógica de aplicação devem delegar para handler/controller e service pequenos, sem reorganizar toda a API.
- Handler/controller cuida da interface. Regras comuns ao Discord e HTTP ficam no service, que não depende do handler/controller. Prefira passar dados simples.
- Handler e controller são nomes para o mesmo papel em interfaces diferentes; não precisam existir em sequência. Um comando trivial pode responder diretamente.
- Feature sem persistência não precisa de repository. Separe integrações em providers quando houver benefício concreto de isolamento, reutilização ou teste; não crie wrappers vazios.
- Funções, módulos e classes comuns bastam. Passe colaboradores por argumento ou construtor quando precisar substituí-los nos testes, sem contêiner de dependências ou classes-base.
- No React, componentes cuidam de apresentação e estado visual. Conforme a feature crescer, extraia chamadas HTTP para um módulo da própria feature e coordenação da tela para um hook, se necessário. Regras compartilhadas ficam no backend; não replique todas as camadas no navegador.
- Teste regras relevantes com `node:test`, substitutos locais para integrações e arquivos temporários. Não crie abstrações só para satisfazer o diagrama.

## Padrão para novas features

Comando trivial: `command → reply`, como `/ping`. Feature real: `command → handler → service → repository/provider`, usando apenas os colaboradores necessários. Tickets seguem esse fluxo: `/ticket → ticketHandler → TicketSetupService/TicketService → repositories/DiscordTicketAdapter`. Veja o [MVP de tickets](tickets.md).

Service recebe dados simples, nunca uma `Interaction`:

```js
ticketService.create({ guildId, userId, channelId, categoryId, subject, description });
```

Handler traduz campos e identidade Discord; rota faz o equivalente HTTP. Ambos chamam as mesmas regras no service, incluindo autorização de domínio, sem confiar apenas nos controles visuais. `commands/index.js` permanece a fonte oficial dos slash commands, consumida pelo runtime e por `deploy-commands.js`.

## Composição e estado temporário

```text
index.js → createServices(client, config) → services
                                           ├→ client.services → Discord
                                           └→ startApiServer(client, services, config.api)
```

O composition root cria uma instância de OpenRouter, compartilhada por Texta_AI e anúncios, e uma instância de TextaAIService compartilhada pelos dois adapters. Cria também o repository JSON, AnnouncementDraftManager e AnnouncementService compartilhados; o provider OAuth compartilhado por AuthService e DashboardService; e AuthSessionManager. PresenceManager e CallSenseManager são montados ali, mantendo os aliases `client.presenceManager` e `client.callSenseManager` usados pelos comandos/eventos existentes. Não há container de DI nem singleton de domínio criado na importação de handlers/services.

As sessões temporárias de Texta_AI pertencem somente ao Discord: a instância compartilhada possui o manager, mas a API usa apenas `generate(input, options)` sem consultar sessões Discord. O formulário Web mantém seu estado no React. Prévias de anúncios permanecem no manager compartilhado, isoladas por owner e guild: o adapter Web usa `web:<userId>` e o Discord usa o ID do usuário. Sessões/states OAuth são separados desses drafts. Nada disso persiste após reiniciar o processo.

`handlers/interactionHandlers.js` lista os adapters de anúncios e Texta_AI e entrega a dependência correspondente de `client.services`. `interactionCreate` percorre o registry na ordem existente e para no primeiro resultado verdadeiro; se nenhum consumir a interação, mantém o despacho de slash commands. Para acrescentar um handler, adicione uma entrada nesse array.

O MVP acrescenta `ticketHandler` ao mesmo registry. `createServices` monta TicketService e TicketSetupService com o mesmo repository de configuração, adapter Discord e serviço de permissões; TicketService usa também repository de tickets e serviço/repository de transcripts. Não há services criados no handler. O bootstrap adiciona intents de mensagens somente quando `config.tickets.messageContentEnabled` é habilitado.

Ticket é uma entidade persistida independente do channelId, com UUID, sequência por guild, estados OPEN/CLAIMED/CLOSED/REOPENED, eventos e arquivos de ciclos encerrados. PostgreSQL é a referência quando `DATABASE_URL` está configurada; o fallback JSON é somente para desenvolvimento. A state machine e os checkpoints de close/reopen ficam no core, enquanto um bloqueio em memória por guild apenas melhora a UX. Canais só podem ser removidos por staff após conferência de estado, transcript íntegro e log final. A reabertura consulta o repository e cria outro canal mantendo a identidade. Contratos, permissões, falhas e limites estão em [docs/tickets.md](tickets.md).

A API Web de tickets e o listener Discord usam o mesmo `TicketAIService`, sem duplicar prompt, policy ou ações. O composition root compartilha a única instância de `OpenRouterService` entre Texta_AI, anúncios e tickets. `TicketAIContextService` limita e separa contexto não confiável; `TicketAIPolicyService` decide autorização sem delegá-la ao modelo; `TicketAIActionService` não possui acesso a close/delete. Configuração, pausa, escalation, lease e auditoria usam repositories PostgreSQL. Veja [IA de tickets](ticket-ai.md).

```text
messageCreate / ticketAIHandler / ticketAIRoutes
                    ↓
             TicketAIService
       ┌────────────┼────────────┐
  ContextService  OpenRouter  PolicyService
                    ↓
              AIActionService
                    ↓
       DiscordTicketAdapter + PostgreSQL
```

O listener mantém debounce curto em memória, mas esse Map não é autoridade. Antes de publicar, o action service abre uma transação curta, bloqueia ticket/estado de IA, revalida Core/configuração/lease/pausa/identidade e reserva uma mensagem. O commit ocorre antes da chamada Discord; `SENT`/`FAILED` é gravado depois. Operações concorrentes de claim/close aguardam o lock e prevalecem antes da reserva. O modelo nunca recebe ferramentas.

O Message Core separa conversa e transporte:

```text
Discord / Web / IA → TicketMessageService → PostgresTicketMessageRepository
                              ├→ TicketAIContextService
                              ├→ TicketTranscriptService
                              └→ DiscordTicketAdapter
```

`ticket_messages` é a conversa canônica. O adapter Discord publica e ingere, mas não determina autoria nem histórico. Routes de conversa validam membership OAuth e depois `VIEW/RESPOND`; configuração administrativa preserva ManageGuild. Tickets antigos sem mensagens canônicas usam fallback controlado do transcript para o histórico Discord. Detalhes em [Message Core](ticket-messages.md).

## Origens por ambiente

Somente `config/env.js` detecta Codespaces e deriva `auth.webOrigin`, `allowedOrigins`, `secure` e `redirectUri`. Valores explícitos de WEB_ORIGIN/callback prevalecem; sem eles, Codespaces usa nome e domínio de forwarding do processo, e o ambiente local usa `http://localhost:5173`.

| Ambiente | Origens permitidas para CORS e operações mutáveis |
| --- | --- |
| Desenvolvimento (padrão) | WEB_ORIGIN configurada/detectada, `http://localhost:5173`, `http://127.0.0.1:5173` e origem exata do Codespace atual detectado |
| `NODE_ENV=production` | Somente WEB_ORIGIN configurada/detectada, sem acréscimos de DEV |

Não há autorização por regex de domínio: a validação compara a Origin inteira com a allowlist. Origin ausente, `null`, outra porta ou outro Codespace é rejeitada em operações mutáveis. CORS responde com a origem permitida da requisição, credentials e `Vary: Origin`, sem wildcard. OPTIONS continua público; para origens não permitidas não são emitidos headers de autorização CORS. Requisições sem Origin mantêm o header CORS da origem principal, mas não passam pela proteção de operações mutáveis.

O proxy Vite preserva o header Origin recebido, inclusive sua ausência. A Web só importa do bot as constantes de headers de segurança, sem configuração, services ou segredos. Cookies e callback continuam vinculados à origem principal; use o mesmo hostname durante todo o login. Ao acessar por `127.0.0.1`, configure WEB_ORIGIN/callback correspondentes se quiser fazer o login por esse hostname. Em Codespaces, o fluxo padrão é pelo endereço HTTPS detectado. Cadastre o callback correspondente no Discord Developer Portal. A allowlist não compartilha cookies entre hosts.

Para produção, defina `NODE_ENV=production`, WEB_ORIGIN HTTPS explícita e o callback cadastrado. A detecção/fallback continua disponível, mas produção não inclui automaticamente localhost, loopback ou Codespaces como origens adicionais. Deploy/reverse proxy de produção não é implementado aqui.

## Auditoria do saneamento

Ocorrências remanescentes nas buscas do código, testes e documentação (excluídos dependências, build, metadados Git e `.env` privado):

| Busca | Ocorrências e motivo |
| --- | --- |
| `new OpenRouterService` | Uma no runtime, em `app/createServices.js`. As demais estão em `api`, `env`, `logger`, `security` e `openRouterOutput.test.js`, construindo providers isolados, sem geração externa real. |
| `new TextaAIService` | Uma no runtime, no composition root. As demais estão nos testes `api`, `textaAIHandler` e `textaAIService`, com IA simulada. |
| `setHeader('origin'` | Nenhuma; o teste com Vite real verifica preservação do header, inclusive quando ausente. |
| `requireTrustedOrigin` | Definição/exportação em `http/auth.js`, importação/chamada no dispatcher e no logout, e testes diretos em `origins.test.js`. Ambos os consumidores usam `auth.allowedOrigins`. A verificação local do logout foi preservada. |
| `app.github.dev` | Default de domínio em `config/env.js` e `.env.example`; exemplos de callback no README raiz; fixtures nos testes `auth`, `env`, `origins` e `viteProxy`. Nenhuma autorização genérica por sufixo. |
| `process.env` | Acesso executável somente em `config/env.js`. Demais referências em comentários do helper de isolamento e documentação explicam essa fronteira. |
| `DISCORD_OAUTH_CLIENT_SECRET` | Leitura na config, campo vazio no exemplo, instruções/placeholder explícito nos READMEs e valores sintéticos nos testes `auth`, `env` e `logger`. O exemplo não contém credenciais preenchidas. |

A inspeção dos imports locais de `bot/src` não identificou ciclos. IDs despachados usam `ann:` e `texta_ai:`; nomes curtos dos inputs de modais de anúncios continuam locais ao modal, sem participar do registry global. Não foram encontradas novas leituras de ambiente fora da config nem criação de services dentro dos handlers.

Os comandos triviais continuam respondendo diretamente. Presence/CallSense preservam suas verificações de owner no adapter Discord e a configuração existente; antes de expor esses managers via Web, será necessário tornar essa autorização reutilizável. Anúncios mantêm a verificação de edição no service e as verificações efetivas de canal nos adapters. A importação Web → bot continua limitada às constantes de segurança do Vite. Esses limites não exigem reorganizar as features existentes neste saneamento.

Validação: a suíte cobre proxy Vite real em loopback, allowlist, composição e regressões OAuth/dashboard/anúncios/Texta_AI/rate limiting. Use a execução atual de `npm --prefix bot test`, do build Web e de `git diff --check`; este documento não congela a contagem, que cresce com novas etapas. Integrações externas são simuladas; o login real no Discord e o túnel hospedado de Codespaces não são exercitados. Os testes do proxy exigem também as dependências de `web/` e permissão para subprocessos/conexões locais.

## Aderência parcial atual

| Fluxo | Separação existente e limite |
| --- | --- |
| Comando/interações de anúncios → `announcementHandler.js` → `AnnouncementService` → `JsonAnnouncementRepository` | Handler interpreta interações; service compartilha regras com a API, delega persistência ao repository e ciclo de vida das prévias ao AnnouncementDraftManager. Montagem de embeds e envio ao Discord continuam no service. |
| Discord / rota AI → `TextaAIService` → `OpenRouterService` / `TextaAISessionManager` | Service centraliza geração, validação e coordenação das sessões. Adapters cuidam de entrada, respostas e renderização. |
| `api/server.js` → `api/routes/*` → services / cliente Discord | Servidor cuida do HTTP comum; rotas interpretam a entrada, validam e delegam. A montagem e o envio de mensagens ficam na rota Discord, sem nova camada artificial. |
| Eventos/comandos → `PresenceManager` / `CallSenseManager` | Há delegação para módulos de aplicação; PresenceManager também concentra Spotify e atualizações no Discord. |
| `src/index.js` → eventos, managers e API | Atua principalmente na montagem e inicialização. |
| `web/src/anuncios/` e `web/src/texta_ai/` | Telas agrupadas por feature; componentes ainda concentram estado, HTTP e apresentação. |

Esses limites descrevem o estado atual, sem exigir refatoração nesta etapa.

## Riscos futuros (não implementados)

- Limites em memória são por instância; revisar implantação, proteção contra múltiplas contas e custos globais antes de ampliar exposição.
- Persistência JSON de anúncios pressupõe uma instância; avaliar concorrência e backups antes de ampliar operação. Prévias em memória são perdidas no reinício.
- API, handlers e telas podem acumular responsabilidades; separar conforme necessidades concretas das novas features.
- Testes cobrem anúncios e contratos HTTP com integrações substituídas localmente; não garantem integrações reais Discord/OpenRouter nem todos os fluxos Texta_AI, Spotify ou frontend.
- Conferir requisitos de runtime das duas aplicações antes de definir uma versão única de Node: o `engines` do bot não declara o requisito do frontend.


## Organização da API HTTP

```text
bot/src/api/
├── server.js
├── http/
│   ├── json.js
│   ├── errors.js
│   └── cors.js
└── routes/
    ├── healthRoutes.js
    ├── aiRoutes.js
    ├── discordRoutes.js
    └── announcementRoutes.js
```

- `server.js`: monta o contexto `{ client, services }`, cria o servidor nativo, aplica CORS/OPTIONS, percorre as rotas e centraliza 404, erros e listener em `127.0.0.1`.
- `http/json.js`: lê JSON com o limite existente e serializa respostas.
- `http/errors.js`: cria erros controlados com `statusCode`.
- `http/cors.js`: mantém a origem permitida `http://localhost:5173`, métodos e headers atuais.
- `healthRoutes.js`: responde `GET /api/health` com `{ ok: true }`.
- `aiRoutes.js`: lê `POST /api/ai/generate` e chama TextaAIService pelo contexto, fornecendo as opções que preservam o contrato HTTP.
- `discordRoutes.js`: valida `POST /api/discord/send`, monta a mensagem e publica com `allowedMentions: { parse: [] }`.
- `announcementRoutes.js`: atende os POSTs de categorias, padrões, geração/revisão e envio, preservando validação de guild, drafts e contexto local confiável criado no backend.

Cada módulo exporta `handle(request, response, context)`: retorna `false` quando método/path não correspondem e `true` depois de responder. Erros são lançados para o tratamento central. As rotas exercem também o papel de controller; não precisam de outro arquivo só para encaminhar chamadas. Dependências de aplicação vêm do contexto; utilitários HTTP são importados diretamente.

### Adicionar uma rota

1. Implemente o endpoint no módulo do domínio; crie um novo módulo apenas para um novo domínio.
2. Verifique método/path antes de ler o body ou executar operações. Preserve os contratos existentes ao ampliar um módulo.
3. Use `readJson`, valide a entrada, chame o service recebido no contexto e responda com `sendJson`. Use `clientError` para erros controlados; deixe erros inesperados chegarem ao servidor, que responde 500 genérico e registra o erro internamente.
4. Para um módulo novo, inclua-o na lista `routes` de `server.js`. Passe dependências adicionais no contexto somente quando necessárias.
5. Adicione testes em `bot/test/api.test.js` para sucesso, validações e método incorreto. `createRequestHandler(context)` permite testar o callback HTTP sem abrir portas.

### Validar

A partir da raiz `/workspaces/CylBot`:

```bash
npm --prefix bot test
npm --prefix web run build
git diff --check
```

Se o terminal já estiver em `/workspaces/CylBot/bot`:

```bash
npm test
npm --prefix ../web run build
git diff --check
```

A reorganização inicial preservou os contratos. O hardening posterior exige sessão/Origin e autorização de guild nas ferramentas e remove o contexto local de confiança; veja a seção de segurança abaixo.


## Persistência de anúncios

```text
AnnouncementHandler / announcementRoutes
                 ↓
        AnnouncementService
                 ↓
     JsonAnnouncementRepository
                 ↓
   bot/data/announcements.json
```

O repository de anúncios é uma dependência JavaScript simples, sem interface formal, classe-base ou camada intermediária. O service recebe um objeto com duas operações síncronas:

- `getCategories(guildId)`: retorna as categorias persistidas ou `undefined` quando a guild não possui dados. Retorna dados independentes do estado persistido; modificá-los não deve gravar implicitamente.
- `saveCategories(guildId, categories)`: grava a lista completa da guild, preservando as demais guilds; propaga erros de persistência.

`JsonAnnouncementRepository` implementa esse contrato e oferece `readAll()` para carregar o documento. Seu construtor aceita um caminho opcional e usa `bot/data/announcements.json` por padrão. Arquivo ausente equivale a dados vazios; erros de leitura e JSON inválido continuam sendo propagados. Nenhuma migração de formato é necessária.

O service mantém categorias padrão, autorização, limites, duplicidade, validação de imagens, IA e envio; coordena o ciclo de vida dos drafts pelo AnnouncementDraftManager. Ele não conhece caminhos, serialização ou detalhes de escrita. A instância exportada `announcements` é montada com `new AnnouncementService(new JsonAnnouncementRepository())`, preservando os imports de handlers e rotas.

Nos testes, a construção passa a ser:

```js
const repository = new JsonAnnouncementRepository(tempFile);
const service = new AnnouncementService(repository, fakeAI);
```

Também é possível passar um objeto em memória que implemente as duas operações, sem filesystem. Os métodos públicos `categories`, `save`, `generate`, `get` e `send` mantêm as assinaturas anteriores; o construtor recebe o repository no lugar do caminho de arquivo.

A implementação JSON mantém criação automática do diretório e a sequência **escrever temporário → rename**, no mesmo diretório. Uma falha antes do rename preserva o arquivo anterior; o erro chega ao chamador. Um temporário pode permanecer após uma falha e será sobrescrito na próxima tentativa, como antes.

O armazenamento continua síncrono e pressupõe uma única instância. O rename não coordena atualizações entre processos nem substitui backups; não foram introduzidos locks, filas ou garantias adicionais de durabilidade. Drafts continuam apenas em memória.


## Ciclo de vida das prévias de anúncios

`AnnouncementDraftManager` concentra o estado em memória das prévias: Map, IDs, owner/guild, canal, TTL de 15 minutos, busy, substituição, remoção e limpeza de expirados. Ele armazena o conteúdo fornecido pelo service sem interpretar categorias, embeds ou regras de publicação. Não depende de Discord, IA, repository ou permissões administrativas.

O manager foi extraído porque tem estado e ciclo de vida próprios, testáveis sem filesystem ou serviços externos. O fluxo permanece:

1. O service valida a entrada e recupera a prévia pelo manager quando houver revisão.
2. Antes de aguardar IA ou envio, marca a prévia como busy. Uma segunda operação sobre a mesma prévia recebe o erro existente.
3. Uma revisão concluída cria uma nova prévia e remove a anterior. Falhas preservam a anterior.
4. Um envio concluído remove a prévia. Em falhas, ela permanece disponível até expirar.
5. O service libera busy em `finally`, inclusive se a referência já tiver sido removida ou expirado.

`get` continua verificando owner, guild e expiração e devolve a mesma referência do draft, preservando o contrato anterior. Não renova o TTL. A limpeza de expirados continua ocorrendo na criação de uma nova prévia, sem timers. As operações de mutação do manager são internas à aplicação: o service obtém a referência validada por `get` antes de usá-las; não são uma nova interface de autorização para entradas externas.

O construtor aceita um terceiro argumento opcional:

```js
const service = new AnnouncementService(repository, ai, draftManager);
```

Sem esse argumento, cada service recebe um novo manager. `categories`, `save`, `generate`, `get` e `send` mantêm suas assinaturas; handlers e rotas não acessam o Map.

### O que permanece no service

- Regras e autorização de categorias, validação e coordenação com repository e IA.
- Orquestração de geração/revisão e publicação com o manager.
- `buildAnnouncementEmbed`, função interna para título, descrição, cor, imagem e footer/data: lógica curta e específica, sem estado que justifique outro módulo.
- Validação de destino e `channel.send` com `allowedMentions`: integração curta, deliberadamente mantida para evitar um provider que apenas repasse chamadas. A dependência de Discord continua explícita.

A extração não adiciona persistência de drafts ou coordenação entre processos. Prévias se perdem no reinício; busy protege apenas operações sobre a mesma prévia na instância atual. Uma operação iniciada antes do TTL pode terminar depois dele, como antes. Falhas de rede após o Discord aceitar uma mensagem ainda podem deixar o resultado do envio incerto; não há garantia distribuída de entrega única.


## Texta_AI compartilhado entre Discord e Web

```text
textaAIHandler ─┐
               ├→ TextaAIService → OpenRouterService
aiRoutes ──────┘        └────────→ TextaAISessionManager (fluxo Discord)
```

`TextaAIService` recebe `{ ai, sessions }` por construtor. O composition root monta uma instância compartilhada pelo handler e pela API; o manager atende somente ao fluxo Discord, sem criar sessões web.

- `generate(input, options)` concentra preparação de campos, validação e geração inicial/revisão sem estado. A revisão usa `originalContext`, `currentText` e `additionalContext` na mesma chamada ao provider.
- `create`, `beginRevision`, `claimRevision` e `generateSession` coordenam o manager e atualizam o texto gerado/reaproveitado. O texto de revisão de um embed Discord continua sendo título e descrição unidos por uma quebra de linha.
- `claimForSend` verifica a sessão e o canal original; `markSent`, `release`, `discard` e `getStatus` permitem que o adapter comunique o resultado da operação e apresente as respostas existentes.
- O manager continua responsável por armazenamento, ownership, TTL de 10 minutos, claim/release e expiração. A ativação após geração preserva o TTL existente; falha de geração remove a sessão, enquanto falha de envio permite nova tentativa, como antes.
- O provider continua cuidando de modelo, prompt, parsing, schema, validação da saída, timeout e erros externos. Anúncios continuam usando seu próprio fluxo, sem alteração.

### Diferenças de interface preservadas

| Aspecto | Discord | Web/API |
| --- | --- | --- |
| Tamanho solicitado | 1–2.000; parsing do campo do modal no handler | 20–2.000; conversão numérica existente |
| Espaços nas bordas | Mantidos na entrada do modal | Removidos dos textos |
| Texto anterior de revisão | Pode conter um embed maior que 2.000 caracteres | Continua limitado a 2.000 |
| Estado | Sessões privadas do manager | Request inclui o estado mantido pelo frontend |
| Falhas | Handler apresenta mensagens privadas | Tratamento HTTP central mantém status/JSON |

A rota fornece opções fixas (`trimText`, `minTargetCharacters`, `maxContextLength`) ao service; campos equivalentes enviados no body não podem sobrescrevê-las. Essas opções preservam os contratos existentes, sem duplicar o algoritmo de validação nas interfaces. O handler mantém a resposta imediata de tamanho inválido do modal e usa o mesmo método central de geração por meio de `generateSession`.

Modal, botões, custom IDs, preview, montagem de embeds, desativação de componentes e chamadas de publicação/resposta Discord continuam no handler. O service não recebe `Interaction`, não importa builders Discord e não retorna textos de preview. Mensagens e códigos dos erros de validação existentes são preservados. A rota de envio `/api/discord/send` permanece com seu contrato anterior.

### Limitações mantidas

A entrada e as rotas Web verificam sessão OAuth; geração geral de IA exige sessão, enquanto anúncios/publicações também exigem autorização da guild. Sessões Discord se perdem no reinício. A revisão de um embed longo continua sujeita ao limite menor do contrato Web. Problemas de confirmação/edição de mensagens Discord e de entrega após falhas de rede não são resolvidos nesta reorganização.


## Configuração central de runtime

```text
.env / process.env → config/env.js → configuração por domínio → consumidores
```

`loadEnv(source, options)` é uma função testável com objetos locais; valida e normaliza sem ler ambiente nem alterar globals. Por padrão exige as credenciais Discord. `getConfig(options)` carrega dotenv e o ambiente uma vez, retorna os grupos `discord`, `api`, `openRouter`, `spotify`, `logging`, `auth` e `tools`, e permite aos entrypoints exigir as credenciais necessárias à operação.

- `src/index.js` e `scripts/deploy-commands.js` usam `getConfig({ requireDiscord: true })` antes de conectar/registrar comandos.
- `scripts/spotify-auth.js` usa `getConfig({ requireSpotifyAuth: true })`; Discord não é requisito desse auxiliar. Seu refresh token é entregue em arquivo temporário privado, não em logs.
- `OpenRouterService(config.openRouter)` recebe chave, modelo e limite normalizados; não lê o ambiente nem recalcula defaults.
- `startApiServer(client, config.api)` recebe a porta numérica e mantém o listener local.
- A montagem das instâncias de IA em anúncios, handler Texta_AI e API usa o grupo `openRouter`. `config/presence.js` consome o grupo `spotify` mantendo seus IDs e intervalos fixos.

Somente `config/env.js` acessa `process.env`. Importação de módulos para testes não exige credenciais Discord; o fail-fast das credenciais ocorre nos entrypoints. Valores opcionais fornecidos e inválidos são rejeitados; integrações ausentes continuam opcionais. Não há refresh automático de configuração ou mudança de autenticação.

Os defaults e a classificação das variáveis estão em `bot/.env.example` e `bot/README.md`. A configuração de runtime não contém regras persistentes por guild. Os caminhos JSON e parâmetros técnicos fixos dos providers permanecem nos módulos responsáveis; não foram criadas novas variáveis de ambiente para eles.

## Logging estruturado

Novos módulos usam `logger` de `bot/src/lib/logger.js`. A implementação pequena sobre console emite JSON e expõe `debug`, `info`, `warn` e `error`; não há framework ou transporte externo. `createLogger` permite injetar nível, credenciais a ocultar e saída nos testes. O logger de runtime consome `config.logging.level` (`LOG_LEVEL`, default `info`) e as credenciais da configuração central para redaction.

```js
logger.info('announcement.sent', {
  module: 'announcementService', operation: 'announcement.send',
  guildId, channelId, userId,
});
```

Use eventos estáveis `<domínio>.<resultado>` e contexto disponível, sem inventar identidade. Em anúncios web, `userId: "web:<id>"` identifica o proprietário autenticado da prévia. Detalhes frequentes ficam em debug; marcos normais em info; falhas recuperáveis em warn; operações que falharam em error. Registre falhas na fronteira que as trata, evitando repetir o mesmo erro em todas as camadas. O provider registra a resposta inválida somente com motivo/tamanho; o adapter pode registrar a falha final da operação com IDs e contexto próprios.

A API gera um UUID no início da chamada, cria contexto próprio para as rotas e devolve `X-Request-Id`. `api.request_failed` inclui método, caminho sem query, status e esse ID. O contexto compartilhado não é mutado. A correlação termina nessa fronteira; não usa AsyncLocalStorage nem propagação automática para services/providers. Os contratos JSON não mudam.

O logger seleciona `name`, `message`, `code`, `status` e `statusCode` de Error, sem stack, cause ou campos arbitrários do SDK. Faz redaction recursiva de campos sensíveis, credenciais configuradas e padrões de autenticação em strings; limita profundidade, quantidade de campos e tamanho de strings. Falhas de serialização/saída são descartadas para não interromper a aplicação. Isso não substitui escolher contexto seguro: não passe request, body, prompt, resposta bruta da IA ou configuração inteira. Texto livre e credenciais desconhecidas não têm garantia geral de anonimização.

Console direto fica restrito ao logger e à saída interativa dos dois scripts operacionais, que sanitizam erros. Não há coleta remota, rotação, persistência dos logs ou tracing distribuído. Omitir stacks reduz o detalhe disponível para diagnóstico; testes e eventos/contexto selecionados continuam necessários.

## Fundação de autenticação Web

```text
LoginPage / useAuth / authApi
            ↓
authRoutes → AuthService → DiscordOAuthProvider
                  ↓
          AuthSessionManager
```

O provider recebe configuração e fetch por construtor: constrói a URL OAuth, troca code via POST form e busca `/users/@me` com Bearer. Usa timeout, não segue redirects externos e converte falhas em erros controlados, sem propagar body/headers ou mensagens externas. São solicitados `identify guilds`: perfil básico e listagem dos servidores para o dashboard. Não há repository porque esta fase não persiste sessões.

AuthService coordena states em Map (cinco minutos), vínculo ao navegador, consumo antes da primeira operação assíncrona e criação/substituição de sessão. AuthSessionManager mantém sessões com TTL absoluto e tokens exclusivamente no backend. As rotas traduzem cookies, redirects, perfil público e logout. A configuração vem de `config/env.js` e é injetada pelo composition root; nenhum desses componentes acessa `process.env`.

Cookies temporários de state/vínculo e cookie opaco de sessão são HttpOnly/Lax, sem Domain. Secure é derivado da origem HTTPS validada. Login/callback/me não aceitam destino de redirect do usuário; o retorno é sempre WEB_ORIGIN configurado. Logout exige POST e Origin presente na allowlist para proteção contra CSRF. CORS usa a mesma lista explícita e credentials. Site e callback compartilham origem externa por proxy; não há infraestrutura nova.

AuthGate controla loading, falha de conexão, LoginPage e conteúdo autenticado. A raiz autenticada mostra o dashboard com perfil, servidores e logout; os hashes das ferramentas permanecem disponíveis. authApi concentra fetch com credentials. Tokens nunca são enviados ao React e não há armazenamento browser de credenciais.

A fundação OAuth agora é reutilizada pelas APIs de ferramentas: sessão, Origin e rate limit são verificados antes das operações. Anúncios/publicação também verificam guild gerenciável, conforme a seção de segurança abaixo. Sessões/states continuam em memória, sem refresh automático ou coordenação entre processos.

## Dashboard de servidores

```text
Dashboard / dashboardApi
          ↓
dashboardRoutes → AuthSessionManager (cookie → sessão)
          ↓
DashboardService → DiscordOAuthProvider.getCurrentUserGuilds
          ↓
client.guilds.cache + canManageGuild → DTO público
```

`DashboardService` recebe provider, client e relógio. Não lê request, cookies ou configuração global. `canManageGuild`, exportada no mesmo arquivo, concentra owner/Administrator/ManageGuild com BigInt; não há bitwise no React. O provider normaliza somente id/name/icon/owner/permissions e não decide acesso. O service monta CDN, cruza instalação pelo cache e ordena o DTO. Um client ainda não pronto causa 503, evitando falso “não instalado”.

A rota exige sessão e ignora identidade, tokens e permissões de query/body. Seleciona contexto de log sem lista de guilds ou erro bruto. Tokens vencidos, scopes ausentes e Discord 401/403 exigem novo login e invalidam sessão/cookie; falhas transitórias preservam a sessão. A sessão registra scopes retornados na troca, sem presumir que uma sessão antiga autorizou `guilds`. Não há refresh automático.

A UI usa hash routing `#/dashboard` e `#/dashboard/:guildId`. Cards mostram instalação/acesso, ícone ou fallback, loading/erro/estado vazio. Somente DTOs marcados como instalados e gerenciáveis abrem o placeholder de gerenciamento; ele não executa ações administrativas. Convite permanece desabilitado. Uma resposta 401 limpa o estado autenticado no React e mostra orientação de novo login.

O DTO do dashboard não concede autorização ao navegador. Anúncios e envio reaproveitam `DashboardService.requireManageableGuild`, que refaz a consulta ao provider e usa `canManageGuild` no backend antes de agir. Não há repository novo, listagem de canais, painel de guild, RBAC complexo ou banco.
## Segurança das rotas Web

O dispatcher aplica sessão via `http/auth.js`, Origin, rate limit e headers. `requireSession` também é usado pelo dashboard e para revalidar sessões após esperas de rede antes de publicar. `DashboardService.requireManageableGuild` concentra autorização, sem duplicar BigInt. O adapter de anúncios cria sua capacidade interna de edição somente após essa verificação; não há bypass trustedLocal nem owner compartilhado.

`http/channelPermissions.js` confere guild/canal e permissões efetivas do bot. A rota de envio direto deriva a guild do objeto Discord, nunca do body. `rateLimit.js` mantém janelas fixas, cleanup e capacidade máxima; o contexto permite injeção de relógio/limiter nos testes. Não há middleware framework, cache distribuído ou novo modelo de roles.

`http/errors.js` identifica erros controlados por WeakSet interno. Services que geram validações conhecidas usam esse helper mantendo mensagens/status existentes. Erros externos não são expostos por terem um campo statusCode. `readJson` limita bytes e deixa de acumular após rejeição. Os headers constantes são reutilizados pela API e pelo Vite sem carregar configuração ou segredos no frontend.

Limites, endpoints, comportamento de proxy e exceções OAuth estão documentados em [segurança das APIs](../bot/README.md#segurança-das-apis-web). Autorização não é atômica com o envio Discord; não há entrega única distribuída ou garantia de gastos globais por várias contas. Estas proteções não implementam a seleção de canais ou integração de dashboard da Etapa C.
