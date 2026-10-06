# Sessões Discord persistentes

O login permanece Discord OAuth (`identify guilds`). Antes, a sessão e o cookie duravam 8 horas e o store era exclusivamente em memória. Access/refresh token e `expires_in` já eram recebidos, mas não havia renovação OAuth.

Agora `AUTH_SESSION_TTL_DAYS=30` define um prazo fixo. Não há sliding: a sessão expira 30 dias depois do login, mesmo com atividade. `SESSION_TTL_SECONDS` continua disponível como override legado para testes. O access token tem prazo próprio, definido pelo `expires_in` retornado pelo Discord; nenhuma duração OAuth é presumida.

## Configuração

- `DATABASE_URL`: PostgreSQL existente.
- `AUTH_SESSION_ENCRYPTION_KEY`: 32 bytes aleatórios em hexadecimal. Gere uma vez, guarde em secrets/.env e mantenha a chave entre reinícios. Trocar a chave torna as sessões armazenadas ilegíveis.
- `AUTH_SESSION_TTL_DAYS=30`.

Exemplo de geração local, sem publicar a saída em logs compartilhados: `node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"`.

Em cada ambiente, execute `npm run db:migrate` dentro de `bot` antes de iniciar o backend novo. A migration `0012_auth_sessions.sql` foi validada em schema PostgreSQL descartável e aplicada localmente após aviso ao usuário. O script `node scripts/test-auth-postgres.js` exige PostgreSQL local e permissão CREATE SCHEMA; cria e remove somente um schema isolado.

## Segurança e funcionamento

Cookie opaco aleatório de 256 bits: HttpOnly, SameSite=Lax, Path=/, Max-Age equivalente ao TTL e Secure em HTTPS. O banco guarda SHA-256 do identificador, perfil/credenciais criptografados com AES-256-GCM, nonce aleatório por escrita e hash como dados autenticados. Tokens nunca são enviados por `/api/auth/me`.

Cada request consulta o banco pela chave indexada. A memória mantém referências compatíveis com os handlers existentes, mas não substitui PostgreSQL como autoridade. Não há escrita por request nem prolongamento automático. Sessões vencidas são removidas em limpeza controlada no máximo uma vez por hora com tráfego autenticado.

OAuth é renovado apenas a menos de 2 minutos do vencimento. Requests concorrentes na mesma instância aguardam a mesma promise por sessão. O refresh token rotacionado é salvo junto ao novo access token; logout durante renovação não recria uma sessão apagada. Esta deduplicação é por processo: uma implantação com múltiplos backends precisa adicionar lock distribuído antes de compartilhar sessões com refresh simultâneo.

`invalid_grant` e rejeição de autenticação exigem login; timeout, 429 e 5xx retornam falha transitória sem apagar a sessão. `/api/auth/me` retorna 401 para ausência/invalidade, `SESSION_EXPIRED` para TTL vencido e `AUTH_RELOGIN_REQUIRED` para refresh rejeitado. O frontend já distingue 401 de erro transitório e não armazena credenciais.

Logout protegido por Origin apaga o registro e o cookie. Novo OAuth cria um novo ID e invalida o anterior. Revogação no endpoint Discord não é implementada; as credenciais são removidas localmente. Regras e TTLs curtos de autorização de guild/member continuam independentes da duração da sessão.

## Validação

`npm test` em `bot`; `npm test` e `npm run build` em `web`. Testes cobrem persistência entre instâncias, expiração simulada, prazo fixo, single-flight de refresh, falha transitória, revogação, criptografia e logout. O teste PostgreSQL usa credenciais sintéticas e schema isolado, sem publicar mensagens no Discord.

QA com OAuth real: login, reload/nova aba, fechar/reabrir navegador, reiniciar backend, confirmar `/api/auth/me` 200, logout e novo login. Cookies antigos de sessões em memória exigem novo login uma vez. O navegador integrado não pôde ser controlado nesta sessão; a conferência manual permanece necessária.
