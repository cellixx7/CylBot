Atue como Frontend Engineer Sênior e UI Engineer no projeto **CylBot**.

Há três arquivos anexados que DEVEM ser tratados como referências oficiais desta implementação:

* `CylBot-Interface.png` → **referência principal de composição e direção visual**;
* `CylBot-Background.png` → **background oficial fornecido para esta interface**;
* `CylBot-Logo.png` → **logo oficial atual do CylBot**.

A implementação anterior fugiu da identidade visual desejada.

Nesta etapa, corrija isso.

O objetivo NÃO é criar uma nova identidade para o CylBot.

O objetivo é:

**traduzir fielmente a composição visual anexada para React/CSS, preservando a arquitetura funcional já implementada.**

---

# REGRA PRINCIPAL

NÃO interprete as imagens apenas como inspiração.

`CylBot-Interface.png` define:

* composição;
* proporções;
* hierarquia;
* quantidade de espaço vazio;
* posição aproximada dos elementos;
* contraste;
* estilo geral.

Use-a como referência visual direta.

Não transforme o layout em:

* dashboard SaaS genérico;
* conjunto de cards arredondados;
* glassmorphism;
* landing page corporativa;
* gradientes neon;
* interface cheia de caixas;
* visual Discord clone;
* página excessivamente centralizada.

---

# IDENTIDADE VISUAL

A direção visual desejada é:

```text
dark
minimal
editorial
tecnológica
monocromática
misteriosa
premium
brutalista de forma controlada
```

A página deve transmitir:

```text
produto independente
+
tecnologia
+
personalidade
+
controle
```

e não:

```text
startup SaaS genérica
```

---

# Background

Use `CylBot-Background.png` como asset real da página.

Ele contém:

* preto/cinza profundo;
* textura/granulação;
* iluminação vertical suave;
* pequenas variações de luminosidade;
* atmosfera escura.

NÃO recrie esse background apenas com:

```css
background: #111;
```

ou um gradiente genérico.

Use a imagem fornecida.

Ela deve cobrir toda a seção principal:

```css
background-size: cover;
background-position: center;
```

ou equivalente adequado.

Preserve a aparência da referência.

Não aplique blur excessivo sobre o background.

---

# Logo

Use `CylBot-Logo.png`.

Não:

* recrie a logo com CSS;
* substitua por texto;
* use ícone genérico;
* distorça a proporção.

Existem dois usos visuais na referência:

### Marca global pequena

No canto superior esquerdo:

```text
[ símbolo CylBot ]
```

pequeno e discreto.

### Logo principal

Na região superior esquerda do Hero:

```text
        [ logo ]

CYLBOT
O app no seu controle.
```

A logo principal deve ter maior presença, mas não competir com o wordmark.

---

# HERO — composição principal

A primeira dobra deve seguir aproximadamente esta estrutura:

```text
┌───────────────────────────────────────────────────────────┐
│ símbolo pequeno                                ◫      ●    │
│                                                           │
│                                                           │
│             LOGO                                          │
│                                                           │
│   CYLBOT                                                  │
│   O app no seu controle.                                  │
│                                                           │
│                                                           │
│                                                           │
│                    MUITO ESPAÇO NEGATIVO                  │
│                                                           │
│                                                           │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

A quantidade de espaço vazio é INTENCIONAL.

Não tente preencher automaticamente toda área livre.

---

# Importante: espaço negativo

O design usa grandes áreas vazias como elemento visual.

Portanto:

NÃO preencha a primeira tela com:

* seis cards;
* métricas;
* grids;
* slogans;
* badges;
* parágrafos;
* muitas CTAs.

A composição deve respirar.

Elementos adicionais serão introduzidos posteriormente.

---

# Wordmark CYLBOT

O texto:

```text
CYLBOT
```

deve ser:

* muito grande;
* branco;
* pesado;
* geométrico;
* forte;
* com pouco espaçamento entre letras;
* visualmente semelhante ao mockup.

Não use uma fonte genérica fina.

Caso a fonte exata não esteja disponível, escolha uma alternativa visualmente próxima e mantenha a implementação fácil de substituir posteriormente.

Não introduza uma nova fonte externa sem necessidade.

---

# Subtítulo

Manter inicialmente:

```text
O app no seu controle.
```

Estilo:

* branco/cinza muito claro;
* bastante menor que CYLBOT;
* peso leve/regular;
* espaçamento visual confortável.

Não transformar em uma descrição longa.

---

# Header

O header não deve parecer uma navbar tradicional.

Referência:

```text
[logo pequena]                                      [dashboard] [perfil]
```

Sem barra sólida.

Sem container evidente.

Sem:

```text
Home | Recursos | Preços | Sobre | Contato
```

nesta etapa.

---

# Lado esquerdo

Logo pequena no canto superior esquerdo.

Ela funciona como:

```text
Home
```

ou identidade de marca.

Hover pode ser muito discreto.

---

# Lado direito

Usar dois controles visuais minimalistas.

Quando autenticado:

```text
[ Dashboard ]
[ Perfil ]
```

Preferencialmente representados por ícones coerentes com a referência.

Não use botões grandes.

Pode haver tooltip:

```text
Dashboard
Perfil
```

no hover.

---

# Estado não autenticado

Quando usuário NÃO estiver autenticado, a região direita pode apresentar algo visualmente equivalente a:

```text
[ Entrar ]
```

ou ícone de usuário/login.

Não mostrar Dashboard se não houver sessão.

---

# Estado autenticado

Quando autenticado:

```text
Dashboard
Perfil
```

devem estar disponíveis.

Preserve:

* sessão existente;
* OAuth;
* `/api/auth/me`;
* logout;
* dashboard existente.

Não altere segurança/backend nesta etapa.

---

# Home pública

A Home deve permanecer pública.

O usuário não autenticado NÃO deve ser imediatamente enviado para LoginPage.

Fluxo:

```text
/
    Home

