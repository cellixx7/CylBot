# IA de tickets — Etapa 3

A IA de tickets usa o mesmo Core para Discord e API. O modelo interpreta contexto e propõe uma resposta estruturada; código determinístico valida a saída, aplica a policy e decide se a proposta será apenas exibida à equipe ou publicada. O modelo não recebe ferramentas nem acesso a Discord, banco, permissões ou operações administrativas.

```text
messageCreate / API / botão Discord
                ↓
         TicketAIService
       ┌────────┴────────┐
 contexto limitado   OpenRouter compartilhado
       └────────┬────────┘
          JSON estruturado
                ↓
      TicketAIPolicyService
                ↓
      TicketAIActionService
                ↓
 resposta/sugestão/handoff seguro
```

## Ativação

A feature exige PostgreSQL, Message Content Intent para respostas automáticas e a chave `OPENROUTER_API_KEY`. Depois de atualizar o código, execute na raiz:

```bash
npm --prefix bot run db:migrate
npm --prefix bot run commands:register
```

Configure `bot/.env`:

```env
TICKETS_MESSAGE_CONTENT_ENABLED=true
TICKET_AI_ENABLED=true
TICKET_AI_GUILD_IDS=ID_DA_GUILD_DE_TESTE
TICKET_AI_MODEL=
TICKET_AI_TIMEOUT_MS=20000
```

`TICKET_AI_ENABLED` e `TICKET_AI_GUILD_IDS` formam o acesso de desenvolvimento da feature. O opt-in persistido pela guild não ignora essa allowlist. `TICKET_AI_MODEL` vazio reutiliza `OPENROUTER_MODEL`; a mesma instância de `OpenRouterService` atende Texta_AI, anúncios e tickets. A chave nunca é persistida no PostgreSQL.

No Discord, um administrador abre `/ticket ia:Configurar IA`. O formulário define nível, tom, contexto, instruções e capacidades. A equipe encontra **Assistente IA** no canal do ticket para gerar sugestão, pausar ou retomar. Alterações na definição de `/ticket` exigem novo registro dos comandos.

## Autonomia e capacidades

| Nível | Comportamento |
| --- | --- |
| 0 — OFF | Não chama o modelo nem responde automaticamente. |
| 1 — SUGGESTIONS | Gera sugestões no log privado para revisão da equipe. |
| 2 — AUTO_REPLY | Pode responder ao criador em ticket não assumido. Não executa ações administrativas. |
| 3 — LIMITED_ACTIONS | Mantém as ações seguras de V1 e prepara uma allowlist explícita. Não adiciona poderes administrativos nesta etapa. |

Capacidades configuráveis: `reply`, `ask_clarifying_question`, `summarize`, `request_human` e `suggest_close`. Ações válidas do contrato:

- `REPLY` e `ASK_CLARIFICATION`: podem ser publicadas nos níveis 2 e 3;
- `SUMMARIZE` e `SUGGEST_CLOSE`: permanecem sugestões para staff;
- `ESCALATE_TO_HUMAN`: persiste pausa e handoff, sem fechar o ticket;
- `NO_ACTION`: não produz efeito.

Não existe ação `CLOSE`, `DELETE`, `BAN`, `KICK`, alteração de cargo ou execução genérica. `SUGGEST_CLOSE` nunca chama `TicketService.close()`.

## Policy e prioridade humana

Auto reply só ocorre quando:

- a feature e a guild estão liberadas no ambiente;
- a configuração da guild está ativa e o nível permite;
- o ticket está aberto, inicializado, sem fechamento/reabertura em curso;
- o ticket não está pausado, escalado nem assumido por staff;
- a mensagem pertence ao criador, não é de bot/webhook/sistema e está no canal persistido do ticket;
- capability, cooldown, rate limit e lease persistente permitem a operação.

A policy e o estado são reavaliados depois da resposta do modelo e antes de publicar. Se staff assumir/fechar/pausar, se a guild desativar a IA ou remover a capability enquanto a geração está em andamento, a resposta é negada. Staff pode pausar/retomar pelo botão ou pelas routes; o estado sobrevive a restart.

Pedidos equivalentes a “quero falar com uma pessoa”, “quero atendente”, “chama o suporte” e “não quero falar com bot” usam detecção determinística antes do modelo. Em ticket ativo, o pedido persiste o handoff e pausa a IA mesmo se geração automática estiver OFF. A notificação identifica o CylBot como IA; uma falha ao notificar não desfaz a pausa.

## Contexto, privacidade e prompt injection

O prompt é separado em política fixa, contexto da guild, dados estruturados do ticket, conversa e contrato de saída. Contexto e instruções administrativas são tratados como dados não confiáveis e não podem substituir a política fixa.

