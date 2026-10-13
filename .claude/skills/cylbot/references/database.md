# Banco de dados no CYLBOT

Para tuning, EXPLAIN, locks e índices avançados, combine com a skill `postgres-pro`.

## Stack

- PostgreSQL 16 (`compose.yaml`, usuário/banco `cylbot`), Drizzle ORM + `pg`. Pool único (máx. 10) em `bot/src/database/client.js`.
- Schema único em `bot/src/database/schema.js` (CommonJS, `pgTable`, `pgEnum`, `check`, `index`, `uniqueIndex`). Colunas em snake_case no banco, camelCase no JS; IDs Discord como `text`; timestamps `withTimezone: true`.
- PostgreSQL é a autoridade quando `DATABASE_URL` existe. Fallback JSON (`*JsonStore`, `Json*Repository`) é só para desenvolvimento; features novas podem exigir banco (o service recebe `repository: null` e responde de forma controlada).

## Fluxo de migration

1. Alterar `schema.js`.
2. `npm --prefix bot run db:generate` → gera `src/database/migrations/NNNN_<nome>.sql` + snapshot em `meta/`. Revise o SQL gerado.
3. `npm --prefix bot run db:migrate` no banco local.
4. `npm --prefix bot run db:status` (o CI roda esse check).
5. Nunca editar migrations já commitadas; crie outra.

## Repositories

- `bot/src/repositories/postgres<Nome>Repository.js` (ou `bot/src/<Feature>/repositories/`), recebendo `database` no construtor.
- Operações com invariantes concorrentes usam transação curta e lock de linha (padrão em `postgresTicketAIRepository.js` e `TicketAIActionService`).
- Constraints no banco para identidade, enums e limites; não confiar só na validação JS.
- Testes de integração: `bot/test/*.postgres.test.js` (`test.skip` sem `DATABASE_URL`).
- Não logar SQL com parâmetros nem `DATABASE_URL` (ver `scripts/migrate.js`).
