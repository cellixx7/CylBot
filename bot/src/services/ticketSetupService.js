const { randomUUID } = require('node:crypto');
const { clientError } = require('../api/http/errors');
const { logger } = require('../lib/logger');
const { DEFAULT_CATEGORIES } = require('./ticketConstants');
const { TICKET_PERMISSION } = require('./ticketPermissionService');

class TicketSetupService {
  constructor({ repository, permissions, adapter, now = Date.now }) {
    Object.assign(this, { repository, permissions, adapter, now });
    this.sessions = new Map();
    this.busy = new Set();
  }
  async begin({ guildId, userId }) {
    await this.permissions.requireAction(TICKET_PERMISSION.CONFIGURE, guildId, userId);
    const existing = await this.repository.get(guildId);
    if (existing?.ready) throw clientError(409, 'Tickets já configurados neste servidor. O painel existente continua ativo.');
    for (const [id, session] of this.sessions) if (session.expiresAt <= this.now() || (session.guildId === guildId && session.userId === userId)) this.sessions.delete(id);
    if (this.sessions.size >= 1000) throw clientError(429, 'Muitas configurações em andamento. Tente novamente mais tarde.');
    const session = { id: randomUUID(), guildId, userId, expiresAt: this.now() + 15 * 60_000,
      step: existing ? 'confirm' : 'start', mode: 'auto', supportRoleIds: [], categories: structuredClone(DEFAULT_CATEGORIES), ...existing };
    this.sessions.set(session.id, session);
    logger.info('ticket.setup_started', { guildId, userId });
    return structuredClone(session);
  }
  async session({ guildId, userId, sessionId }, internal = false) {
    await this.permissions.requireAction(TICKET_PERMISSION.CONFIGURE, guildId, userId);
    const session = this.sessions.get(sessionId);
    if (!session || session.guildId !== guildId || session.userId !== userId || session.expiresAt <= this.now()) throw clientError(400, 'Configuração expirada ou de outro usuário. Execute /ticket novamente.');
    if (!internal && this.busy.has(guildId)) throw clientError(409, 'A configuração está sendo publicada. Aguarde.');
    return session;
  }
  async change(input) {
    const session = await this.session(input);
    const { action, values = [] } = input;
    if (action === 'cancel') { this.sessions.delete(session.id); return null; }
    if (await this.repository.get(input.guildId)) throw clientError(409, 'Existe uma publicação pendente. Confirme para retomar a configuração salva.');
    const next = structuredClone(session);
    if (action === 'start' && session.step === 'start') next.step = 'role';
    else if (action === 'role' && session.step === 'role') {
      if (values.length !== 1 || !/^\d{17,20}$/.test(values[0]) || values[0] === input.guildId) throw clientError(400, 'Selecione um cargo de suporte válido, diferente de @everyone.');
      next.supportRoleIds = values; next.step = 'structure';
    } else if (action === 'auto' && session.step === 'structure') { next.mode = 'auto'; next.step = 'categories'; }
    else if (action === 'existing' && session.step === 'structure') { next.mode = 'existing'; next.step = 'panel'; }
    else if (['panel', 'log', 'category'].includes(action) && session.step === action) {
      if (values.length !== 1 || !/^\d{17,20}$/.test(values[0])) throw clientError(400, 'Selecione um canal válido.');
      const keys = { panel: 'panelChannelId', log: 'logChannelId', category: 'activeCategoryId' };
      next[keys[action]] = values[0]; next.step = { panel: 'log', log: 'category', category: 'categories' }[action];
    } else if (action === 'defaults' && session.step === 'categories') next.step = 'confirm';
    else if (action === 'custom' && session.step === 'categories') {
      const lines = String(input.categories || '').trim().split('\n').filter(line => line.trim());
      if (!lines.length || lines.length > 5) throw clientError(400, 'Informe de uma a cinco categorias, uma por linha.');
      next.categories = lines.map((line, index) => {
        const [name, description = 'Atendimento da equipe.', ...extra] = line.split('|').map(value => value.trim());
        if (!name || name.length > 80 || description.length > 100 || extra.length) throw clientError(400, 'Use Nome (até 80 caracteres) | Descrição (até 100).');
        return { id: `category-${index + 1}`, name, description };
      });
      if (new Set(next.categories.map(c => c.name.toLocaleLowerCase())).size !== next.categories.length) throw clientError(400, 'Os nomes das categorias devem ser diferentes.');
      next.step = 'confirm';
    } else throw clientError(400, 'Etapa inválida. Use os controles da configuração atual.');
    this.sessions.set(next.id, next);
    return structuredClone(next);
  }
  async confirm(input) {
    if (this.busy.has(input.guildId)) throw clientError(409, 'A configuração está sendo publicada. Aguarde.');
    this.busy.add(input.guildId);
    try {
      const session = await this.session(input, true);
      if (session.step !== 'confirm') throw clientError(400, 'Conclua as etapas da configuração.');
      if ((await this.repository.get(input.guildId))?.ready) throw clientError(409, 'Tickets já configurados neste servidor.');
      let config = await this.repository.get(input.guildId) || {
        guildId: session.guildId, setupId: session.id, mode: session.mode,
        supportRoleIds: session.supportRoleIds, categories: session.categories,
        panelChannelId: session.panelChannelId || null, logChannelId: session.logChannelId || null,
        activeCategoryId: session.activeCategoryId || null, publicCategoryId: null,
        panelMessageId: null, ready: false, createdBy: input.userId, createdAt: this.now(),
      };
      await this.adapter.validateSetup(config);
      await this.repository.save(config);
      config = await this.adapter.ensureStructure(config, updated => this.repository.save(updated));
      // Revalida a autoridade após as operações assíncronas de provisionamento.
      await this.permissions.requireAction(TICKET_PERMISSION.CONFIGURE, input.guildId, input.userId);
      await this.adapter.validateStructure(config);
      if (!config.panelMessageId) {
        config.panelMessageId = await this.adapter.publishPanel(config);
        await this.repository.save(config);
      }
      config.ready = true;
      await this.repository.save(config);
      this.sessions.delete(session.id);
      logger.info('ticket.setup_completed', { guildId: input.guildId, userId: input.userId });
      return config;
    } finally { this.busy.delete(input.guildId); }
  }
}
module.exports = { TicketSetupService };
