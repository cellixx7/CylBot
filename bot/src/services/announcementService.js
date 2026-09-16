const { logger } = require('../lib/logger');
const { getConfig } = require('../config/env');
const { JsonAnnouncementRepository } = require('../repositories/jsonAnnouncementRepository');
const crypto = require('node:crypto');
const { EmbedBuilder } = require('discord.js');
const OpenRouterService = require('./openRouterService');
const { AnnouncementDraftManager } = require('./announcementDraftManager');
const { assertCanManageAnnouncements } = require('./announcementPermissions');

const fail = (message) => Object.assign(new Error(message), { statusCode: 400 });
function text(value, max, required = false) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw fail('Preencha os campos respeitando os limites indicados.');
  return value.trim();
}
function buildAnnouncementEmbed(category, description, guildName) {
  const embed = new EmbedBuilder().setTitle(category.title).setDescription(description).setColor(0x176b57)
    .setFooter({ text: `${guildName} • ${new Date().toLocaleDateString('pt-BR', { timeZone: 'UTC' })}` });
  if (category.image) embed.setImage(category.image);
  return embed.toJSON();
}

class AnnouncementService {
  constructor(repository, ai = new OpenRouterService(getConfig().openRouter), draftManager = new AnnouncementDraftManager()) {
    this.repository = repository;
    this.ai = ai;
    this.draftManager = draftManager;
  }
  categories(guildId) {
    return this.repository.getCategories(guildId) || ['Aviso', 'Manutenção', 'Evento', 'Notificação'].map((name, i) => ({ id: `default-${i}`, name, title: name, description: '', image: '' }));
  }
  save(guildId, input, context) {
    assertCanManageAnnouncements(context);
    const categories = this.categories(guildId);
    const category = {
      id: input.id || crypto.randomUUID(), name: text(input.name, 100, true),
      title: text(input.title, 256, true), description: text(input.description || '', 2000), image: text(input.image || '', 1000),
    };
    if (category.image) {
      let url;
      try { url = new URL(category.image); } catch { throw fail('Informe uma URL de imagem válida.'); }
      if (url.protocol !== 'https:') throw fail('A imagem deve usar uma URL HTTPS.');
    }
    const index = categories.findIndex(c => c.id === category.id);
    if (input.id && index < 0) throw fail('Categoria não encontrada.');
    if (categories.some(c => c.id !== category.id && c.name.toLocaleLowerCase() === category.name.toLocaleLowerCase())) throw fail('Já existe uma categoria com esse nome.');
    if (index < 0 && categories.length >= 25) throw fail('O servidor já possui 25 categorias.');
    if (index < 0) categories.push(category); else categories[index] = category;
    this.repository.saveCategories(guildId, categories);
    return category;
  }
  async generate({ guildId, guildName, owner, channelId, categoryId, description, draftId, context }) {
    let previous;
    if (draftId) previous = this.get(draftId, owner, guildId);
    if (previous) this.draftManager.assertAvailable(previous);
    const category = previous?.category || this.categories(guildId).find(c => c.id === categoryId);
    if (!category) throw fail('Categoria não encontrada.');
    const idea = previous?.idea || text(description || category.description, 2000, true);
    const extra = text(context || '', 2000);
    if (previous) this.draftManager.markBusy(previous);
    try {
      const output = await this.ai.generate({ outputType: 'content', idea,
        originalContext: `Anúncio do servidor ${guildName}. Categoria: ${category.name}. Título: ${category.title}. Melhore a descrição com Markdown, preservando os fatos.\n${idea}`,
        currentText: previous?.embed.description || '', additionalContext: extra, targetCharacters: 1500 });
      const embed = buildAnnouncementEmbed(category, output.content, guildName);
      const data = { owner, guildId, channelId: previous?.channelId || channelId, category: { ...category }, idea, embed: { ...embed } };
      const id = previous ? this.draftManager.replace(draftId, data) : this.draftManager.create(data);
      return { draftId: id, embed };
    } finally { if (previous) this.draftManager.release(previous); }
  }
  get(id, owner, guildId) {
    return this.draftManager.get(id, owner, guildId);
  }

  async send(id, owner, guildId, channel) {
    const draft = this.get(id, owner, guildId);
    this.draftManager.assertAvailable(draft);
    if (!channel || channel.guildId !== guildId || (draft.channelId && draft.channelId !== channel.id) || !channel.isTextBased?.() || typeof channel.send !== 'function') throw fail('Escolha um canal de texto do servidor original.');
    this.draftManager.markBusy(draft);
    try {
      await channel.send({ embeds: [draft.embed], allowedMentions: { parse: [] } });
      this.draftManager.remove(id);
      logger.info('announcement.sent', { module: 'announcementService', operation: 'announcement.send', guildId, channelId: channel.id, userId: owner });
    } finally { this.draftManager.release(draft); }
  }
}
module.exports = { AnnouncementService, announcements: new AnnouncementService(new JsonAnnouncementRepository()) };
