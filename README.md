# CylBot

Base modular para um bot do Discord usando Node.js e discord.js.

## Estrutura

- `src/commands/`: definição e execução dos slash commands.
- `src/events/`: listeners de eventos do Discord.
- `src/handlers/`: processamento centralizado das interações.
- `src/config/`: leitura e validação da configuração da aplicação.
- `src/index.js`: ponto de entrada e montagem do cliente.
- `scripts/`: tarefas operacionais, como o registro dos comandos.

Essa divisão permite adicionar `voiceStateUpdate` em `src/events/`, sem misturar o monitoramento com os comandos atuais. Uma futura camada de persistência pode ser introduzida quando houver dados reais para armazenar.

## Requisitos

- Node.js 18 ou superior;
- uma aplicação e um bot criados no Discord Developer Portal;
- token do bot e ID da aplicação.

## Configuração

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
	npm run deploy
	```

5. Inicie o bot:

	```bash
	npm start
	```

## Gerar o refresh token do Spotify

O script abaixo serve apenas para a configuração inicial do Spotify. Ele abre um fluxo OAuth local, recebe o callback e imprime o `refresh_token`. Não é necessário executá-lo toda vez que o bot iniciar.

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

7. Depois da autorização, o Spotify redirecionará para o callback local. O terminal exibirá `Spotify autorizado com sucesso` e um valor longo. Copie somente esse valor para:

	```env
	SPOTIFY_REFRESH_TOKEN=valor_exibido_pelo_script
	```

8. Para a rich presence do Spotify, preencha também `SPOTIFY_PLAYLIST_ID` com o ID ou URI da playlist permitida e inicie o bot com `npm start`.

Deu certo quando o terminal exibir `Spotify autorizado com sucesso`, o `SPOTIFY_REFRESH_TOKEN` estiver no `.env` e o bot conseguir mostrar a música atual somente quando ela pertencer à playlist configurada. Se a URL não abrir automaticamente, copie-a do terminal e abra-a manualmente.

Os comandos disponíveis são `/ping`, `/say mensagem:<texto>` e `/embed titulo:<texto> descricao:<texto>`.

## Rich presence

A presença alterna entre Twitch, Instagram, GitHub e LinkedIn a cada 15 segundos. Quando houver mais de uma pessoa na call configurada, a presença mostra a quantidade de pessoas na call da clínica e tem prioridade sobre as demais.

Para habilitar a música atual do Spotify, preencha as quatro variáveis `SPOTIFY_*` no `.env`, incluindo `SPOTIFY_PLAYLIST_ID` com o ID ou URI da playlist permitida. A presença do Spotify só será exibida quando `context.type` for `playlist` e o ID/URI de `context` corresponder ao valor configurado. É necessário criar uma aplicação no Spotify for Developers e obter um refresh token com o escopo `user-read-currently-playing`. Sem essas variáveis, ou ao ouvir uma música fora da playlist, a presença fixa continua funcionando normalmente.
