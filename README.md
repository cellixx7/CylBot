# CylBot

Monorepo simples para o ecossistema do CylBot.

## Aplicações

- [`bot/`](bot/): bot Discord em Node.js + discord.js, com comandos, eventos, services e API HTTP local.
- [`web/`](web/): frontend React + Vite para Texta_AI e anúncios.

As aplicações possuem dependências e configurações próprias. Execute os comandos na pasta indicada; não há `package.json` na raiz.

Tickets funcionam exclusivamente pelo Discord: `/ticket` configura o painel, atendimento privado, transcrição HTML e reabertura com o mesmo ID. Veja [ativação e operação do MVP](docs/tickets.md), incluindo Message Content Intent, permissões e backups locais.

## Instalação e configuração

Para executar bot e frontend juntos, use Node.js 22.12 ou superior e npm, atendendo ao requisito do Vite instalado. Você também precisa de uma aplicação e um bot no Discord, com token e ID da aplicação.

### 1. Preparar o bot

Partindo da raiz do repositório:

```bash
cd bot
npm install
cp .env.example .env
```

Copie o arquivo somente na primeira configuração. Edite `bot/.env` e preencha `DISCORD_TOKEN` e `DISCORD_CLIENT_ID`. Para geração de textos e anúncios por IA, configure também `OPENROUTER_API_KEY`. A configuração do Spotify está em [bot/README.md](bot/README.md).

Convide o bot para o servidor com os escopos `bot` e `applications.commands`. Depois, ainda na pasta `bot/`, registre os comandos:

```bash
npm run commands:register
```

Repita o registro quando adicionar ou alterar as definições dos comandos slash. Não é necessário registrar a cada início do bot.

### 2. Preparar o frontend

Em outro terminal, partindo da raiz do repositório:

```bash
cd web
npm install
```

## Iniciar em desenvolvimento

### Terminal 1 — bot e API

Partindo da raiz:

```bash
cd bot
npm start
```

Mantenha esse terminal em execução. O bot inicia também a API local em `http://127.0.0.1:3001` por padrão.

### Terminal 2 — frontend

Partindo da raiz:

```bash
cd web
npm run dev
```

Abra a URL pública da porta 5173 mostrada pelo Codespaces. O backend detecta automaticamente Codespaces por `CODESPACES` e `CODESPACE_NAME`, usando a URL pública; fora dele usa `http://localhost:5173`. `WEB_ORIGIN` e `DISCORD_OAUTH_REDIRECT_URI` podem ser definidos manualmente para sobrescrever essa detecção. Se a porta estiver ocupada, use `npm run dev -- --port 5173 --strictPort` para evitar troca silenciosa de porta. O proxy encaminha `/api` para `http://127.0.0.1:3001`; se alterar `API_PORT`, ajuste também o destino em `web/vite.config.js`.

Nas próximas execuções, basta iniciar os dois terminais; a instalação e a cópia do `.env` são etapas de preparação.

## Login com Discord

Na mesma aplicação do bot, abra **OAuth2** no [Discord Developer Portal](https://discord.com/developers/applications), obtenha o Client Secret e cadastre os callbacks de desenvolvimento:

```text
https://SEU-CODESPACE-5173.app.github.dev/api/auth/discord/callback
http://localhost:5173/api/auth/discord/callback
```

Em `bot/.env`, mantendo `DISCORD_CLIENT_ID` da mesma aplicação:

```env
DISCORD_OAUTH_CLIENT_SECRET=preencha_localmente_com_o_client_secret
# Deixe ausentes para detecção automática, ou defina os dois com a mesma origem.
SESSION_TTL_SECONDS=28800
```

Reinicie o bot. Acesse a URL correspondente ao ambiente, clique **Entrar com Discord**, autorize o perfil básico e a lista de servidores (`identify guilds`) e confira o dashboard na volta. Recarregue para confirmar a sessão; **Sair** remove a sessão e volta ao login. Sessões anteriores sem o scope `guilds` exigem novo login ao abrir o dashboard. `GET /api/auth/me` responde 200 com perfil após login e 204 quando não há sessão.

O callback passa pelo proxy do Vite para a API: em Codespaces, substitua `SEU-CODESPACE-5173.app.github.dev` pelo domínio público exibido para a porta 5173. Não use `localhost` no Discord quando estiver acessando a URL pública, nem use a porta 3001 no callback. Em HTTPS, site e `/api` também devem compartilhar a mesma origem. Detalhes e limitações em [autenticação Web](bot/README.md#autenticação-web-com-discord).

## Funcionalidades e configuração detalhada

O Texta_AI gera e revisa mensagens em Content ou Embed e permite enviar para um Channel ID. O painel de anúncios em `/#/anuncios` permite reutilizar padrões por servidor, gerar prévias e confirmar o envio.

O dashboard em `/#/dashboard` mostra os servidores do usuário, identifica a instalação do CylBot pelo cache do bot e calcula acesso de gerenciamento no backend. A seleção abre somente uma página informativa; convite, canais e integração com as ferramentas ficam para etapas futuras.

Alguns endpoints internos:

- `POST /api/ai/generate`: gerar ou revisar texto;
- `POST /api/discord/send`: publicar no canal informado;
- `GET /api/health`: verificar disponibilidade da API;
- `GET /api/dashboard/guilds`: listar servidores e acesso, exigindo sessão e token OAuth válidos.

Segredos ficam somente em `bot/.env`. Dashboard, IA, envio e anúncios exigem sessão. Anúncios e publicações exigem também participação e gerenciamento da guild, além das permissões do bot. Operações POST validam Origin e possuem limites por usuário. Consulte [segurança das APIs](bot/README.md#segurança-das-apis-web) para limites e cuidados ao expor o Vite/Codespaces.

Consulte [bot/README.md](bot/README.md) para comandos, Spotify, OpenRouter e persistência dos anúncios.

## Convenção de scripts

Execute os comandos na pasta indicada; a raiz não possui `package.json`.

| Pasta | Comando | Finalidade |
| --- | --- | --- |
| `bot/` | `npm start` | Iniciar bot e API local |
| `bot/` | `npm run commands:register` | Registrar comandos slash no Discord |
| `bot/` | `npm run deploy` | Nome legado preservado para o mesmo registro |
| `bot/` | `npm test` | Executar testes com `node --test` |
| `bot/` | `npm run spotify:auth` | Auxiliar de autorização Spotify |
| `web/` | `npm run dev` | Iniciar frontend em desenvolvimento |
| `web/` | `npm run build` | Gerar build do frontend |
| `web/` | `npm run preview` | Conferir localmente o build já gerado |

Para novos auxiliares, use `<domínio>:<ação>` e mantenha os arquivos em `bot/scripts/`. Prefira `commands:register` ao nome legado `deploy`. Os scripts do frontend permanecem iguais; não há suíte de testes web configurada.

### Validação

Com dependências instaladas, execute a partir da raiz:

```bash
npm --prefix bot test
npm --prefix web run build
git diff --check
```

Dentro de `bot/`, basta `npm test`. Novos testes devem seguir `test/<feature>.test.js`, usando `node:test` e `node:assert/strict`. A suíte atual de anúncios substitui a geração por IA e não exige iniciar o bot nem registrar comandos.

## Arquitetura para novas features

Convenção: **entrada → handler/controller → service → repository/provider**, usando somente as camadas necessárias. Consulte [o documento de arquitetura](docs/architecture.md) para responsabilidades, exemplos atuais e riscos futuros.
