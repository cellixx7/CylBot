require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AnnouncementService } = require('../src/services/announcementService');
const { JsonAnnouncementRepository } = require('../src/repositories/jsonAnnouncementRepository');
const { sendableChannels } = require('../src/api/routes/announcementRoutes');
const { tempDirectory } = require('./helpers/tempDirectory');
const path = require('node:path');

const guildId = '1548161474227077212';
const channelId = '1548161474227077213';

test('workspace gera prévia de aviso, publica no Discord e preserva recentes por guild', async t => {
  const repository = new JsonAnnouncementRepository(path.join(tempDirectory(t, 'announcement-workspace-'), 'announcements.json'));
  const aiCalls = [];
  const service = new AnnouncementService(repository, { generate: async input => { aiCalls.push(input); return { content: 'Texto aprimorado.' }; } });
  const preview = await service.generateWorkspace({ guildId, guildName: 'Comunidade CYL', owner: 'web:user', type: 'NOTICE', title: 'Manutenção', content: 'O painel ficará indisponível às 22h.', channelId, context: 'Tom objetivo.', useAI: true });
  assert.equal(preview.title, 'Manutenção');
  assert.equal(preview.embed.description, 'Texto aprimorado.');
  assert.match(aiCalls[0].originalContext, /Aviso oficial/);
  const sent = [];
  const publication = await service.publishWorkspace({ draftId: preview.draftId, owner: 'web:user', guildId,
    channel: { id: channelId, name: 'avisos', guildId, isTextBased: () => true, send: async payload => sent.push(payload) },
    forwardedBy: { displayName: 'Equipe CYL' }, communityVisible: true });
  assert.equal(sent.length, 1);
  assert.equal(publication.type, 'NOTICE');
  assert.equal(publication.channelName, 'avisos');
  assert.equal(publication.communityVisible, true);
  assert.equal((await service.recent(guildId))[0].id, publication.id);
  assert.deepEqual(await service.recent('1548161474227077222'), []);
});

test('workspace não publica rascunho em canal ou guild divergentes', async t => {
  const service = new AnnouncementService(new JsonAnnouncementRepository(path.join(tempDirectory(t, 'announcement-workspace-'), 'announcements.json')));
  const preview = await service.generateWorkspace({ guildId, guildName: 'CYL', owner: 'web:user', type: 'UPDATE', title: 'Nova função', content: 'Detalhes.', channelId, useAI: false });
  await assert.rejects(service.publishWorkspace({ draftId: preview.draftId, owner: 'web:user', guildId,
    channel: { id: '1548161474227077214', guildId, isTextBased: () => true, send: async () => assert.fail('não deve enviar') } }), { statusCode: 400 });
  assert.equal((await service.recent(guildId)).length, 0);
});

test('workspace oferece sugestão de IA estruturada sem alterar ou publicar o editor', async t => {
  const ai = { generate: async input => {
    assert.equal(input.outputType, 'embed');
    return { title: 'Manutenção programada', description: 'A manutenção começa às 22h.', fields: [] };
  } };
  const service = new AnnouncementService(new JsonAnnouncementRepository(path.join(tempDirectory(t, 'announcement-workspace-'), 'announcements.json')), ai);
  const suggestion = await service.suggestWorkspace({ guildName: 'CYL', type: 'NOTICE', intent: 'Manutenção às 22h.', context: 'Tom direto.' });
  assert.deepEqual(suggestion, { type: 'NOTICE', title: 'Manutenção programada', content: 'A manutenção começa às 22h.' });
  assert.deepEqual(await service.recent(guildId), []);
});

test('workspace expõe somente destinos publicáveis e identifica canais da página da comunidade', () => {
  const permissions = { has: () => true };
  const client = { user: { id: 'bot' } };
  const guild = { channels: { cache: new Map([
    ['1555274685476896799', { id: '1555274685476896799', name: 'avisos', isTextBased: () => true, send() {}, permissionsFor: () => permissions }],
    ['1548161474227077213', { id: '1548161474227077213', name: 'interno', isTextBased: () => true, send() {}, permissionsFor: () => permissions }],
    ['1548161474227077214', { id: '1548161474227077214', name: 'sem-envio', isTextBased: () => true, send() {}, permissionsFor: () => ({ has: () => false }) }],
  ]) } };
  assert.deepEqual(sendableChannels(client, guild), [
    { id: '1555274685476896799', name: 'avisos', canPublish: true, communityVisible: true, type: 'NOTICE' },
  ]);
});
