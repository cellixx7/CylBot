# CylBot — Instalação e ativação

[Verificação e diagnóstico](README-VERIFICACAO.md) · [Documentação do bot](bot/README.md)

Este é o guia principal para instalar, configurar e ativar o CylBot. Os comandos abaixo partem da **raiz do repositório** (`CylBot`), salvo quando indicado.

## Visão rápida

Depois da instalação inicial, cada sessão de uso exige apenas:

```bash
docker compose up -d             # se estiver usando PostgreSQL local
npm --prefix bot run db:migrate  # se houver migrations novas
npm --prefix bot start
npm --prefix web run dev         # em outro terminal, se usar o site
```

O bot inclui a API em `http://127.0.0.1:3001`. O site fica em `http://localhost:5173`.

## Requisitos

- Node.js 18 ou superior e npm;
- Git;
- Docker Desktop/Docker Engine com Compose, se usar PostgreSQL local;
- uma aplicação e um bot no [Discord Developer Portal](https://discord.com/developers/applications);
- token do bot e ID da aplicação.

Node.js 22.12 ou superior é recomendado para manter o ambiente alinhado ao frontend. No Windows, inicie o Docker Desktop antes de subir o banco.

## Instalação inicial

### 1. Instalar dependências

Na raiz do repositório:

```bash
npm --prefix bot install
npm --prefix web install
```

### 2. Criar e preencher o ambiente

Crie `bot/.env` uma única vez. No PowerShell:

```powershell
Copy-Item bot/.env.example bot/.env
```

No Linux, macOS ou Git Bash:

```bash
cp bot/.env.example bot/.env
```

Abra `bot/.env` e preencha obrigatoriamente:

```env
DISCORD_TOKEN=token_do_bot
DISCORD_CLIENT_ID=id_da_aplicacao
```

Não publique nem versione esse arquivo. As integrações de OpenRouter, Spotify e login web são opcionais; suas variáveis estão documentadas no próprio `.env.example` e em [bot/README.md](bot/README.md).

### 3. Preparar o PostgreSQL local

O PostgreSQL é recomendado para tickets. O `.env.example` já aponta para o banco criado pelo Compose. Se não quiser usar banco local em desenvolvimento, remova ou comente `DATABASE_URL` para usar o fallback JSON.

Na raiz:

```bash
docker compose up -d
docker compose ps
npm --prefix bot run db:migrate
```

Continue somente quando `postgres` estiver `healthy`. Se não usar PostgreSQL, pule esta etapa e também o comando `db:migrate`. Em produção, `DATABASE_URL` é obrigatória.

Para parar o banco sem apagar os dados:

```bash
docker compose down
```

`docker compose down -v` também apaga o volume local e os dados.

### 4. Convidar o bot e registrar comandos

No Developer Portal, gere o convite com os escopos `bot` e `applications.commands`, conceda as permissões necessárias no servidor e aceite o convite.

Depois, na raiz, registre os slash commands:

```bash
npm --prefix bot run commands:register
```

Faça isso novamente somente quando adicionar ou alterar comandos. O registro não é necessário a cada inicialização.

## Ativação

### Somente bot e API

Na raiz, execute:

```bash
npm --prefix bot start
```

O terminal deve mostrar que a API iniciou e que o bot ficou pronto no Discord. Mantenha esse terminal aberto. Para encerrar, pressione `Ctrl+C`.

### Bot, API e site

Mantenha o bot rodando e abra um segundo terminal na raiz:

```bash
npm --prefix web run dev
```

Acesse `http://localhost:5173`. O Vite encaminha `/api` para a API do bot na porta 3001. No Codespaces, abra a URL pública exibida para a porta 5173.

Se a porta 5173 estiver ocupada, use:

```bash
npm --prefix web run dev -- --port 5173 --strictPort
```

### Reiniciar depois da instalação

Em cada nova sessão, não reinstale dependências nem registre comandos. Use apenas:

```bash
docker compose up -d             # se usar PostgreSQL local
npm --prefix bot run db:migrate  # se o código trouxer migrations novas
npm --prefix bot start
```

Para o site, execute também `npm --prefix web run dev` em outro terminal.

## Login web com Discord (opcional)

Para habilitar o login do site, no OAuth2 da mesma aplicação do bot cadastre `http://localhost:5173/api/auth/discord/callback`. Em `bot/.env`, configure:

```env
DISCORD_OAUTH_CLIENT_SECRET=client_secret_da_aplicacao
WEB_ORIGIN=http://localhost:5173
DISCORD_OAUTH_REDIRECT_URI=http://localhost:5173/api/auth/discord/callback
SESSION_TTL_SECONDS=28800
```

Reinicie o bot e o frontend. Em Codespaces, use no Discord a URL pública da porta 5173 em vez de `localhost`. Site, callback e `/api` devem usar a mesma origem.

## Problemas comuns

| Sintoma | Solução |
| --- | --- |
| `npm` procura `bot/bot/package.json` | Volte à raiz e use `npm --prefix bot`; dentro de `bot/`, use `npm run ...` |
| PostgreSQL não fica `healthy` | Inicie o Docker Desktop e confira `docker compose logs postgres` |
| Bot não inicia | Confira `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` e, se definido, `DATABASE_URL` |
| Tabelas não existem | Execute `npm --prefix bot run db:migrate` com o PostgreSQL ativo |
| Site não acessa a API | Inicie o bot antes do Vite e confirme a porta 3001 |
| Login retorna para a tela inicial | Confira a URL de callback cadastrada no Discord e reinicie o bot após editar `.env` |

Para validação, testes e diagnóstico detalhado, consulte [README-VERIFICACAO.md](README-VERIFICACAO.md). Para tickets, IA, Spotify e todas as variáveis disponíveis, consulte [bot/README.md](bot/README.md).

Se usar PostgreSQL local, inicie o Docker Desktop/Engine e execute:

```bash
docker compose up -d
docker compose ps
```

Aguarde o serviço `postgres` aparecer como `healthy`. Se usar o fallback JSON em desenvolvimento ou um banco remoto, pule esses comandos do Docker.

No primeiro terminal, inicie o bot e a API:

```bash
npm --prefix bot start
```

Se utilizar o site, abra outro terminal na raiz:

```bash
npm --prefix web run dev
```

Abra `http://localhost:5173` ou a URL pública da porta 5173 no Codespaces. Mantenha os terminais em execução; para encerrar bot e frontend, pressione `Ctrl+C` em cada terminal.

Você não precisa reinstalar dependências, copiar o `.env`, registrar comandos ou rodar testes a cada início. Se ainda não preparou o ambiente, siga as etapas abaixo.

## Quando repetir cada etapa

| Etapa | Quando executar |
| --- | --- |
| Instalar dependências | Na primeira configuração e quando as dependências mudarem |
| Criar `bot/.env` | Uma vez; depois, editar somente as configurações necessárias |
| Aplicar migrations | Ao preparar o PostgreSQL e antes de iniciar versões com novas migrations |
| Registrar comandos slash | Na primeira configuração e quando suas definições mudarem |
| Iniciar PostgreSQL local | Quando for utilizá-lo e estiver parado |
| Iniciar bot/API | Em cada sessão de uso |
| Iniciar frontend | Quando for utilizar o site |
| Verificações e testes | Ao validar alterações ou investigar problemas; veja o guia separado |

## Instalação e configuração

### Pré-requisitos

- Node.js 22.12 ou superior, atendendo ao requisito do Vite instalado;
- npm;
- Git;
- Docker Desktop ou Docker Engine com Docker Compose, caso utilize PostgreSQL local;
- uma aplicação e um bot configurados no Discord Developer Portal, com token e ID da aplicação.

No Windows, recomenda-se Docker Desktop com o backend WSL2. Após instalar ou habilitar WSL2/VirtualMachinePlatform, pode ser necessário reiniciar o Windows antes de iniciar o Docker Desktop.

Os comandos abaixo partem da raiz do repositório e mantêm o terminal nessa pasta. `npm --prefix bot` e `npm --prefix web` executam scripts nas respectivas aplicações. Se já estiver dentro de `bot/`, use `npm run <script>` sem `--prefix bot`; combiná-los faria o npm procurar `bot/bot/package.json`.

### 1. Preparar o bot

Partindo da raiz do repositório:

```bash
npm --prefix bot install
```

Crie o arquivo de ambiente somente na primeira configuração, sem sobrescrever um `.env` existente.

Linux/macOS/Git Bash:

```bash
cp bot/.env.example bot/.env
```

PowerShell:

```powershell
Copy-Item bot/.env.example bot/.env
```

Edite `bot/.env` e preencha `DISCORD_TOKEN` e `DISCORD_CLIENT_ID`. Para geração de textos e anúncios por IA, configure também `OPENROUTER_API_KEY`. A configuração do Spotify está em [bot/README.md](bot/README.md).

### 2. Configurar PostgreSQL local (se utilizar)

PostgreSQL é a persistência recomendada para tickets. Em desenvolvimento, há fallback JSON quando `DATABASE_URL` não está configurada. O `.env.example` já define uma URL local: remova ou comente essa variável se optar pelo fallback. Em produção, PostgreSQL é obrigatório: a aplicação recusa iniciar com `NODE_ENV=production` sem `DATABASE_URL`.

#### Subir o banco

Na raiz do repositório:

```bash
docker compose up -d
docker compose ps
```

Confirme que o serviço `postgres` aparece como `healthy`. Se ainda estiver iniciando, repita `docker compose ps`; se houver falha, consulte `docker compose logs postgres` antes de continuar.

O `compose.yaml` cria o banco `cylbot`, com usuário `cylbot`, senha local `cylbot_dev` e porta `5432`. Em `bot/.env`, use:

```env
DATABASE_URL=postgresql://cylbot:cylbot_dev@localhost:5432/cylbot
```

> A senha `cylbot_dev` é apenas para desenvolvimento local e não deve ser reutilizada em produção.

#### Aplicar migrations

Na raiz, execute antes de iniciar o bot:

```bash
npm --prefix bot run db:migrate
```

#### Encerrar o PostgreSQL

Na raiz:

```bash
docker compose down
```

O volume `cylbot-postgres-data` preserva os dados locais. Para remover também os dados:

```bash
docker compose down -v
```

> Atenção: `-v` remove o volume e apaga permanentemente os bancos locais, incluindo o banco de testes.

#### Codespaces e produção

No Codespaces, quando backend e PostgreSQL executam no mesmo Codespace, a conexão local usa `localhost:5432`.

Em produção, configure `NODE_ENV=production` e `DATABASE_URL` com a URL fornecida pelo provedor PostgreSQL. Configure TLS/SSL conforme as exigências do provedor, sem inserir credenciais no código-fonte. Na raiz, aplique as migrations antes de iniciar a nova versão:

```bash
npm --prefix bot run db:migrate
npm --prefix bot start
```

### 3. Registrar comandos do Discord

Convide o bot para o servidor com os escopos `bot` e `applications.commands`. Depois, na raiz, registre os comandos:

```bash
npm --prefix bot run commands:register
```

Repita o registro quando adicionar ou alterar as definições dos comandos slash. Não é necessário registrar a cada início do bot.

### 4. Preparar o frontend (se utilizar o site)

Em outro terminal, partindo da raiz do repositório:

```bash
npm --prefix web install
```

## Acesso local e Codespaces

Após a preparação, inicie os serviços seguindo os comandos de [uso diário](#uso-diário--ambiente-já-configurado). O bot inicia também a API local em `http://127.0.0.1:3001` por padrão.

Localmente, abra `http://localhost:5173`; no Codespaces, abra a URL pública da porta 5173. O backend detecta automaticamente Codespaces por `CODESPACES` e `CODESPACE_NAME`, usando a URL pública; fora dele usa `http://localhost:5173`. `WEB_ORIGIN` e `DISCORD_OAUTH_REDIRECT_URI` podem ser definidos manualmente para sobrescrever essa detecção. Se a porta estiver ocupada, use `npm --prefix web run dev -- --port 5173 --strictPort` na raiz para evitar troca silenciosa de porta. O proxy encaminha `/api` para `http://127.0.0.1:3001`; se alterar `API_PORT`, ajuste também o destino em `web/vite.config.js`.

## Login com Discord (se utilizar o site)

Na mesma aplicação do bot, abra **OAuth2** no [Discord Developer Portal](https://discord.com/developers/applications), obtenha o Client Secret e cadastre os callbacks de desenvolvimento:

```text
https://SEU-CODESPACE-5173.app.github.dev/api/auth/discord/callback
http://localhost:5173/api/auth/discord/callback
```

Em `bot/.env`, mantendo `DISCORD_CLIENT_ID` da mesma aplicação:

```env
DISCORD_OAUTH_CLIENT_SECRET=preencha_localmente_com_o_client_secret
# WEB_ORIGIN e DISCORD_OAUTH_REDIRECT_URI são detectados automaticamente.
SESSION_TTL_SECONDS=28800
```

Reinicie o bot. Acesse a URL correspondente ao ambiente, clique **Entrar com Discord**, autorize o perfil básico e a lista de servidores (`identify guilds`) e confira o dashboard na volta. Sessões anteriores sem o scope `guilds` exigem novo login ao abrir o dashboard. Veja as checagens de sessão no [guia de verificação](README-VERIFICACAO.md#verificação-manual-do-login).

O callback passa pelo proxy do Vite para a API: em Codespaces, substitua `SEU-CODESPACE-5173.app.github.dev` pelo domínio público exibido para a porta 5173. Não use `localhost` no Discord quando estiver acessando a URL pública, nem use a porta 3001 no callback. Em HTTPS, site e `/api` também devem compartilhar a mesma origem. Detalhes e limitações em [autenticação Web](bot/README.md#autenticação-web-com-discord).