Entrar
    ↓
Discord OAuth

autenticado
    ↓
Home continua disponível
+
Dashboard
+
Perfil
```

---

# Área direita / área vazia

NÃO preencha ainda com conteúdo genérico.

Prepare estruturalmente uma região:

```text
hero-visual
```

para futuramente comportar algo como:

* perfil do CylBot no Discord;
* status da comunidade;
* atividade;
* interface do bot;
* componente da comunidade.

Por enquanto, se ainda não houver implementação definida, deixe essa região limpa.

Não invente um card SaaS.

---

# Próximas seções

A Home terá futuramente:

```text
Hero

↓ Sobre o CylBot

↓ Recursos

↓ Comunidade

↓ Criador

↓ Contato

↓ Footer
```

Mas nesta etapa concentre o refinamento principalmente no Hero e na estrutura global.

As seções inferiores podem permanecer simples.

---

# Arquitetura React

Preserve a arquitetura criada anteriormente.

Algo próximo de:

```text
src/
├── app/
├── components/
├── home/
├── auth/
├── profile/
└── dashboard/
```

No Hero:

```text
home/
├── Home.jsx
├── Hero.jsx
└── HeroActions.jsx
```

Não fragmentar excessivamente.

---

# Assets

Organize os arquivos fornecidos dentro de uma pasta coerente, por exemplo:

```text
web/src/assets/brand/
├── cylbot-logo.png
└── cylbot-background.png
```

ou:

```text
web/public/assets/
```

Escolha conforme a arquitetura existente.

Não duplique os assets.

---

# Layout responsivo

A referência anexada é principalmente desktop.

No desktop:

* manter proporção ampla;
* bastante espaço negativo;
* bloco principal no canto/esquerda;
* header nos extremos.

No mobile:

* reduzir CYLBOT proporcionalmente;
* manter logo e título no topo;
* não comprimir tudo;
* preservar espaço e identidade.

Mobile NÃO precisa reproduzir literalmente a mesma proporção do desktop.

---

# Altura do Hero

A primeira seção deve ocupar aproximadamente:

```text
100vh
```

ou uma altura equivalente que preserve a composição.

Evite Hero pequeno.

A página deve causar impacto antes do scroll.

---

# Movimento

Se adicionar animação, use apenas movimentos discretos:

* fade;
* pequena entrada vertical;
* hover;
* leve movimento de iluminação.

Não adicionar:

* partículas;
* neon piscando;
* parallax pesado;
* animações constantes;
* elementos 3D.

---

# Textura

Não remova o caráter granulado/analógico do background.

Ele é parte importante da identidade.

Evite filtros CSS que destruam sua textura.

---

# Cores

Nesta fase, use principalmente:

```text
preto
cinza escuro
branco
```

Um accent color poderá ser desenvolvido depois.

Não introduza paleta azul/roxa de Discord como identidade principal.

---

# Ícones

Os ícones devem seguir:

```text
monocromáticos
brancos
geométricos
simples
```

Não use emojis.

Não use ícones coloridos.

---

# CSS

Antes de adicionar novas regras:

1. analise o CSS atual;
2. remova estilos antigos que conflitam com a nova identidade;
3. evite duplicação;
4. estabeleça tokens mínimos.

Exemplo:

```css
:root {
  --bg: #101313;
  --text: #f7f7f5;
  --text-muted: rgba(255,255,255,.72);
}
```

Não crie um design system gigantesco.

---

# IMPORTANTE

A imagem `CylBot-Interface.png` é o alvo visual.

Ao terminar, compare mentalmente:

```text
mockup anexado
vs
implementação
```

A implementação deve ser imediatamente reconhecível como a tradução daquele design.

Se o resultado parecer:

```text
uma landing page SaaS diferente com logo do CylBot
```

a tarefa falhou.

---

# Não mexer

Não alterar nesta etapa:

* OAuth;
* sessões;
* rate limiting;
* autorização;
* guild permissions;
* backend;
* APIs;
* anúncios;
* Texta_AI;
* sistema de tickets.

Somente interface/estrutura necessária.

---

# Antes de implementar

Informe brevemente:

1. o que na UI atual diverge do mockup;
2. quais componentes serão ajustados;
3. onde os assets serão armazenados;
4. quais estilos antigos serão removidos/reaproveitados.

Depois implemente.

---

# Validação

Execute:

```bash
npm --prefix web run build
npm --prefix bot test
git diff --check
```

Não quebre funcionalidades existentes.

---

# Resultado esperado

Ao final, a primeira tela deve se aproximar visualmente de:

```text
logo pequena                           controles

          logo CYL

CYLBOT
O app no seu controle.



      grande composição escura
      com bastante espaço vazio
```

usando diretamente:

```text
CylBot-Background.png
CylBot-Logo.png
```

e mantendo o comportamento:

```text
não autenticado
→ Login

autenticado
→ Dashboard + Perfil
```

Relate ao final:

* arquivos alterados;
* assets adicionados;
* componentes modificados;
* comportamento desktop;
* comportamento mobile;
* diferenças ainda existentes em relação ao mockup;
* resultado dos testes/build.

Não avance para novas funcionalidades.
