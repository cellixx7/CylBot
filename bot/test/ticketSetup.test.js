require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ticketFixture, ids } = require('./helpers/ticketFixture');
const { TicketSetupService } = require('../src/services/ticketSetupService');
const { PermissionFlagsBits: P } = require('discord.js');
async function wizard(f, mode = 'auto') {
  const input = { guildId: ids.guild, userId: ids.admin };
  const session = await f.setup.begin(input);
  const base = { ...input, sessionId: session.id };
  const change = (action, values) => f.setup.change({ ...base, action, values });
  await change('start'); await change('role', [ids.role]); await change(mode);
  if (mode === 'existing') {
    await change('panel', [ids.panel]); await change('log', [ids.log]); await change('category', [ids.category]);
    await f.setup.change({ ...base, action: 'custom', categories: 'Ajuda | Suporte geral\nPagamento | Financeiro' });
  } else await change('defaults');
  return base;
}

test('setup exige ManageGuild/Administrator, impede outro dono/guild e expira', async t => {
  const f = ticketFixture(t, { configured: false });
  await assert.rejects(f.setup.begin({ guildId: ids.guild, userId: ids.user }), { statusCode: 403 });
  f.actors.get(ids.admin).permissions = P.Administrator.toString();
  const session = await f.setup.begin({ guildId: ids.guild, userId: ids.admin });
  await assert.rejects(f.setup.session({ guildId: ids.guild, userId: ids.staff, sessionId: session.id }), { statusCode: 403 });
  await assert.rejects(f.setup.session({ guildId: ids.otherGuild, userId: ids.admin, sessionId: session.id }));
  f.advance(15 * 60_000);
  await assert.rejects(f.setup.session({ guildId: ids.guild, userId: ids.admin, sessionId: session.id }), /expirada/);
});

for (const mode of ['auto', 'existing']) {
  test(`wizard ${mode} valida etapas, publica painel e persiste configuração`, async t => {
    const f = ticketFixture(t, { configured: false });
    const input = await wizard(f, mode);
    const config = await f.setup.confirm(input);
    assert.equal(config.ready, true);
    assert.equal(config.mode, mode);
    assert.deepEqual(config.supportRoleIds, [ids.role]);
    assert.equal(config.panelChannelId, ids.panel);
    assert.equal(config.logChannelId, ids.log);
    assert.equal(config.activeCategoryId, ids.category);
    assert.equal(config.categories.length, mode === 'auto' ? 4 : 2);
    assert.equal(f.configs.get(ids.guild).panelMessageId, 'panel-message');
    assert(f.calls.includes(mode));
    await assert.rejects(f.setup.begin({ guildId: ids.guild, userId: ids.admin }), /já configurados/);
  });
}

test('wizard rejeita replay de etapas, @everyone, categorias duplicadas e confirmação antecipada', async t => {
  const f = ticketFixture(t, { configured: false });
  const session = await f.setup.begin({ guildId: ids.guild, userId: ids.admin });
  const base = { guildId: ids.guild, userId: ids.admin, sessionId: session.id };
  await assert.rejects(f.setup.confirm(base), /Conclua/);
  await f.setup.change({ ...base, action: 'start' });
  await assert.rejects(f.setup.change({ ...base, action: 'start' }), /Etapa inválida/);
  await assert.rejects(f.setup.change({ ...base, action: 'role', values: [ids.guild] }), /cargo/);
  await f.setup.change({ ...base, action: 'role', values: [ids.role] });
  await f.setup.change({ ...base, action: 'auto' });
  for (const categories of ['', 'A\na', 'A | B | C', 'x'.repeat(81), Array(6).fill('categoria').join('\n')]) {
    await assert.rejects(f.setup.change({ ...base, action: 'custom', categories }));
  }
  assert.equal((await f.setup.session(base)).step, 'categories');
  await f.setup.change({ ...base, action: 'cancel' });
  await assert.rejects(f.setup.session(base));
});

test('setup interrompido retoma configuração persistida após reinício e não recria estrutura', async t => {
  const f = ticketFixture(t, { configured: false });
  const input = await wizard(f);
  const publish = f.adapter.publishPanel;
  f.adapter.publishPanel = async () => { throw new Error('Falha de rede'); };
  await assert.rejects(f.setup.confirm(input));
  assert.equal(f.configs.get(ids.guild).ready, false);
  assert.equal(f.configs.get(ids.guild).panelChannelId, ids.panel);
  f.adapter.publishPanel = publish;
  const setup = new TicketSetupService({ repository: f.configs, adapter: f.adapter, permissions: f.permissions, now: f.now });
  const session = await setup.begin({ guildId: ids.guild, userId: ids.admin });
  assert.equal(session.step, 'confirm');
  const result = await setup.confirm({ guildId: ids.guild, userId: ids.admin, sessionId: session.id });
  assert.equal(result.ready, true);
  assert.equal(result.panelChannelId, ids.panel);
});

test('setup revalida permissão na confirmação e só um administrador publica', async t => {
  const f = ticketFixture(t, { configured: false }); const input = await wizard(f);
  f.actors.get(ids.admin).permissions = '0';
  await assert.rejects(f.setup.confirm(input), { statusCode: 403 });
  assert.equal(f.configs.get(ids.guild), null);
  f.actors.get(ids.admin).permissions = P.ManageGuild.toString();
  const results = await Promise.allSettled([f.setup.confirm(input), f.setup.confirm(input)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(f.calls.filter(call => call === 'panel').length, 1);
});
