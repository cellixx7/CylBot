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

Os comandos disponíveis são `/ping`, `/say mensagem:<texto>`, `/embed titulo:<texto> descricao:<texto>`, `/presence`, `/callsense` e `/iatext`.

## IA para textos do Discord

O comando é `/iatext` porque o Discord exige nomes de slash commands em minúsculas. Escolha `Embed` ou `Content`, informe uma ideia no modal e revise a prévia privada. Use `Correto, enviar` para publicar ou `Errado, corrigir` para fornecer contexto adicional e gerar outra versão. Somente o usuário que iniciou a sessão pode interagir com seus botões.

Para habilitar a IA via OpenRouter, adicione no `.env`:

```env
OPENROUTER_API_KEY=sua_chave_da_api_openrouter
OPENROUTER_MODEL=openai/gpt-4.1-mini
OPENROUTER_MAX_TOKENS=800
```

A chave não deve ser commitada. O modelo padrão é `openai/gpt-4.1-mini`, mas ele pode ser substituído por outro modelo específico compatível com `response_format`/JSON Schema. `OPENROUTER_MAX_TOKENS` controla a saída e tem fallback de 800, com teto de 800 tokens. O service usa a API compatível com OpenAI do OpenRouter em `https://openrouter.ai/api/v1`, geração estruturada em JSON, limite de 30 segundos e limites de tamanho do Discord. Erros de limite de tokens ou créditos retornam uma mensagem amigável. Execute `npm run deploy` depois de adicionar o comando.

O comando `/presence` é exclusivo do proprietário configurado e possui três modos:

- `Rich presence com texto`: exige tipo (`Assistindo`, `Transmitindo`, `Jogando` ou `Ouvindo`) e texto; `Transmitindo` também exige URL.
- `Rich presence Spotify`: exibe somente a música atual da playlist configurada.
- `Rich presence padrão`: reativa a lógica automática de call, Spotify e links a cada 10 segundos.

O modo escolhido permanece ativo até outro `/presence` ser usado ou o bot ser reiniciado.

O comando `/callsense` também é exclusivo do proprietário. Ao ativá-lo, o bot registra quem já está na call configurada e envia uma DM somente quando outra pessoa entrar depois disso. A notificação inclui o nome do usuário, horário relativo, avatar e um link direto para entrar na call.

## Rich presence

A presença alterna entre Twitch, Instagram, GitHub e LinkedIn a cada 15 segundos. Quando houver mais de uma pessoa na call configurada, a presença mostra a quantidade de pessoas na call da clínica e tem prioridade sobre as demais.

Para habilitar a música atual do Spotify, preencha as quatro variáveis `SPOTIFY_*` no `.env`, incluindo `SPOTIFY_PLAYLIST_ID` com o ID ou URI da playlist permitida. A presença do Spotify só será exibida quando `context.type` for `playlist` e o ID/URI de `context` corresponder ao valor configurado. É necessário criar uma aplicação no Spotify for Developers e obter um refresh token com o escopo `user-read-currently-playing`. Sem essas variáveis, ou ao ouvir uma música fora da playlist, a presença fixa continua funcionando normalmente.
