# Suíte de testes do bot

Os arquivos continuam organizados por domínio. Alguns combinam regras de negócio e contratos do adapter; separar tudo em diretórios por tipo duplicaria fixtures sem benefício suficiente. A classificação abaixo orienta manutenção e priorização por risco.

| Arquivo | Tipo | Riscos protegidos |
| --- | --- | --- |
| `announcementDraftManager.test.js` | Unitário | Acesso indevido, expiração, bloqueio e invalidação de prévias |
| `announcements.test.js` | Unitário + integração local + contrato Discord | Permissões, isolamento por guild, revisão, concorrência, persistência, erro de envio e duplicação |
| `jsonAnnouncementRepository.test.js` | Integração local de filesystem | Preservação dos dados em erro de escrita/rename, JSON inválido e isolamento entre guilds |
| `api.test.js` | Contrato + integração local | Métodos/paths, formatos, JSON inválido, limite de body, 404, status, erros sem detalhes internos, requestId por chamada e delegação aos services |
| `security.test.js` | Segurança HTTP + integração local | Bloqueio anônimo, guild/canal, permissões do bot, isolamento por owner, Origin/CORS, quotas, memória limitada, body e erros sem secrets |
| `dashboard.test.js` | Unitário + contrato HTTP/provider | Sessão obrigatória, scopes antigos, expiração/relogin, permissões BigInt, instalação/cache pronto, DTO sem tokens, ordenação, ícones e falhas externas |
| `auth.test.js` | Unitário + contrato HTTP | State vinculado ao browser, expiração/replay, OAuth fake, sessão, cookies, logout/Origin, perfil sem tokens e avatar fallback |
| `env.test.js` | Unitário + integração local de startup | Credenciais obrigatórias, defaults, valores inválidos, secrets, configuração opcional e LOG_LEVEL |
| `origins.test.js` | Segurança de configuração + contrato HTTP | Allowlist DEV/produção, Codespace atual/estrangeiro, override, callback, CORS, logout e cookies |
| `composition.test.js` | Composição + contratos Discord/HTTP | Instâncias compartilhadas, API injetada, handlers com services do client, ordem do registry e slash commands existentes |
| `viteProxy.test.js` | Integração local com Vite real | Preservação de Origin local/Codespaces/ausente e rejeição de Codespace estrangeiro pelo backend |
| `logger.test.js` | Unitário + contrato de logging | JSON estruturado, Error, redaction com credenciais fictícias, níveis, saída indisponível, ausência de conteúdo bruto OpenRouter e console centralizado |
| `textaAIService.test.js` | Unitário | Entradas, revisão, content/embed, ownership, transições, expiração e falha do provider |
| `textaAIHandler.test.js` | Integração local + contrato Discord | Reconhecimento de interação, modais, botões, preview, aprovação, erros e nova tentativa após falha |
| `openRouterOutput.test.js` | Unitário | Validação local de saída content/embed e limites antes da publicação |
| `tickets.test.js` | Service + JSON + Discord simulado | Identidade/sequência, limites, claim concorrente, fechamento, falhas/checkpoints, exclusão e reabertura sem canal antigo |
| `ticketSetup.test.js` | Setup + JSON | Autorização, wizard, estrutura automática/existente, categorias, expiração, retomada e confirmação concorrente |
| `ticketTranscript.test.js` | Transcript + filesystem | Paginação, HTML seguro, links, tamanho máximo, versões imutáveis, integridade, JSON inválido e falhas de escrita |
| `ticketHandler.test.js` | Contrato Discord | Registry, comando/permissões, componentes, modais, fluxo completo, IDs inválidos e erros sem conteúdo privado |
| `discordTicketAdapter.test.js` | Adapter Discord simulado | Tipos de canal, permissões/overwrites, logs privados, reutilização por topic, intent e coleta restrita de campos |

## Execução

Ambiente de validação desta suíte: **Node.js 24**. Use essa versão na futura CI para reproduzir a execução verificada. A compatibilidade com todas as versões aceitas pelo `engines` do bot não foi validada nesta etapa.

A partir da raiz do repositório, com dependências instaladas:

```bash
npm --prefix bot test
npm --prefix web run build
git diff --check
```

Dentro de `bot/`:

```bash
npm test
npm test
npm --prefix ../web run build
```

Um único arquivo, dentro de `bot/`:

```bash
node --test test/textaAIService.test.js
```

