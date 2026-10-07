# Planos CYL

CYL Plus oferece benefícios pessoais. CYL Comunidade habilita recursos administrativos nos servidores vinculados. A assinatura pertence a um usuário Discord; o benefício Comunidade pertence aos servidores que o titular habilitou. Qualquer administrador atual de um servidor habilitado pode usar avisos e atualizações, sem precisar ser o titular.

O backend exige dono do servidor ou a permissão Administrator atual, consultada no Discord, e uma assinatura Comunidade ativa e não expirada vinculada ao servidor. ManageGuild sozinho, CYL Plus, flags do navegador e assinaturas revogadas ou expiradas não liberam acesso. A regra vale nas rotas de anúncios e no comando/interações de anúncios do Discord. A página pública de comunicados continua pública.

## Operação

Na raiz do projeto, aplique `npm --prefix bot run db:migrate`. As assinaturas persistem no PostgreSQL. Na ausência de banco ou assinatura válida, o acesso Premium é negado.

O cadastro inicial é uma operação local de quem administra a instalação. Não há compra, checkout ou integração de pagamentos nesta etapa, nem endpoint público para conceder planos.

```sh
npm --prefix bot run plans -- grant ID_USUARIO PLUS 30
npm --prefix bot run plans -- grant ID_USUARIO COMMUNITY 30 1
npm --prefix bot run plans -- revoke ID_USUARIO COMMUNITY
```

O número final indica o limite de servidores do plano Comunidade (padrão: 1). Dias entre 1 e 3650; limite entre 1 e 10000. Revogação e expiração bloqueiam os recursos na próxima chamada. As vinculações persistem para renovação e podem ser removidas pelo titular mesmo depois da expiração.

## API

| Método | Endpoint | Ação |
|---|---|---|
| GET | `/api/plans` | Catálogo público com nome e escopo |
| GET | `/api/plans/me` | Assinaturas ativas do usuário autenticado e seus servidores |
| POST | `/api/plans/community/guilds` | Titular habilita um servidor; exige admin atual e Comunidade ativo |
| DELETE | `/api/plans/community/guilds` | Titular desvincula um servidor |

POST e DELETE recebem `{ "guildId": "ID_SERVIDOR" }` e exigem sessão e Origin confiável. O titular vem da sessão; IDs de usuário e permissões enviados no corpo não são aceitos como autorização. Ativação respeita o limite dentro de transação e não permite tomar o vínculo de outra assinatura.

A interface de compra e gestão dos planos e os benefícios pessoais do CYL Plus serão definidos em etapas posteriores. Os registros e as regras de acesso já estão disponíveis no backend. Nenhuma assinatura foi concedida automaticamente a usuários reais.
