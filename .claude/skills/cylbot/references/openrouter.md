# IA (OpenRouter) no CYLBOT

Para técnica de prompt e desenho de schema, combine com a skill `prompt-engineer`. Detalhes da IA de tickets: `docs/ticket-ai.md`.

## Provider único

- `bot/src/services/openRouterService.js`: SDK `openai` com `baseURL: https://openrouter.ai/api/v1`. **Uma** instância criada em `createServices` e compartilhada por Texta_AI, anúncios e TicketAI. Não crie outro client.
- Métodos: `generate(...)` (Texta_AI/anúncios, `OPENROUTER_MODEL`, `OPENROUTER_MAX_TOKENS` ≤ 800) e `generateTicket({ messages, schema, model, timeoutMs })` (TicketAI, `TICKET_AI_MODEL` com fallback para `OPENROUTER_MODEL`).
- Chamadas sempre com `timeout`, `AbortSignal.timeout(...)` e `maxRetries: 0`. Retentativa, se houver, é decisão do service.
- HTTP 402 = créditos/limite esgotados → mensagem amigável em português. Nunca logar `rawText`, prompt completo ou a chave.

## Saída estruturada

- Use `response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } }` com `additionalProperties: false` e todos os campos em `required`.
- Nem todo modelo do OpenRouter suporta `json_schema` strict. Ao trocar modelo, confirme suporte a structured outputs na página do modelo; sem suporte, a validação local rejeitará a resposta.
- Sempre valide localmente depois de `JSON.parse` (ver `validateOutput` em `bot/src/Ticket/services/ticketAIContract.js`): chaves exatas, enums, limites de tamanho, números finitos. Falha → erro codificado (`TICKET_AI_INVALID_OUTPUT`), nunca repasse texto bruto ao usuário.

## Fronteiras de segurança (TicketAI)

- `TicketAIContextService` limita e marca contexto não confiável (mensagens de usuário são dados, não instruções).
- `TicketAIPolicyService` decide `execute | suggest | deny | none`; o modelo apenas **propõe** ação (`CAPABILITIES`).
- `TicketAIActionService` não tem acesso a close/delete; publica via transação + lease + revalidação.
- `normalizeHandoff`: confiança < 0.6, pedido de humano ou incapacidade → escalação com `AI_HANDOFF_MESSAGE`.
- Ao adicionar capacidade nova: atualizar `CAPABILITIES`/`REASONS`, `OUTPUT_SCHEMA`, a policy, `validateConfig`, testes `ticketAI*.test.js` e `docs/ticket-ai.md`.

## Nova feature de IA

1. Defina o contrato (schema + validador) em um módulo próprio, como `ticketAIContract.js`.
2. Adicione um método no `OpenRouterService` ou reutilize `generateTicket` com outro schema; não espalhe chamadas ao SDK.
3. Autorização e limites no service; rate limit HTTP via config (`TICKETS_AI_RATE_LIMIT` é o exemplo).
4. Testes com provider falso (`{ generate: async () => ... }`), incluindo saída inválida, timeout e 402.