`npm test` descobre explicitamente `test/*.test.js`: helpers não são executados como arquivos de teste. Não há scripts `test:unit`/`test:integration`, pois alguns arquivos cobrem ambos os tipos. Não existe meta percentual de cobertura.

## Isolamento e fixtures

- `helpers/isolatedConfig.js` deve ser importado **antes dos módulos de produção** que consomem configuração global (como logger e configuração de presença). Ele substitui `getConfig` por configuração validada vazia, sem ler `.env` ou alterar `process.env`, e restaura o método ao terminar o arquivo.
- `helpers/tempDirectory.js` cria diretórios em `os.tmpdir()` e registra `t.after` imediatamente. Use-o sempre que precisar de filesystem; não use `bot/data/` como fixture.
- Os testes de UI de anúncios recebem services injetados. Os testes do service/API usam repositories próprios, temporários ou em memória.
- Mocks de relógio, filesystem, console e métodos usam `t.mock` e são restaurados por teste. Preserve a execução sequencial **dentro de cada arquivo**; não habilite `concurrency: true` nesses testes. O isolamento padrão do runner permite processos separados entre arquivos.
- Os testes de TTL controlam timestamps, sem esperar minutos. Operações concorrentes usam promises liberadas explicitamente.
- `env.test.js` usa subprocessos com `env: {}`, diretório temporário e timeout para verificar startup sem credenciais. O ambiente precisa permitir criação de processos; um bloqueio `EPERM` do sandbox não deve ser ignorado ou convertido em teste pulado.
- Objetos de interação mínimos ficam próximos aos testes. O helper de interação Texta_AI permanece no seu arquivo porque não há necessidade de criar um mock genérico Discord.
- `helpers/ticketFixture.js` monta repositories temporários reais, relógio controlado e adapter Discord simulado. Nunca usa arquivos de `bot/data/`. A suíte de tickets não registra comandos nem abre conexões ao Discord.

## Rede e execução em CI

Nenhum teste precisa de Discord, OpenRouter ou Spotify reais. Providers/channels são fakes; a validação de saída OpenRouter chama apenas código local. Os testes HTTP usam principalmente streams em memória. Os testes de composição e proxy abrem listeners somente em `127.0.0.1`, em portas efêmeras, encerrados ao terminar. O teste Vite usa as dependências instaladas em `web/` e carrega a configuração real. Não execute `npm start`, `commands:register` ou `spotify:auth` para validar a suíte.

Em um checkout limpo, instale dependências com `npm --prefix bot ci` e `npm --prefix web ci` e execute os comandos acima. A instalação pode precisar de acesso ao registry; a execução dos testes não exige acesso externo à rede, `.env`, credenciais ou input interativo. O ambiente deve permitir subprocessos e conexões loopback. Não foi criado workflow de GitHub Actions.

## Sobreposição intencional e limites

Permissões/revisões aparecem em mais de uma camada para proteger contratos distintos: regras do service, tradução do handler e status/resposta HTTP. Esses testes foram preservados; somente a criação repetida de temporários foi consolidada.

Continuam fora da cobertura: disponibilidade e respostas reais dos providers, permissões efetivas calculadas pelo Discord, OAuth Spotify, experiência visual React e transporte HTTP por socket. O limite de body é validado em bytes, inclusive UTF-8 fracionado e excesso; chunks após rejeição não são acumulados. Testes de limites individuais de embed não demonstram todas as combinações possíveis de tamanho total aceitas pelo Discord.

Os testes OAuth usam provider/fetch fakes e relógio injetado, sem conta Discord ou portas. Validam os endpoints pelo callback HTTP em memória; o consentimento real no Discord, o comportamento de cookies no navegador e a configuração do proxy devem ser conferidos pelo roteiro manual do README. Os testes de env incluem OAuth opcional, origem/callback HTTPS e TTL; o logger cobre as novas credenciais.

O dashboard usa provider/fetch fake e client com Map de guilds. Os testes não acessam Discord. A suíte de auth valida agora os scopes `identify guilds` e seu armazenamento na sessão. O frontend do dashboard é validado pelo build; não foi adicionado framework React de testes.

Os testes de contrato API usam sessões fictícias e Origin explícita. Os testes de segurança exercitam o dispatcher com um único limiter por instância, relógio injetado e permissões reais de bitfield sobre canais fakes. Não há chamadas reais a Discord/OpenRouter.
