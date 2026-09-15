const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { EmbedBuilder } = require('discord.js');
const OpenRouterService = require('./openRouterService');

const fail = (message) => Object.assign(new Error(message), { statusCode: 400 });
function text(value, max, required = false) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw fail('Preencha os campos respeitando os limites indicados.');
  return value.trim();
}
class AnnouncementService {
  constructor(file = path.join(__dirname, '../../data/announcements.json'), ai = new OpenRouterService()) {
    this.file = file;
    this.ai = ai;
    this.drafts = new Map();
  }
  read() {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  }
  categories(guildId) {
    return this.read()[guildId] || ['Aviso', 'Manutenção', 'Evento', 'Notificação'].map((name, i) => ({ id: `default-${i}`, name, title: name, description: '', image: '' }));
  }
  save(guildId, input) {
    const data = this.read();
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
    data[guildId] = categories;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(data, null, 2));
    fs.renameSync(temp, this.file);
    return category;
  }
  async generate({ guildId, guildName, owner, channelId, categoryId, description, draftId, context }) {
    let previous;
    if (draftId) previous = this.get(draftId, owner, guildId);
    if (previous?.busy) throw fail('Aguarde a operação atual.');
    const category = previous?.category || this.categories(guildId).find(c => c.id === categoryId);
    if (!category) throw fail('Categoria não encontrada.');
    const idea = previous?.idea || text(description || category.description, 2000, true);
    const extra = text(context || '', 2000);
    if (previous) previous.busy = true;
    try {
      const output = await this.ai.generate({ outputType: 'content', idea,
        originalContext: `Anúncio do servidor ${guildName}. Categoria: ${category.name}. Título: ${category.title}. Melhore a descrição com Markdown, preservando os fatos.\n${idea}`,
        currentText: previous?.embed.description || '', additionalContext: extra, targetCharacters: 1500 });
      const embed = new EmbedBuilder().setTitle(category.title).setDescription(output.content).setColor(0x176b57)
        .setFooter({ text: `${guildName} • ${new Date().toLocaleDateString('pt-BR', { timeZone: 'UTC' })}` });
      if (category.image) embed.setImage(category.image);
      embed.toJSON();
      for (const [id, draft] of this.drafts) if (draft.expires <= Date.now()) this.drafts.delete(id);
      const id = crypto.randomUUID();
      this.drafts.set(id, { owner, guildId, channelId: previous?.channelId || channelId, category: { ...category }, idea, embed: embed.toJSON(), expires: Date.now() + 15 * 60_000, busy: false });
      if (previous) this.drafts.delete(draftId);
      return { draftId: id, embed: embed.toJSON() };
    } finally { if (previous) previous.busy = false; }
  }
  get(id, owner, guildId) {
    const draft = this.drafts.get(id);
    if (!draft || draft.expires <= Date.now() || draft.owner !== owner || draft.guildId !== guildId) throw fail('Prévia expirada, substituída ou indisponível. Gere uma nova prévia.');
    return draft;
  }
  async send(id, owner, guildId, channel) {
    const draft = this.get(id, owner, guildId);
    if (draft.busy) throw fail('Aguarde a operação atual.');
    if (channel.guildId !== guildId || (draft.channelId && draft.channelId !== channel.id) || !channel.isTextBased() || !channel.send) throw fail('Escolha um canal de texto do servidor original.');
    draft.busy = true;
    try {
      await channel.send({ embeds: [draft.embed], allowedMentions: { parse: [] } });
      this.drafts.delete(id);
    } finally { draft.busy = false; }
  }
}
module.exports = { AnnouncementService, announcements: new AnnouncementService() };
