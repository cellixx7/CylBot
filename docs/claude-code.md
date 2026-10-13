# Claude Code no CylBot

Configuração mínima de skills para desenvolver o CylBot com Claude Code, avaliação das referências consideradas e instruções para reproduzir o ambiente em outra máquina ou Codespace.

## O que é versionado

| Caminho | Papel | Carregamento |
| --- | --- | --- |
| `CLAUDE.md` | Regras invioláveis, comandos de validação e ponteiro para a skill `cylbot` | Sempre, em toda sessão |
| `.claude/skills/cylbot/SKILL.md` | Roteiro: qual referência abrir para cada tipo de mudança | Quando a tarefa envolve features, comandos, rotas, migrations, IA ou Spotify |
| `.claude/skills/cylbot/references/*.md` | `new-feature`, `discord`, `openrouter`, `database`, `spotify` | Uma por vez, quando o `SKILL.md` indica |

O Claude Code só descobre esses arquivos nesses caminhos; por isso eles ficam fora de `docs/`. Este documento é a referência humana.

## Skills de terceiros (locais, fora do Git)

| Skill | Origem | Licença | Uso no CylBot |
| --- | --- | --- | --- |
| `discord-developers` | [LevyBytes/AI-SKILL-discord-developers](https://github.com/LevyBytes/AI-SKILL-discord-developers) | AGPL-3.0 | Campos, limites, intents, permissões e OAuth2 da API Discord |
| `prompt-engineer` | [jeffallan/claude-skills](https://github.com/Jeffallan/claude-skills) | MIT | Prompts e schemas de saída estruturada (Texta_AI, TicketAI, anúncios) |
| `postgres-pro` | jeffallan/claude-skills | MIT | Índices, locks, EXPLAIN, migrations |
| `security-reviewer` | jeffallan/claude-skills | MIT | Auditoria de auth, sessões, cookies, CORS e transcripts |
| `react-expert` | jeffallan/claude-skills | MIT | Opcional: hooks e componentes React 19 do `web/` |

Ficam em `.claude/skills/` mas listadas em `.git/info/exclude`: não entram no repositório (a AGPL não é misturada à licença ISC do projeto) e cada ambiente instala as suas.

### Instalação (Git Bash, Linux, macOS ou Codespaces)

Na raiz do repositório:

```bash
git clone --depth 1 https://github.com/LevyBytes/AI-SKILL-discord-developers.git .claude/skills/discord-developers
git clone --depth 1 https://github.com/Jeffallan/claude-skills.git /tmp/jeffallan-skills
for s in prompt-engineer postgres-pro security-reviewer react-expert; do cp -r /tmp/jeffallan-skills/skills/$s .claude/skills/$s; done
printf '%s\n' /.claude/skills/discord-developers/ /.claude/skills/prompt-engineer/ /.claude/skills/postgres-pro/ /.claude/skills/security-reviewer/ /.claude/skills/react-expert/ >> .git/info/exclude
```

Use HTTPS: redes que bloqueiam a porta 22 impedem clones SSH. Abra uma nova sessão do Claude Code para as skills aparecerem.

## Avaliação das referências

| Referência | Decisão | Motivo |
| --- | --- | --- |
| Discord Bot Architect ([davila7/claude-code-templates](https://github.com/davila7/claude-code-templates/blob/main/cli-tool/components/skills/enterprise-communication/discord-bot-architect/SKILL.md)) | Não usar | Conteúdo básico já presente no CylBot, metade em Pycord, blocos de código quebrados, promete sharding/rate limit sem cobrir e desaconselha o Message Content Intent que os tickets usam |
| Fullstack Dev Skills (jeffallan, 67 skills) | Só 4 skills | O plugin completo carrega cerca de 14 KB de descrições em toda sessão e traz comandos que dependem de Jira |
| `javascript-pro`, `test-master` (jeffallan) | Não usar | Orientam ESM e Jest/Vitest; o bot é CommonJS com `node:test` |
| `code-reviewer` (jeffallan) | Não usar | Coberto pelos comandos nativos `/code-review` e `/security-review` |
| Discord Developer Platform (LevyBytes) | Usar | Divulgação progressiva: só o `SKILL.md` (3 KB) fica no contexto; 124 referências abertas sob demanda. Ressalva: retrato pontual da documentação oficial, pode envelhecer |
| Skills de OpenRouter da comunidade | Não usar | Exigem Bun e executam scripts com a `OPENROUTER_API_KEY`; o conhecimento específico do projeto está em `references/openrouter.md` |
| `claude-api` (nativa) | Não se aplica | Desativa-se em projetos que usam o SDK `openai` (caso do OpenRouter) |

## Como as skills são acionadas

O Claude vê apenas nome e descrição de cada skill; o corpo é carregado quando a tarefa combina com a descrição (ou com `/nome`), e as referências só quando o corpo manda.

| Tarefa | Skills |
| --- | --- |
| Criar comando, botão, rota ou tela | `cylbot` → `new-feature.md` (+ `react-expert` para UI) |
| Dúvida sobre intent, permissão, limite ou evento Discord | `cylbot` → `discord.md`; `discord-developers` para o detalhe da API |
| Prompt, schema ou modelo de IA | `cylbot` → `openrouter.md` + `prompt-engineer` |
| Tabela, índice ou migration | `cylbot` → `database.md` + `postgres-pro` |
| Spotify / presence | `cylbot` → `spotify.md` |
| Antes de PR | `/code-review`, `/security-review` ou `security-reviewer` |

Para manter o contexto enxuto: skills em escopo de projeto (não carregam em outros repositórios), descrições específicas e uma referência por vez. Se uma skill disparar sem necessidade, remova a pasta dela.

## Arquitetura de referência

```text
Usuários Discord                     Web React 19 (Vite, proxy /api)
       │                                        │
       ▼                                        ▼
┌───────────────────── processo bot (Node.js, CommonJS) ─────────────────────┐
│  Adaptador Discord                        API HTTP :3001                   │
│  commands / events / handlers             node:http, rotas, sessões        │
│              └──────────────┬───────────────────┘                          │
│                Services compartilhados (createServices)                    │
│        Tickets, TicketAI, Texta_AI, anúncios, auth, perfil, presence       │
└──────┬──────────────────┬────────────────────┬──────────────────┬──────────┘
       ▼                  ▼                    ▼                  ▼
  PostgreSQL         OpenRouter           Spotify API        Discord REST
  (Drizzle, pg)      (SDK openai)         (presence)         (OAuth2, API)
```

Bot e API permanecem no mesmo processo e compartilham os services; detalhes e regras em [architecture.md](architecture.md).
