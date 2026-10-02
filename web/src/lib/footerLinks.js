import { discordCommunityUrl } from './discordLinks.js';

export const CYL_DOCS_BASE_URL = 'https://cyldocs.gitbook.io/cyl';
export const repositoryUrl = 'https://github.com/cellixx7/CylBot';

const section = (label, sectionId) => ({ label, type: 'section', section: sectionId });
const docs = (label, path = '') => ({
  label,
  type: 'docs',
  href: path ? `${CYL_DOCS_BASE_URL}/${path}` : CYL_DOCS_BASE_URL,
});
const comingSoon = (label, slug) => ({ label, type: 'coming-soon', slug });
const external = (label, href) => ({ label, type: 'external', href });

export const cylDocsLinks = Object.freeze({
  home: CYL_DOCS_BASE_URL,
  tickets: `${CYL_DOCS_BASE_URL}/tickets.md`,
  automation: `${CYL_DOCS_BASE_URL}/automacao.md`,
  intelligence: `${CYL_DOCS_BASE_URL}/inteligencia.md`,
  legalTerms: `${CYL_DOCS_BASE_URL}/legal/termos-de-uso.md`,
  legalPrivacy: `${CYL_DOCS_BASE_URL}/legal/politica-de-privacidade.md`,
  legalCookies: `${CYL_DOCS_BASE_URL}/legal/politica-de-cookies.md`,
  legalLgpd: `${CYL_DOCS_BASE_URL}/legal/lgpd.md`,
  legalPremium: `${CYL_DOCS_BASE_URL}/legal/termos-premium.md`,
  legalAcceptableUse: `${CYL_DOCS_BASE_URL}/legal/uso-aceitavel.md`,
  changelog: `${CYL_DOCS_BASE_URL}/changelog.md`,
  security: `${CYL_DOCS_BASE_URL}/seguranca.md`,
});

export const footerGroups = [
  {
    title: 'Produto',
    links: [
      section('Recursos', 'recursos'),
      docs('Tickets', 'tickets.md'),
      docs('Automação', 'automacao.md'),
      docs('IA', 'inteligencia.md'),
      comingSoon('Premium', 'premium'),
      comingSoon('CYL Credits', 'cyl-credits'),
      docs('Docs'),
    ],
  },
  {
    title: 'Empresa',
    links: [
      section('Sobre o CYL', 'sobre'),
      comingSoon('Parceiros', 'partners'),
      comingSoon('Seja parceiro', 'become-partner'),
      comingSoon('Trabalhe conosco', 'careers'),
      comingSoon('Status', 'status'),
    ],
  },
  {
    title: 'Comunidade',
    links: [
      external('Servidor do Discord', discordCommunityUrl),
      external('GitHub', repositoryUrl),
      comingSoon('Suporte', 'support'),
      comingSoon('Contato', 'contact'),
      comingSoon('Sugestões', 'suggestions'),
      comingSoon('Reportar problema', 'report-problem'),
    ],
  },
  {
    title: 'Legal',
    links: [
      docs('Termos de Uso', 'legal/termos-de-uso.md'),
      docs('Política de Privacidade', 'legal/politica-de-privacidade.md'),
      docs('Política de Cookies', 'legal/politica-de-cookies.md'),
      docs('LGPD', 'legal/lgpd.md'),
      docs('Termos Premium', 'legal/termos-premium.md'),
      docs('Uso aceitável', 'legal/uso-aceitavel.md'),
    ],
  },
  {
    title: 'Desenvolvedores',
    links: [
      docs('Documentação'),
      comingSoon('API', 'api-docs'),
      docs('Changelog', 'changelog.md'),
      docs('Segurança', 'seguranca.md'),
      external('Open Source', repositoryUrl),
    ],
  },
];

export const footerSocialLinks = [
  external('GitHub', repositoryUrl),
  external('Discord', discordCommunityUrl),
  comingSoon('Contato', 'contact'),
];
