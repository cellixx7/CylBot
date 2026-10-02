import test from 'node:test';
import assert from 'node:assert/strict';
import { getComingSoonFeature, comingSoonFeatures } from '../src/lib/comingSoonFeatures.js';
import { CYL_DOCS_BASE_URL, footerGroups, footerSocialLinks } from '../src/lib/footerLinks.js';

const allFooterLinks = footerGroups.flatMap(group => group.links).concat(footerSocialLinks);
const labels = footerGroups.map(group => [group.title, group.links.map(link => link.label)]);

test('catálogo de Em breve resolve recursos conhecidos e usa fallback seguro', () => {
  const docs = getComingSoonFeature('docs');
  const unknown = getComingSoonFeature('__proto__');

  assert.equal(docs.title, 'Documentação do CYL');
  assert.match(docs.description, /Central oficial/);
  assert.equal(unknown.isFallback, true);
  assert.equal(unknown.slug, null);
  assert.notEqual(unknown.title, 'nao-existe');
});

test('Footer mantém o catálogo público centralizado e sem destinos fictícios', () => {
  assert.deepEqual(labels[0], ['Produto', ['Recursos', 'Tickets', 'Automação', 'IA', 'Premium', 'CYL Credits', 'Docs']]);
  assert.deepEqual(labels[1], ['Empresa', ['Sobre o CYL', 'Parceiros', 'Seja parceiro', 'Trabalhe conosco', 'Status']]);
  assert.equal(labels.some(([, groupLabels]) => groupLabels.includes('Roadmap')), false);
  assert.equal(labels.some(([, groupLabels]) => groupLabels.includes('Integrações')), false);
  assert.equal(labels.some(([, groupLabels]) => groupLabels.includes('Produto Comunidade')), false);

  for (const link of allFooterLinks) {
    assert.notEqual(link.type, undefined);
    if (link.type === 'coming-soon') assert.ok(comingSoonFeatures[link.slug]);
    if (link.type === 'section') assert.ok(['recursos', 'sobre'].includes(link.section));
    if (link.type === 'external') assert.match(link.href, /^https:\/\//);
    if (link.type === 'docs') assert.match(link.href, new RegExp(`^${CYL_DOCS_BASE_URL}`));
  }

  const legalGroup = footerGroups.find(group => group.title === 'Legal');
  assert.ok(legalGroup.links.every(link => link.type === 'docs'));
  const docsHome = allFooterLinks.find(link => link.label === 'Docs');
  assert.equal(docsHome.href, CYL_DOCS_BASE_URL);

  const discord = allFooterLinks.find(link => link.label === 'Servidor do Discord');
  assert.equal(discord.href, 'https://discord.gg/aBUxPSJWhZ');
});
