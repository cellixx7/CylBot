# CylBot

Monorepo simples para o ecossistema do CylBot.

## Aplicações

- [`bot/`](bot/): bot Discord em Node.js + discord.js, com comandos, eventos, services e API HTTP local.
- [`web/`](web/): frontend React + Vite para Texta_AI e anúncios.

As aplicações possuem dependências e configurações próprias. Execute os comandos na pasta indicada; não há `package.json` na raiz.

A interface atual do sistema de tickets funciona exclusivamente pelo Discord: `/ticket` configura o painel, atendimento privado, transcrição HTML e reabertura com o mesmo ID. O estado persistente dos tickets pode utilizar PostgreSQL. Veja [ativação e operação do MVP](docs/tickets.md), incluindo Message Content Intent, permissões e backups locais.

## Guias de uso

- [Inicialização](README-INICIALIZACAO.md): preparação inicial, comandos do dia a dia, PostgreSQL, login e configuração de produção.
- [Verificação e diagnóstico](README-VERIFICACAO.md): ambiente, banco, migrations, testes, build e problemas comuns.

Para um ambiente já configurado, vá direto para [uso diário](README-INICIALIZACAO.md#uso-diário--ambiente-já-configurado). As verificações ficam separadas da rotina de inicialização.

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
| `bot/` | `npm run db:generate` | Gerar migration Drizzle |
| `bot/` | `npm run db:migrate` | Aplicar migrations no PostgreSQL configurado |
| `bot/` | `npm run db:status` | Verificar a consistência da configuração/migrations do Drizzle |
| `web/` | `npm run dev` | Iniciar frontend em desenvolvimento |
| `web/` | `npm run build` | Gerar build do frontend |
| `web/` | `npm run preview` | Conferir localmente o build já gerado |

Para novos auxiliares, use `<domínio>:<ação>` e mantenha os arquivos em `bot/scripts/`. Prefira `commands:register` ao nome legado `deploy`. Os scripts do frontend permanecem iguais; não há suíte de testes web configurada.

## Arquitetura para novas features

Convenção: **entrada → handler/controller → service → repository/provider**, usando somente as camadas necessárias. Consulte [o documento de arquitetura](docs/architecture.md) para responsabilidades, exemplos atuais e riscos futuros.
