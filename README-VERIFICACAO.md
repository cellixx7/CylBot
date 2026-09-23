# CylBot — Verificação e diagnóstico

[README principal](README.md) · [Inicialização](README-INICIALIZACAO.md)

Use este guia para conferir a configuração, validar alterações ou investigar falhas. Estas verificações não precisam ser repetidas a cada inicialização. A preparação e os comandos do dia a dia estão no [guia de inicialização](README-INICIALIZACAO.md).

Todos os comandos abaixo partem da **raiz do repositório**, salvo quando indicado. Instale as dependências antes de executar testes ou builds.

## Ambiente

Confirme o ambiente:

```bash
node --version
npm --version
git --version
```

Se utilizar o banco local, inicie o Docker e confira:

```bash
docker version
docker compose version
```

O comando `docker version` deve apresentar tanto `Client` quanto `Server`.

## PostgreSQL local

Com o Docker iniciado e o banco preparado conforme o guia de inicialização:

```bash
docker compose ps
docker compose logs postgres
```

O serviço `postgres` deve aparecer como `healthy`. Isso confirma a disponibilidade do servidor, mas não comprova que as migrations foram aplicadas.

### Configuração, migrations e conexão

Para verificar a consistência da configuração/migrations do Drizzle:

```bash
npm --prefix bot run db:status
```

`db:status` executa `drizzle-kit check`: ele não confirma que o banco recebeu as migrations. Quem aplica as migrations ao PostgreSQL é `db:migrate`.

Opcionalmente, verifique a conexão e liste as tabelas, ainda na raiz:

```bash
docker compose exec postgres psql -U cylbot -d cylbot -c "SELECT current_database(), current_user;"
docker compose exec postgres psql -U cylbot -d cylbot -c "\dt"
```

## Banco para testes de integração

Os testes PostgreSQL devem utilizar um banco separado. Nunca aponte `DATABASE_TEST_URL` para o banco de desenvolvimento ou produção.

Crie o banco de testes uma única vez, a partir da raiz:

```bash
docker compose exec postgres psql -U cylbot -d postgres -c "CREATE DATABASE cylbot_test;"
```

Adicione ao `bot/.env`:

```env
DATABASE_TEST_URL=postgresql://cylbot:cylbot_dev@localhost:5432/cylbot_test
```

Execute o teste na raiz, carregando explicitamente o arquivo de ambiente:

```bash
node --env-file=bot/.env --test bot/test/postgres.integration.test.js
```

Se o terminal já estiver dentro de `bot/`, o equivalente é:

```bash
node --env-file=.env --test test/postgres.integration.test.js
```

O teste aplica as migrations no banco de testes automaticamente. Sem `DATABASE_TEST_URL` no ambiente do processo, ele fica `SKIP`. O comando `npm test` não carrega essa variável de `bot/.env` automaticamente; use o comando acima para executar a integração com a configuração do arquivo.

## Testes do bot e build do frontend

Com dependências instaladas, execute a partir da raiz:

```bash
npm --prefix bot test
npm --prefix web run build
git diff --check
```

Dentro de `bot/`, basta `npm test`. Novos testes devem seguir `test/<feature>.test.js`, usando `node:test` e `node:assert/strict`. A suíte atual de anúncios substitui a geração por IA e não exige iniciar o bot nem registrar comandos.

O resultado esperado é ausência de falhas nos testes, build concluído e nenhum erro em `git diff --check`. Um teste PostgreSQL marcado como `SKIP` não valida a persistência no banco: execute a integração acima com `DATABASE_TEST_URL` configurada.

O teste de integração cobre sequência de tickets, disputa simultânea pelo atendimento e leitura por uma nova instância do repository. Consulte também a [organização da suíte do bot](bot/test/README.md).

## Verificação manual do login

Com bot/API e frontend em execução e OAuth configurado:

1. Abra o site e clique em **Entrar com Discord**.
2. Autorize os scopes `identify guilds` e confirme o retorno ao dashboard.
3. Recarregue a página e confira se a sessão permanece ativa.
4. Clique em **Sair** e confirme o retorno ao login.

Na mesma sessão do navegador, `GET /api/auth/me` responde 200 com o perfil após o login e 204 quando não há sessão. Use a mesma origem do site para essa verificação.

Se o callback falhar, confira a URL cadastrada no Discord: porta 5173 no desenvolvimento local ou domínio público da porta 5173 no Codespaces. Veja [Login com Discord](README-INICIALIZACAO.md#login-com-discord-se-utilizar-o-site).

## Problemas comuns

| Sintoma | O que conferir |
| --- | --- |
| npm procura `bot/bot/package.json` | Volte à raiz para usar `npm --prefix bot`; dentro de `bot/`, use o comando sem esse prefixo |
| `docker version` não mostra `Server` | Inicie o Docker Desktop/Engine; no Windows, confira WSL2 e se há reinício pendente |
| PostgreSQL não fica `healthy` | Consulte `docker compose logs postgres` e confira se a porta 5432 está disponível |
| Bot não conecta ao banco | Confira `DATABASE_URL`, disponibilidade do PostgreSQL e migrations; a URL do exemplo exige banco local ativo |
| Aplicação recusa iniciar em produção sem banco | Configure `DATABASE_URL`; o fallback JSON só está disponível fora de produção |
| Teste PostgreSQL fica `SKIP` | Configure `DATABASE_TEST_URL` e use o comando com `--env-file` |
| `db:status` passa, mas faltam tabelas | Execute `npm --prefix bot run db:migrate`; `db:status` não verifica o estado do banco |
| Frontend inicia em outra porta | Use `npm --prefix web run dev -- --port 5173 --strictPort` e libere a porta 5173 |
