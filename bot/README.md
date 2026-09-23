# CylBot

Base modular para um bot do Discord usando Node.js e discord.js.

## Estrutura

- `src/commands/`: definição e execução dos slash commands.
- `src/events/`: listeners de eventos do Discord.
- `src/handlers/`: processamento centralizado das interações.
- `src/config/`: leitura e validação da configuração da aplicação.
- `src/index.js`: ponto de entrada e montagem do cliente.
- `scripts/`: tarefas operacionais, como o registro dos comandos.

Essa divisão permite adicionar `voiceStateUpdate` em `src/events/`, sem misturar o monitoramento com os comandos atuais. Anúncios continuam em JSON local; tickets, configurações e usuários podem usar PostgreSQL via repositories criados em `src/app/createServices.js`.

## Requisitos

- Node.js 18 ou superior;
- uma aplicação e um bot criados no Discord Developer Portal;
- token do bot e ID da aplicação.

## Configuração

Execute os comandos abaixo dentro de `bot/` (`cd bot` a partir da raiz). Copie o `.env.example` somente na primeira configuração, preservando um `.env` já preenchido.

1. Instale as dependências:

	```bash
	npm install
	```

2. Copie `.env.example` para `.env` e preencha os valores:

	```bash
	cp .env.example .env
	```

3. Convide o bot para o servidor com os escopos `bot` e `applications.commands`.

4. Registre os slash commands:

	```bash
	npm run commands:register
	```

5. Inicie o bot:

	```bash
	npm start
	```

Para iniciar novamente, execute `npm start` dentro de `bot/`. Repita `npm run commands:register` quando adicionar ou alterar definições dos comandos slash. O nome legado `npm run deploy` continua disponível para compatibilidade.

## PostgreSQL

Com `DATABASE_URL` ausente, o fallback JSON mantém o desenvolvimento e os testes locais compatíveis. Em `NODE_ENV=production`, a configuração falha explicitamente sem `DATABASE_URL`. Com a URL definida, o composition root cria um único pool `pg`, verifica readiness antes de iniciar Discord/API e encerra o pool em `SIGINT`/`SIGTERM`.

Na raiz do projeto, o ambiente local é:

```bash
docker compose up -d
cd bot
npm run db:migrate
```

O schema cria `users`, tabelas do Core de tickets, `ticket_ai_configs`, `ticket_ai_ticket_states`, `ticket_ai_runs` e `ticket_messages`. A sequência por guild é incrementada dentro da transação de criação, e `(guild_id, public_number)` possui constraint única. Ticket, canal Discord e conversa são entidades separadas; PostgreSQL é a fonte de verdade da conversa multicanal. Sessões OAuth e sessões temporárias do Texta_AI continuam em memória; reiniciar o backend exige novo login.

Em Codespaces, mantenha o Postgres no mesmo ambiente Docker e use `localhost` na `DATABASE_URL`. Em hospedagem futura, substitua somente a URL por uma conexão PostgreSQL fornecida pelo provedor e rode `npm run db:migrate` antes de `npm start`. Não são persistidos access tokens ou refresh tokens do Discord.

