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

`src/repositories/` contém a persistência JSON de anúncios. `src/providers/` continua sendo uma sugestão para quando houver necessidade concreta. Siga os nomes camelCase existentes, como `announcementHandler.js` e `announcementService.js`, usando sufixos `Repository` e `Provider` quando esses papéis justificarem módulos próprios.

## Regras práticas

- `index.js` monta dependências, registra eventos e inicia serviços. Novas regras de negócio ficam na feature.
- `server.js` conecta HTTP às rotas. Novas rotas com lógica de aplicação devem delegar para handler/controller e service pequenos, sem reorganizar toda a API.
- Handler/controller cuida da interface. Regras comuns ao Discord e HTTP ficam no service, que não depende do handler/controller. Prefira passar dados simples.
- Handler e controller são nomes para o mesmo papel em interfaces diferentes; não precisam existir em sequência. Um comando trivial pode responder diretamente.
- Feature sem persistência não precisa de repository. Separe integrações em providers quando houver benefício concreto de isolamento, reutilização ou teste; não crie wrappers vazios.
- Funções, módulos e classes comuns bastam. Passe colaboradores por argumento ou construtor quando precisar substituí-los nos testes, sem contêiner de dependências ou classes-base.
- No React, componentes cuidam de apresentação e estado visual. Conforme a feature crescer, extraia chamadas HTTP para um módulo da própria feature e coordenação da tela para um hook, se necessário. Regras compartilhadas ficam no backend; não replique todas as camadas no navegador.
- Teste regras relevantes com `node:test`, substitutos locais para integrações e arquivos temporários. Não crie abstrações só para satisfazer o diagrama.

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

- APIs das ferramentas ainda sem exigência de sessão: integrar autenticação e autorização por servidor/canal antes de exposição pública.
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

A reorganização não adiciona autenticação nem modifica CORS ou exposição de rede. O contexto local de anúncios continua sendo uma exceção de confiança do ambiente, não uma identidade Discord; proxies e portas encaminhadas ainda precisam ficar restritos ao ambiente confiável.


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

`TextaAIService` recebe `{ ai, sessions }` por construtor. O handler mantém sua instância com o manager existente; a API monta uma instância com o mesmo código de aplicação, sem criar sessões web. Não é necessário compartilhar a mesma instância para reutilizar a lógica.

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

A entrada Web agora identifica o usuário via OAuth, mas as rotas de ferramentas ainda usam a confiança no ambiente local; não consomem a sessão de autenticação. Sessões Discord se perdem no reinício. A revisão de um embed longo continua sujeita ao limite menor do contrato Web. Problemas de confirmação/edição de mensagens Discord e de entrega após falhas de rede não são resolvidos nesta reorganização.


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

Use eventos estáveis `<domínio>.<resultado>` e contexto disponível, sem inventar identidade. Em anúncios web, `userId: "local-web"` continua representando o operador local sem autenticação. Detalhes frequentes ficam em debug; marcos normais em info; falhas recuperáveis em warn; operações que falharam em error. Registre falhas na fronteira que as trata, evitando repetir o mesmo erro em todas as camadas. O provider registra a resposta inválida somente com motivo/tamanho; o adapter pode registrar a falha final da operação com IDs e contexto próprios.

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

AuthService coordena states em Map (cinco minutos), vínculo ao navegador, consumo antes da primeira operação assíncrona e criação/substituição de sessão. AuthSessionManager mantém sessões com TTL absoluto e tokens exclusivamente no backend. As rotas traduzem cookies, redirects, perfil público e logout. A configuração é montada no bootstrap da API; nenhum desses componentes acessa `process.env`.

Cookies temporários de state/vínculo e cookie opaco de sessão são HttpOnly/Lax, sem Domain. Secure é derivado da origem HTTPS validada. Login/callback/me não aceitam destino de redirect do usuário; o retorno é sempre WEB_ORIGIN configurado. Logout exige POST e Origin exata para proteção contra CSRF. CORS tem origem explícita e credentials. Site e callback compartilham origem externa por proxy; não há infraestrutura nova.

AuthGate controla loading, falha de conexão, LoginPage e conteúdo autenticado. A raiz autenticada mostra o dashboard com perfil, servidores e logout; os hashes das ferramentas permanecem disponíveis. authApi concentra fetch com credentials. Tokens nunca são enviados ao React e não há armazenamento browser de credenciais.

Esta fundação não converte a identidade em autorização das ferramentas: por decisão de escopo, suas APIs permanecem no modelo local existente e não exigem sessão. A implantação pública continua bloqueada por essa limitação arquitetural. Próximas etapas devem integrar sessão e permissões verificadas antes de abrir acesso. Sessões/states são limitados em memória, sem coordenação entre processos, rate limiting por IP ou renovação/revogação automática de tokens. Detalhes operacionais em [bot/README.md](../bot/README.md#autenticação-web-com-discord).

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

Anúncios/Texta_AI não usam o dashboard para autorizar chamadas; os contratos e o contexto local dessas ferramentas permanecem iguais. Futuras operações administrativas precisam verificar permissões novamente no backend, sem confiar na lista previamente exibida. Não há repository novo, listagem de canais, painel de guild, RBAC complexo, banco ou cache distribuído.