São enviados no máximo 12 registros recentes, 700 caracteres por registro e 6.000 caracteres de conversa. O contexto inclui categoria, assunto, descrição, estado, presença de responsável e tipos dos cinco eventos mais recentes. Não inclui IDs desnecessários, tokens, OAuth, `DATABASE_URL`, logs técnicos, anexos, prompts completos ou outros tickets.

Até a Etapa 4, o histórico depende das mensagens disponíveis no Discord. Não existe `ticket_messages` multicanal nem chat Web. O debounce de dois segundos é apenas uma otimização local; lease, cooldown, pausa, escalation e auditoria críticos ficam no PostgreSQL.

O provider solicita JSON Schema estrito e não envia `tools`. A aplicação ainda valida JSON, chaves exatas, ação na allowlist, mensagem até 1.600 caracteres, confiança entre 0 e 1, motivo conhecido e booleano `requiresHuman`. Saída inválida vira `NO_ACTION`, é auditada como falha e não produz efeito.

## Persistência e auditoria

A migration `0004_ticket_ai_foundation.sql` cria:

- `ticket_ai_configs`: configuração e capabilities por guild;
- `ticket_ai_ticket_states`: pausa, escalation, último evento e lease por ticket;
- `ticket_ai_runs`: modelo, trigger, proposta/execução, confiança, necessidade humana, status, tokens e latência.

Não são salvos prompt, resposta completa ou conteúdo de mensagens em `ticket_ai_runs`. Eventos estruturados incluem `ticket.ai.requested`, `completed`, `failed`, `action_proposed`, `action_denied`, `action_executed`, `escalated`, `paused` e `resumed` sem conteúdo privado.

## API protegida

| Método | Route | Uso |
| --- | --- | --- |
| GET | `/api/tickets/ai/config/:guildId` | Ler configuração da guild |
| PUT | `/api/tickets/ai/config/:guildId` | Validar e salvar configuração |
| POST | `/api/tickets/:ticketId/ai/analyze` | Produzir sugestão estruturada para staff |
| POST | `/api/tickets/:ticketId/ai/suggest` | Alias semântico da análise segura |
| POST | `/api/tickets/:ticketId/ai/pause` | Pausar IA no ticket |
| POST | `/api/tickets/:ticketId/ai/resume` | Remover pausa/escalation persistida |

As routes exigem sessão, guild real retornada pelo OAuth com ManageGuild/Administrator, bot instalado, autorização de staff/admin no Core, Origin confiável para mutações, validação do body e limites por usuário/guild/ticket. `guildId` do body nunca basta: o repository carrega o ticket pela combinação guild + UUID. Não existe `/execute-anything` nem endpoint de close por IA.

## Falhas e custos

OpenRouter usa timeout configurável de até 30 segundos e retry zero neste caminho. Timeout, indisponibilidade, saída inválida ou falha de publicação não alteram o lifecycle do ticket. A execução registra falha e retorna `NO_ACTION`; a equipe pode atender normalmente.

Quando o provider fornece usage, são persistidos modelo, input/output tokens e latência para medição futura. Não há cobrança, Stripe ou regra `if (premium)` espalhada: o acesso de desenvolvimento fica centralizado no `TicketAIPolicyService` por configuração do ambiente.

## Smoke test manual

Use uma guild de desenvolvimento e uma chave com créditos controlados. O teste chama OpenRouter e não faz parte de `npm test`.

1. Aplique migrations, registre `/ticket`, habilite Message Content e configure as variáveis acima.
2. Configure nível 0; envie mensagem do criador no ticket e confirme ausência de resposta.
3. Configure nível 1; envie mensagens em sequência e confirme uma sugestão no log privado após o debounce.
4. Configure nível 2; envie mensagem do criador e confirme resposta com o cabeçalho **CylBot · Assistente IA**.
5. Escreva “quero falar com atendente”; confirme aviso, pausa persistente e ticket ainda aberto.
6. Retome, clique **Assistente IA → Pausar IA**, envie mensagem e confirme ausência de geração.
7. Assuma o ticket como staff; confirme que novas mensagens do criador não recebem auto reply.
8. Use **Sugerir resposta** e confirme que a resposta aparece apenas para o staff, sem publicação automática.
9. Remova temporariamente a chave ou use um modelo inválido; confirme mensagem segura/ausência de ação e ticket íntegro.
10. Confirme em logs/auditoria modelo, ação, tokens/latência quando disponíveis, sem prompt ou conteúdo da mensagem.

Não execute esse roteiro em produção antes de revisar privacidade, política da comunidade e custo do modelo escolhido.