Para executar o frontend junto do bot, siga [o guia da raiz](../README.md#iniciar-em-desenvolvimento).

## Tickets via Discord

`/ticket` inicia um wizard privado para administradores com ManageGuild/Administrator. Selecione o cargo de suporte, crie a estrutura automática ou reutilize canais existentes, escolha categorias e confirme o painel. Usuários abrem tickets por categoria; suporte assume; criador/suporte fecha; a equipe pode remover o canal após transcrição/log e reabrir o mesmo ticket em um novo canal.

Antes do setup, habilite Message Content Intent no Developer Portal, defina `TICKETS_MESSAGE_CONTENT_ENABLED=true` em `.env` e reinicie. Atualize os comandos pelo script existente quando quiser disponibilizar `/ticket` no Discord. Nenhum registro real é executado pela suíte de testes.

Dados do fallback ficam em `data/tickets.json`, `data/ticket-config.json` e `data/ticket-transcripts/`. Preserve a pasta `data/` em backups. Permissões completas, recuperação de falhas, limites e operação estão no [guia de tickets](../docs/tickets.md).

## IA de tickets

A IA de tickets é opcional, desativada por padrão e exige PostgreSQL. Ela reutiliza `OPENROUTER_API_KEY` e o mesmo provider do Texta_AI, mas não recebe ferramentas nem autoridade para fechar tickets, apagar canais, punir usuários ou alterar permissões.

Depois de aplicar migrations, configure `TICKET_AI_ENABLED=true`, adicione as guilds de desenvolvimento em `TICKET_AI_GUILD_IDS` e use `/ticket ia:Configurar IA`. `TICKET_AI_MODEL` pode sobrescrever o modelo somente para tickets; vazio reutiliza `OPENROUTER_MODEL`. Para auto reply, mantenha também `TICKETS_MESSAGE_CONTENT_ENABLED=true` e o intent correspondente habilitado no Portal.

Níveis 0/1/2/3 representam OFF, sugestões, auto reply e ações limitadas. Em V1, o nível 3 continua restrito a respostas/perguntas, resumo, handoff e sugestão de fechamento; fechamento nunca é automático. Staff pode pausar pelo botão no ticket, e um pedido explícito por atendimento humano pausa a IA de forma persistente.

Consulte [arquitetura, segurança, routes e smoke test](../docs/ticket-ai.md) e o [Message Core](../docs/ticket-messages.md). Nenhum teste normal chama OpenRouter real ou gasta créditos.

## Message Core de tickets

Mensagens Discord válidas são persistidas antes de disparar a IA. Mensagens Web/IA são persistidas antes da entrega ao Discord e mantêm `PENDING/SENDING/SENT/FAILED` para retry sem criar outra identidade canônica. O endpoint `GET /api/tickets/:ticketId/messages` pagina o histórico; o POST homônimo aceita apenas `guildId`, `clientMessageId` e conteúdo.

Routes de conversa exigem sessão, membership OAuth e `VIEW/RESPOND` no `TicketPermissionService`. Um cargo em `supportRoleIds` pode operar sem ManageGuild; configuração administrativa continua exigindo ManageGuild. O frontend nunca define autor, nome ou papel. Consulte [schema, autorização, compatibilidade legada e smoke test](../docs/ticket-messages.md).

## Gerar o refresh token do Spotify

O script abaixo serve apenas para a configuração inicial do Spotify. Ele abre um fluxo OAuth local, recebe o callback e salva o `refresh_token` em um arquivo temporário privado (permissão `0600`), sem imprimir o token. Não é necessário executá-lo toda vez que o bot iniciar.

1. No [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), crie ou abra sua aplicação.

2. Abra as configurações da aplicação e, em **Redirect URIs**, adicione exatamente:

	```text
	http://127.0.0.1:8888/callback
	```

	Salve a alteração. O endereço precisa ser idêntico, incluindo `127.0.0.1`, porta, caminho e protocolo.

3. Na página da aplicação, copie o **Client ID**. Para ver o **Client Secret**, abra **Settings** e use **View client secret**. Nunca publique o Client Secret.

4. No `.env`, preencha somente os valores reais:

	```env
	SPOTIFY_CLIENT_ID=seu_client_id_real
	SPOTIFY_CLIENT_SECRET=seu_client_secret_real
	SPOTIFY_REDIRECT_URI=http://127.0.0.1:8888/callback
	```

	Se `SPOTIFY_REDIRECT_URI` não for definida, o script usa `http://127.0.0.1:8888/callback` automaticamente. O valor precisa ser exatamente igual ao cadastrado no Spotify Developer Dashboard.

	O arquivo `.env` está no `.gitignore` e não deve ser commitado.

5. No terminal, dentro da pasta do projeto, execute:

	```bash
	npm run spotify:auth
	```

6. O script exibirá uma URL e tentará abrir o navegador. Na página do Spotify, entre na sua conta e autorize os escopos solicitados. Eles permitem ler a música atual e o estado de reprodução.

7. Depois da autorização, o Spotify redirecionará para o callback local. O terminal exibirá `Spotify autorizado com sucesso` e o caminho do arquivo privado. Abra esse arquivo localmente e copie seu conteúdo para:

	```env
	SPOTIFY_REFRESH_TOKEN=valor_exibido_pelo_script
	```

   Depois de salvar o token no `.env`, remova o arquivo temporário indicado pelo script.

8. Para a rich presence do Spotify, preencha também `SPOTIFY_PLAYLIST_ID` com o ID ou URI da playlist permitida e inicie o bot com `npm start`.

Deu certo quando o terminal exibir `Spotify autorizado com sucesso`, o `SPOTIFY_REFRESH_TOKEN` estiver no `.env` e o bot conseguir mostrar a música atual somente quando ela pertencer à playlist configurada. Se a URL não abrir automaticamente, copie-a do terminal e abra-a manualmente.

Os comandos disponíveis são `/ping`, `/say mensagem:<texto>`, `/embed titulo:<texto> descricao:<texto>`, `/presence`, `/callsense` e `/texta_ai`.

## IA para textos do Discord

Texta_AI combina “Texta” (de text) com “AI” (lido como “aí”). O comando é `/texta_ai` porque o Discord exige nomes de slash commands em minúsculas. Escolha `Embed` ou `Content`, informe uma ideia no modal e revise a prévia privada. Use `Enviar` para publicar ou `Adicionar mais` para fornecer contexto adicional e gerar outra versão. Somente o usuário que iniciou a sessão pode interagir com seus botões.

Para habilitar a IA via OpenRouter, adicione no `.env`:

```env
OPENROUTER_API_KEY=sua_chave_da_api_openrouter
OPENROUTER_MODEL=openai/gpt-4.1-mini
OPENROUTER_MAX_TOKENS=800
```

A chave não deve ser commitada. O modelo padrão é `openai/gpt-4.1-mini`, mas ele pode ser substituído por outro modelo específico compatível com `response_format`/JSON Schema. `OPENROUTER_MAX_TOKENS` controla a saída: quando ausente, usa 800; valores positivos maiores são limitados a 800. Valores não inteiros ou não positivos interrompem o startup com erro de configuração. O service usa a API compatível com OpenAI do OpenRouter em `https://openrouter.ai/api/v1`, geração estruturada em JSON, limite de 30 segundos e limites de tamanho do Discord. Erros de limite de tokens ou créditos retornam uma mensagem amigável. Execute `npm run commands:register` depois de adicionar o comando.

O comando `/presence` é exclusivo do proprietário configurado e possui três modos:

- `Rich presence com texto`: exige tipo (`Assistindo`, `Transmitindo`, `Jogando` ou `Ouvindo`) e texto; `Transmitindo` também exige URL.
- `Rich presence Spotify`: exibe somente a música atual da playlist configurada.
- `Rich presence padrão`: reativa a lógica automática de call, Spotify e links a cada 10 segundos.

O modo escolhido permanece ativo até outro `/presence` ser usado ou o bot ser reiniciado.

O comando `/callsense` também é exclusivo do proprietário. Ao ativá-lo, o bot registra quem já está na call configurada e envia uma DM somente quando outra pessoa entrar depois disso. A notificação inclui o nome do usuário, horário relativo, avatar e um link direto para entrar na call.

## Rich presence

A presença alterna entre Twitch, Instagram, GitHub e LinkedIn a cada 15 segundos. Quando houver mais de uma pessoa na call configurada, a presença mostra a quantidade de pessoas na call da clínica e tem prioridade sobre as demais.

Para habilitar a música atual do Spotify, preencha as quatro variáveis `SPOTIFY_*` no `.env`, incluindo `SPOTIFY_PLAYLIST_ID` com o ID ou URI da playlist permitida. A presença do Spotify só será exibida quando `context.type` for `playlist` e o ID/URI de `context` corresponder ao valor configurado. É necessário criar uma aplicação no Spotify for Developers e obter um refresh token com o escopo `user-read-currently-playing`. Sem essas variáveis, ou ao ouvir uma música fora da playlist, a presença fixa continua funcionando normalmente.


### Anúncios por servidor

Use `/anuncios` em um servidor para escolher Aviso, Manutenção, Evento ou Notificação.
- **Adicionar** cria uma categoria personalizada (até 25 categorias por servidor).
- **Editar padrão** salva nome, título, descrição e imagem HTTPS para reutilização por todos no servidor. A imagem é opcional; deixe o campo vazio para removê-la.
- **Criar anúncio** abre a descrição preenchida com o padrão salvo. Alterar essa descrição para uma publicação não modifica o padrão.
- A IA melhora a descrição e o Markdown. A prévia sempre usa um embed, com título do padrão, imagem opcional e footer com servidor e data em UTC.
- **Adicionar Contexto** gera uma nova prévia e invalida a anterior. **Confirmar envio** publica no canal original.

O site oferece o mesmo fluxo em `/#/anuncios`: carregue o ID do servidor e informe um canal desse servidor para confirmar o envio. A prévia web mostra o texto Markdown; a renderização final é feita pelo Discord.
Categorias e padrões ficam em `bot/data/announcements.json` e sobrevivem a reinícios. Preserve esse arquivo no deploy e nos backups. Prévias ficam em memória, expiram após 15 minutos e são perdidas no reinício. O armazenamento local pressupõe uma única instância do bot.

A personalização está liberada sem planos. Todas as operações Web de anúncios exigem sessão e permissão de gerenciamento da guild, verificadas no backend com Discord OAuth. Prévias pertencem ao usuário autenticado.

Após atualizar o código, execute `npm run commands:register` na pasta `bot` para registrar `/anuncios` e reinicie o bot. Validação local: `npm test` nessa pasta.

### Permissões de anúncios

O acesso a `/anuncios` continua disponível conforme a configuração do comando no servidor. Usuários comuns podem consultar categorias, criar anúncios a partir de padrões e revisar suas prévias com IA.

Adicionar categorias e editar/salvar padrões exige **Gerenciar Servidor (`ManageGuild`)**. Essa permissão específica evita exigir `Administrator`. O handler verifica `ann:add`, `ann:edit` e `ann:save`, inclusive quando o custom ID é enviado diretamente; o service verifica novamente antes de persistir. Os botões continuam visíveis, mas ações administrativas não autorizadas recebem uma resposta privada: “Você precisa da permissão Gerenciar Servidor para alterar os padrões de anúncios.”

No envio pelo Discord, o handler verifica as permissões efetivas do membro no canal: `ViewChannel` e `SendMessages` (ou `SendMessagesInThreads` em threads). O service mantém as verificações de dono, validade da prévia, servidor, canal original, canal de texto enviável e bloqueio de envio duplicado. O bot também precisa ter suas próprias permissões de publicação no Discord.

**Web/API autenticada:** toda operação de anúncios exige participação na guild, bot instalado e owner/Administrator/ManageGuild. A identidade vem do cookie de sessão; campos `owner`, `trustedLocal`, `canManage` ou permissões enviados no body não autorizam nada. Prévias usam `web:<userId>` e não podem ser revisadas/enviadas por outro usuário. O bypass local foi removido inclusive do helper de permissões.

A API permanece vinculada a `127.0.0.1`. Isso não protege um proxy ou túnel que a exponha: o Vite está configurado para escutar em `0.0.0.0` e encaminha `/api`. Não exponha o frontend, portas encaminhadas ou a API a usuários não confiáveis. CORS não substitui autenticação. As APIs de ferramentas agora verificam sessão, Origin e autorização conforme a operação; CORS sozinho continua não sendo um mecanismo de autorização.


## Configuração de ambiente

`src/config/env.js` é o único ponto de leitura de `process.env` e carregamento de `.env`. Execute o bot e auxiliares dentro de `bot/`, como nas instruções acima. Não publique o `.env` nem imprima o objeto de configuração.

- **Obrigatórias no bot e registro de comandos:** `DISCORD_TOKEN` e `DISCORD_CLIENT_ID`.
- **API:** `API_PORT`, inteiro entre 1 e 65535; default `3001`.
- **Logs:** `LOG_LEVEL`, um de `debug`, `info`, `warn` ou `error`; default `info`.
- **IA opcional:** `OPENROUTER_API_KEY`. Sem chave o bot inicia, mas geração de textos exige configurá-la. `OPENROUTER_MODEL` usa `openai/gpt-4.1-mini`; `OPENROUTER_MAX_TOKENS` usa 800 e mantém o teto de 800.
- **Spotify opcional:** presença Spotify exige `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN` e `SPOTIFY_PLAYLIST_ID`. Sem o conjunto completo, permanece o comportamento de presence sem Spotify.
- **Auxiliar Spotify:** exige Client ID e Client Secret, sem exigir credenciais Discord ou refresh token prévio. `SPOTIFY_REDIRECT_URI` usa `http://127.0.0.1:8888/callback` e deve coincidir com o cadastro no Spotify. `BROWSER` seleciona o executável para abrir a autorização, com default `xdg-open`.

Espaços nas bordas são removidos; valores vazios opcionais usam ausência/default. Porta inválida, quantidade de tokens inválida ou redirect URI inválida são rejeitados mesmo quando a integração é opcional. Redirects aceitam HTTP(S), sem credenciais embutidas ou fragmentos. Os erros identificam a variável, sem repetir valores ou secrets.

Configuração é carregada uma vez por processo; reinicie após editar o `.env`. IDs e intervalos fixos de presence continuam em `src/config/presence.js`; configurações por guild não foram adicionadas.

## Logs da aplicação

O logger em `src/lib/logger.js` emite uma linha JSON por evento, sem dependência adicional. Cada registro contém `timestamp` UTC, `level`, `event` e `service: "bot"`, além do contexto disponível (`module`, operação, IDs Discord ou provider). `debug`/`info` usam stdout; `warn`/`error` usam stderr.

| Nível | Uso |
| --- | --- |
| `debug` | Detalhes de desenvolvimento, como atualização periódica de presence e modelo retornado pela IA |
| `info` | Eventos normais importantes: bot pronto, API iniciada, mudança de modo e anúncio enviado |
| `warn` | Falhas recuperáveis do Spotify, notificação inicial indisponível e erros HTTP abaixo de 500 |
| `error` | Falhas de comandos, geração/envio, resposta inválida de IA e erros HTTP 500 |

`LOG_LEVEL=info` suprime debug. Para investigar detalhes, altere para `debug` no `.env` e reinicie. Níveis inválidos são rejeitados. Os nomes dos eventos são estáveis, por exemplo `discord.ready`, `api.request_failed`, `announcement.sent`, `texta_ai.generate_failed` e `presence.spotify_unavailable`.

A API gera um `requestId` por chamada, passa-o ao contexto de rotas e devolve `X-Request-Id`. Erros registram esse ID, método, caminho sem query string e status. O formato das respostas JSON permanece igual. Não há access log de todas as chamadas nem tracing entre serviços.

Erros preservam nome, mensagem e códigos/status disponíveis; stack e propriedades arbitrárias de SDKs são omitidas. Campos sensíveis e valores das credenciais configuradas são substituídos por `[REDACTED]`. Não inclua bodies, prompts, mensagens privadas ou objetos completos de configuração nos logs. Respostas inválidas do OpenRouter registram motivo e tamanho, sem amostra do texto gerado.

Os auxiliares `spotify:auth` e `commands:register` mantêm mensagens legíveis no terminal, com erros sanitizados. A URL interativa de autorização Spotify continua sendo exibida; o refresh token fica no arquivo privado indicado pelo auxiliar.

Não há envio externo, arquivo de log, rotação ou retenção automática. Redaction não identifica todo dado pessoal em texto livre: novos pontos de log devem selecionar apenas metadados necessários. IDs Discord são dados operacionais; controle o acesso à saída do processo. Consulte também a [convenção de arquitetura](../docs/architecture.md#logging-estruturado).

## Testes e execução em CI

Execute `npm test` dentro de `bot/`. A descoberta usa `test/*.test.js`, preservando o runner nativo `node:test`. Não é necessário configurar `.env`, credenciais ou serviços externos.

O [guia da suíte](test/README.md) contém o mapa por tipo/risco, helpers de isolamento, comandos para execução repetida e limitações conhecidas. A execução foi validada com Node.js 24; nenhum workflow de CI foi adicionado nesta etapa.

## Autenticação Web com Discord

O fluxo usa Authorization Code no backend e somente os scopes `identify guilds`, para perfil básico e lista de servidores, sem pedir email ou convite do bot. Referência: [OAuth2 do Discord](https://docs.discord.com/developers/topics/oauth2).

### Configuração manual

1. Abra a mesma aplicação do bot no [Discord Developer Portal](https://discord.com/developers/applications), seção **OAuth2**.
2. Copie o **Client Secret** para `DISCORD_OAUTH_CLIENT_SECRET` em `bot/.env`. Não é o token do bot. `DISCORD_CLIENT_ID` é reutilizado.
3. Em **Redirects**, cadastre exatamente `http://localhost:5173/api/auth/discord/callback`.
4. Configure `WEB_ORIGIN=http://localhost:5173`, `DISCORD_OAUTH_REDIRECT_URI=http://localhost:5173/api/auth/discord/callback` e `SESSION_TTL_SECONDS=28800`.
5. Reinicie o bot e inicie o Vite. Acesse o site pelo endereço configurado, clique **Entrar com Discord**, autorize perfil/lista de servidores e confira o dashboard. Recarregar mantém a sessão; **Sair** volta à LoginPage.

Sem Client Secret o bot continua funcionando; iniciar OAuth retorna 503. Preencher o secret habilita OAuth e exige Client ID. TTL é inteiro positivo, máximo 2.592.000 segundos (30 dias), default 28.800 (8 horas). Não há renovação deslizante.

O frontend usa URLs relativas `/api` com `credentials: 'include'`. O callback externo passa pelo proxy Vite, que encaminha para `127.0.0.1:3001`. Site e callback devem usar a **mesma origem**; isso evita cookies perdidos por alternância de hostname. Não use o callback em `127.0.0.1:3001` junto do site em `localhost:5173`. `WEB_ORIGIN` não aceita path ou barra final. Se alterar a porta do Vite, atualize origem, callback e cadastro no Discord.

Para HTTPS, configure origem e callback HTTPS e encaminhe `/api` na mesma origem até o listener local. O cookie recebe `Secure` com base nessa configuração validada, sem confiar em `X-Forwarded-Proto`. HTTP é aceito somente em localhost/loopback. CORS usa a allowlist derivada na configuração, com credentials e sem wildcard. Em DEV: WEB_ORIGIN, localhost/127.0.0.1 na porta 5173 e Codespace atual detectado. Com `NODE_ENV=production`: somente WEB_ORIGIN exata. O proxy Vite preserva Origin e continua destinado ao desenvolvimento.

### Endpoints e sessão

| Endpoint | Resultado |
| --- | --- |
| `GET /api/auth/discord` | Cria state e vínculo com navegador, cookies temporários e redirect Discord |
| `GET /api/auth/discord/callback` | Consome state, troca code, busca perfil, cria sessão e retorna ao site |
| `GET /api/auth/me` | 200 com `user: { id, username, displayName, avatarUrl }`; 401 sem sessão válida |
| `POST /api/auth/logout` | Exige Origin na allowlist do ambiente, remove sessão, expira cookie e retorna 204 |

State e vínculo com navegador usam aleatoriedade criptográfica, TTL de cinco minutos e uso único. Dois cookies temporários HttpOnly vinculam a tentativa ao navegador; possuir apenas code/state na URL não é suficiente. Uma nova tentativa no mesmo navegador substitui a anterior. Erros/cancelamento voltam à LoginPage com mensagem genérica, sem resposta bruta do Discord.

A sessão usa ID opaco de 32 bytes aleatórios em `cylbot_session`, com `HttpOnly`, `SameSite=Lax`, `Path=/`, Max-Age igual ao TTL e `Secure` em HTTPS. Não há Domain, tokens no cookie, localStorage ou sessionStorage. Login bem-sucedido invalida a sessão anterior desse navegador. Tokens Discord ficam no manager em memória; `/me` seleciona apenas perfil público. O avatar possui fallback para contas com ou sem discriminator legado.

### Limitações desta fundação

- Sessões e states não são persistidos nem compartilhados entre processos; reiniciar exige novo login. Expirados são removidos no acesso/criação. Há limites de 10.000 sessões e 1.000 tentativas pendentes para conter uso de memória; não é rate limiting por IP.
- Tokens Discord não são renovados nesta etapa. Logout encerra a sessão local; não revoga a autorização no Discord. O dashboard exige token OAuth válido: se expirar ou perder autorização, remove a sessão local e solicita novo login.
- O frontend verifica `/me` ao carregar; outra aba pode continuar mostrando o perfil antigo até recarregar. Não há sincronização entre abas.
- As APIs de IA/envio/anúncios agora exigem sessão; anúncios e envio verificam gerenciamento da guild. A proteção é aplicada no backend, não apenas no gate visual.
- Há dashboard de servidores; ainda não há canais, configuração de guild, RBAC, banco ou Redis. A configuração real no Portal e o consentimento real devem ser conferidos manualmente; os testes usam fakes.

Logs usam `auth.discord_started`, `auth.session_created`, `auth.discord_callback_failed` e `auth.logout`, com requestId e IDs públicos quando disponíveis. Não registram cookies, state, code, tokens ou Client Secret; falhas do provider são traduzidas para mensagens controladas. Respostas de autenticação usam `Cache-Control: no-store`; o callback também usa `Referrer-Policy: no-referrer`.

### Diagnóstico de `/api/auth/me` com 404 em desenvolvimento

Sem cookie de sessão, esta rota deve responder **401**, com `{"error":"Sessão ausente ou expirada."}`. Isso é normal e leva o frontend à LoginPage. **404 não significa ausência de sessão**.

No ambiente de desenvolvimento foi identificado um processo `node src/index.js` iniciado antes da implementação de OAuth. O Vite já entregava o React atualizado, mas encaminhava `/api` para esse backend antigo. Reiniciar o bot resolveu o 404, sem alterar rotas, proxy ou contrato HTTP. `npm start` não recarrega os módulos Node automaticamente após edições; o HMR do Vite atualiza somente o frontend.

Confira primeiro a API direta e depois o proxy:

```bash
curl -i http://127.0.0.1:3001/api/auth/me
curl -i http://localhost:5173/api/auth/me
```

Ambos devem retornar 401 sem sessão. Se ambos retornarem 404 após atualizar o código, confira o processo que ocupa a porta 3001 e reinicie **esse processo** (Ctrl+C no terminal do bot, depois `npm start` dentro de `bot/`). Iniciar outro bot sem encerrar o anterior pode gerar `EADDRINUSE` e deixar o frontend conectado à versão antiga. Se somente o proxy falhar, confira a porta/destino do Vite e eventuais rewrites: o caminho `/api/auth/me` deve chegar inteiro ao backend.

O desenvolvimento padrão usa Vite na porta 5173, API em `127.0.0.1:3001`, `WEB_ORIGIN=http://localhost:5173` e callback `http://localhost:5173/api/auth/discord/callback`. Esse callback depende do proxy `/api`; não é uma rota de página React. Client Secret ausente impede iniciar OAuth, mas `/api/auth/me` continua respondendo 401, não 404.

**Requisições repetidas:** `AuthGate` instancia `useAuth` uma vez e o hook chama `/me` em um único efeito, na montagem ou ao clicar em **Tentar novamente**. O [React StrictMode](https://react.dev/reference/react/StrictMode) executa um ciclo extra de setup/cleanup dos efeitos em desenvolvimento; o cleanup aborta a primeira chamada, que ainda pode aparecer no Network. Não há retry automático em loop. Uma terceira chamada não é explicada pelo StrictMode sozinho: HMR, remontagem, recarregamento da página ou retry manual podem adicioná-la. Para identificar sua origem exata, confira horário e Initiator no Network; a contagem isolada não distingue essas causas. StrictMode e a verificação de sessão foram preservados.

### Diagnóstico de OAuth com 503 após preencher o `.env`

`GET /api/auth/discord` retorna `Login Discord não configurado.` exatamente quando `AuthService.assertEnabled()` encontra `config.auth.enabled === false`. Esse campo é calculado por `Boolean(oauthSecret)`, após normalizar `DISCORD_OAUTH_CLIENT_SECRET`; o valor fica no cache de `getConfig()` durante toda a vida do processo. Editar o arquivo não atualiza esse objeto nem o `AuthService` já criado.

O carregamento ocorre em `config/env.js`, na primeira chamada a `getConfig()`: `dotenv.config()` resolve `.env` pelo cwd e depois `loadEnv` valida o ambiente. Com `npm start` dentro de `bot/`, o cwd é a pasta `bot/` e o arquivo lido é `bot/.env`. Variáveis já definidas no ambiente têm precedência sobre o arquivo, inclusive valores vazios; não imprima esse ambiente durante o diagnóstico.

Um `.env` preenchido e válido pode coexistir com OAuth desabilitado em um processo iniciado antes da edição. Compare o horário de início do listener da API com a última alteração do arquivo; confirme apenas booleanos de presença em uma leitura nova. Origem/callback inválidos ou secret presente sem Client ID causam erro de validação, não essa resposta de OAuth desabilitado.

Depois de editar `.env`, encerre o processo que ocupa a porta da API e inicie novamente com `npm start` dentro de `bot/`. Verifique `/api/auth/discord` sem seguir redirects: deve responder 302 com destino `https://discord.com/oauth2/authorize`, tanto diretamente quanto pelo proxy Vite. Não imprima a URL completa, cookies, state, tokens ou secrets para diagnosticar esse redirecionamento. O teste de 302 confirma configuração/carregamento local; a validade das credenciais no Discord só é confirmada na troca real do code.

## Dashboard de servidores — Etapa B

`GET /api/dashboard/guilds` exige o cookie de sessão da autenticação. O provider consulta `/users/@me/guilds?limit=200` com o access token armazenado no backend; o endpoint Discord retorna até 200 guilds, limite atual de participação por usuário. A integração usa o [contrato oficial de guilds do usuário](https://docs.discord.com/developers/resources/user#get-current-user-guilds).

O backend devolve exclusivamente:

```json
{
  "guilds": [
    {
      "id": "123456789012345678",
      "name": "Meu servidor",
      "iconUrl": null,
      "botInstalled": true,
      "canManage": true,
      "owner": false
    }
  ]
}
```

- `botInstalled`: presença do ID em `client.guilds.cache`, sem consulta REST adicional do bot. Antes de o client ficar pronto (ou durante desconexão), responde 503 em vez de informar ausência do bot.
- `canManage`: owner booleano verdadeiro, permissão `Administrator` (bit 3) ou `ManageGuild` (bit 5), calculada com BigInt sobre dados do provider. Permissões inválidas não elevam acesso; owner continua sendo um critério independente.
- `iconUrl`: CDN montada no backend; `null` quando não há ícone válido, com fallback visual no card.
- Ordem: instalado e gerenciável → instalado → não instalado; nome em ordem alfabética dentro do grupo, com ID como desempate.

A identidade nunca vem de query/body. A resposta não contém tokens, permissões brutas ou objetos Discord.js. A consulta não usa cache de guilds do usuário nesta fase. Logs `dashboard.guilds_loaded`, `dashboard.guilds_failed` e `dashboard.relogin_required` registram requestId, userId, contagens/status; não registram nomes, lista completa ou tokens.

### Sessões antigas e falhas

A sessão guarda os scopes efetivamente retornados na troca OAuth. Sessão ausente/expirada, scope `guilds` ausente, access token vencido ou Discord 401/403 resultam em `401 { "error": "AUTH_RELOGIN_REQUIRED" }`, remoção da sessão e expiração do cookie. O frontend retorna à LoginPage com orientação para entrar novamente. Sessões da Etapa A precisam de nova autorização; não é necessário novo Client ID ou Client Secret.

Falhas de rede, resposta inválida, Discord 429 ou 5xx retornam erro controlado 502, preservando a sessão e permitindo nova tentativa. Não há refresh automático ou retry silencioso. O endpoint revalida a sessão após consultar Discord para não devolver a lista depois de logout/expiração durante a chamada.

### Navegação e verificação manual

1. Reinicie o bot e abra o frontend configurado em WEB_ORIGIN.
2. Faça login novamente e autorize `identify guilds` (o backend monta a URL; callback e variáveis permanecem iguais).
3. Em `/#/dashboard`, confira avatar, nome, username e cards dos seus servidores. Compare um servidor com CylBot e um sem ele; compare também owner/administrador/Gerenciar Servidor com membro comum.
4. Clique **Gerenciar** em um card habilitado: `/#/dashboard/:guildId` mostra somente o servidor selecionado. Um hash de servidor ausente/não gerenciável não mostra o placeholder administrativo.
5. **Adicionar CylBot** permanece desabilitado, sem URL de convite. Não há acesso administrativo para cards sem permissão.
6. Clique **Sair** e confirme que o dashboard exige login. Uma consulta direta a `/api/dashboard/guilds` sem cookie também deve retornar 401.

Sem guilds, a tela mostra estado vazio; indisponibilidade mostra erro e botão de nova tentativa. Loading e erros não deixam cards antigos visíveis. Testes automatizados exercitam expiração e token rejeitado sem alterar credenciais reais.

O dashboard permanece informativo. Seu DTO no navegador não autoriza operações: as rotas de anúncios/envio consultam novamente as permissões pelo backend. Os fluxos de IDs e endpoints continuam iguais; somente sessão, autorização e limites foram adicionados. A lista pode ficar desatualizada até recarregar o dashboard. Sessões continuam em memória e o convite/configuração de guild/canais ficam fora desta etapa.

## Segurança das APIs Web

### Controles aplicados

- `POST /api/ai/generate`, `POST /api/discord/send`, todos os `POST /api/announcements/*` e `GET /api/dashboard/guilds` exigem sessão. Ausência/expiração retorna 401 antes de chamar providers ou persistência.
- IA geral não exige guild, mas exige sessão e limite de uso. Anúncios (inclusive consulta de categorias) e envio exigem guild gerenciável: participação via `/users/@me/guilds`, bot no cache pronto e owner/Administrator/ManageGuild. O cálculo BigInt é reaproveitado do dashboard; não vem do navegador.
- No envio direto, a guild é derivada do canal retornado pelo Discord, ignorando guildId do body. Anúncios também compara guild autorizada com a guild do canal. DMs são proibidas. O bot precisa de ViewChannel e SendMessages; em threads, SendMessagesInThreads substitui SendMessages, conforme as regras do Discord. `allowedMentions: { parse: [] }` permanece em ambos os envios.
- Drafts Web usam `web:<session.user.id>`. Prévias anteriores com owner compartilhado deixam de ser utilizáveis e devem ser geradas novamente.
- POST/PUT/PATCH/DELETE exigem Origin exata na allowlist de `config/env.js`: em DEV, WEB_ORIGIN configurada/detectada, localhost/127.0.0.1:5173 e Codespace atual detectado; em produção, somente WEB_ORIGIN. Outro Codespace não é autorizado apenas pelo formato. Logout reutiliza o helper e permanece idempotente; não há token CSRF adicional. As chamadas frontend enviam `credentials: 'include'`.
- CORS só concede a origem configurada, nunca wildcard ou reflexão arbitrária. Origem recebida diferente não recebe headers de concessão; OPTIONS permanece 204, sem operação de negócio.
- O body JSON aceita objeto e no máximo 20.000 bytes. Ao exceder, retorna 413 e descarta a acumulação dos próximos chunks; UTF-8 fracionado entre chunks é preservado.

### Rate limits por janela fixa de 60 segundos

| Operação | Limite/chave |
| --- | --- |
| OAuth start | 10 por IP do socket |
| IA geral | 10 por userId |
| Geração/revisão de anúncios | 10 por userId |
| Publicações diretas e anúncios, combinadas | 10 por userId |
| Total dos POST das ferramentas | 30 por userId |
| Logout | 30 por userId; sem sessão, por IP do socket |

Excesso retorna 429 e `Retry-After` em segundos. Reabrir sessão com o mesmo usuário não reinicia seu limite. O Map é limitado a 10.000 entradas, com limpeza de expiradas; saturação rejeita novas chaves temporariamente, sem expulsar limites ativos. Tentativas inválidas autenticadas também podem consumir quota. States/sessões mantêm seus próprios limites anteriores.

Não se confia em X-Forwarded-For. Atrás do Vite/Codespaces, o IP visto pela API pode ser compartilhado: o limite OAuth é conservador e pode atingir vários usuários juntos. Os limites em memória são por processo e reiniciam junto com ele. Não há proteção distribuída, limite global de gastos nem garantia de custo máximo contra várias contas autorizadas.

### Headers, erros e operação

API e respostas do Vite (dev/preview) recebem `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY` e `Permissions-Policy: camera=(), microphone=(), geolocation=()`. Outro servidor de arquivos estáticos em produção deve aplicar os mesmos headers. Não há CSP ou HSTS automático nesta etapa.

Somente erros controlados criados pela aplicação podem expor sua mensagem HTTP. Um erro arbitrário de SDK não se torna público só por possuir `statusCode`: retorna mensagem genérica e o log central omite seus detalhes. Isso reduz o diagnóstico de erros inesperados, mas evita propagação de tokens/payloads. Nenhum body, cookie, token OAuth ou configuração inteira deve entrar nos logs.

Health permanece público e mínimo; OAuth mantém state, binding, TTL, uso único e rotação de sessão. Login/callback são exceções GET necessárias ao protocolo OAuth; nenhum GET publica mensagens ou altera padrões de anúncios. Não foram alterados os comandos Discord, o timeout OpenRouter ou limites de entrada da IA.

Após atualizar, reinicie o backend; o processo antigo não recarrega essas proteções sozinho. O reinício invalida sessões/drafts em memória. Para validar sem custo ou mensagens reais, execute a suíte `npm test`: providers e canais são fakes. Uma requisição anônima direta às ferramentas deve retornar 401 mesmo conhecendo a URL pública.

Permissões são verificadas por operação, mas podem mudar entre a consulta e o envio; erros de rede/Discord ainda podem deixar o resultado de uma publicação incerto. Não há refresh OAuth automático, persistência de sessão ou coordenação entre instâncias. Nenhuma integração de canais/dashboard da Etapa C foi implementada.
