const definitions = [
  ['tickets-docs', 'Documentação de tickets', 'Documentação completa do sistema de tickets do CYL, incluindo configuração, atendimento, IA, handoff humano, permissões e exemplos de uso.'],
  ['automation-docs', 'Automações', 'Guias para criação de automações no CYL, conectando eventos, condições e ações para reduzir tarefas manuais na comunidade.'],
  ['ai-docs', 'Inteligência do CYL', 'Documentação dos assistentes e recursos de inteligência do CYL, incluindo personalidades, contexto, limites, handoff e integração com tickets.'],
  ['premium', 'CYL Premium', 'Planos e benefícios Premium do CYL, com recursos adicionais de automação, inteligência, personalização e capacidade para comunidades maiores.'],
  ['cyl-credits', 'CYL Credits', 'Sistema de créditos do CYL para consumo de recursos adicionais, especialmente funcionalidades com custo variável como inteligência artificial.'],
  ['docs', 'Documentação do CYL', 'Central oficial de documentação do CYL com guias, configuração, referências, exemplos, APIs, troubleshooting e detalhes de cada recurso.'],
  ['partners', 'Parceiros', 'Espaço para conhecer empresas, comunidades, projetos e serviços que fazem parte do ecossistema e das parcerias oficiais do CYL.'],
  ['become-partner', 'Seja parceiro', 'Página para comunidades, empresas e criadores interessados em construir integrações, ações ou parcerias com o CYL.'],
  ['careers', 'Trabalhe conosco', 'Área para oportunidades de colaboração e trabalho no desenvolvimento, design, comunidade, conteúdo e evolução do ecossistema CYL.'],
  ['status', 'Status', 'Página externa de status para acompanhar disponibilidade do site, API, bot Discord, banco e principais serviços do CYL.'],
  ['support', 'Suporte', 'Central de suporte nativa do CYL para abertura e acompanhamento de atendimentos diretamente pela plataforma.'],
  ['contact', 'Contato', 'Página oficial de contato do CYL com canais de suporte, redes sociais, informações institucionais e formas de falar com a equipe.'],
  ['suggestions', 'Sugestões', 'Espaço para enviar sugestões, ideias de recursos e melhorias diretamente para a equipe do CYL e acompanhar sua avaliação.'],
  ['report-problem', 'Reportar problema', 'Formulário para relatar bugs e problemas encontrados no CYL com contexto suficiente para investigação e acompanhamento.'],
  ['terms', 'Termos de Uso', 'Documento que definirá as regras de utilização da plataforma CYL, responsabilidades, direitos do usuário e condições de uso dos serviços.'],
  ['privacy', 'Política de Privacidade', 'Política que explicará quais dados o CYL utiliza, por quais motivos, como são protegidos e quais direitos os usuários possuem.'],
  ['cookies', 'Política de Cookies', 'Informações sobre cookies, sessões e tecnologias utilizadas pelo site para autenticação, segurança, preferências e funcionamento da plataforma.'],
  ['lgpd', 'LGPD', 'Área dedicada aos direitos previstos pela LGPD, tratamento de dados pessoais e canais para solicitações relacionadas à privacidade.'],
  ['premium-terms', 'Termos Premium', 'Condições específicas dos serviços Premium do CYL, incluindo assinatura, benefícios, limites, cancelamento e regras de utilização.'],
  ['acceptable-use', 'Uso aceitável', 'Política que estabelecerá quais usos da plataforma são permitidos e quais comportamentos podem resultar em limitação ou suspensão do serviço.'],
  ['api-docs', 'API do CYL', 'Referência técnica da API do CYL para integrações, autenticação, endpoints, erros, limites e exemplos de utilização.'],
  ['changelog', 'Changelog', 'Histórico oficial das versões do CYL, novos recursos, melhorias, correções e mudanças importantes da plataforma.'],
  ['security', 'Segurança', 'Central de segurança do CYL com boas práticas, informações sobre proteção da plataforma e orientações para reporte responsável de vulnerabilidades.'],
];

export const comingSoonFeatures = Object.freeze(Object.fromEntries(
  definitions.map(([slug, title, description]) => [slug, Object.freeze({ slug, title, description })]),
));

export const fallbackComingSoonFeature = Object.freeze({
  slug: null,
  title: 'Novidades estão chegando ao CYL.',
  description: 'Estamos preparando novos espaços para ampliar a experiência de comunidades, administradores e criadores dentro do ecossistema CYL.',
  isFallback: true,
});

export function getComingSoonFeature(slug) {
  return typeof slug === 'string' && Object.hasOwn(comingSoonFeatures, slug)
    ? comingSoonFeatures[slug]
    : fallbackComingSoonFeature;
}
