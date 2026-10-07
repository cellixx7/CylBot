const { PermissionsBitField, PermissionFlagsBits: P } = require('discord.js');
const { codedClientError } = require('../api/http/errors');
const { snowflake } = require('./planService');
const DEFAULT_PROFILE = Object.freeze({ bio: '', accent: '#7c5cff', theme: 'CLASSIC', visibility: 'COMMUNITY', links: [] });
const THEMES = Object.freeze([{ id: 'CLASSIC', name: 'Clássico', plus: false }, { id: 'AURORA', name: 'Aurora', plus: true }, { id: 'COSMIC', name: 'Cósmico', plus: true }]);
const BADGES = { PLUS: 'CYL Plus', COMMUNITY: 'CYL Comunidade', PARTNER: 'Parceiro CYL', CREATOR: 'Criador do CYL', STAFF: 'Equipe CYL' };
const invalid = message => codedClientError(400, 'INVALID_PROFILE', message);
function validateProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['bio','accent','theme','visibility','links'].includes(key))) throw invalid('Envie somente os campos editáveis do perfil.');
  if (typeof input.bio !== 'string' || input.bio.length > 500 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(input.bio)) throw invalid('A bio deve ter até 500 caracteres.');
  if (typeof input.accent !== 'string' || !/^#[0-9a-f]{6}$/i.test(input.accent)) throw invalid('Escolha uma cor hexadecimal válida.');
  if (!THEMES.some(theme => theme.id === input.theme) || !['PUBLIC','COMMUNITY','PRIVATE'].includes(input.visibility)) throw invalid('Escolha um tema e uma visibilidade válidos.');
  if (!Array.isArray(input.links) || input.links.length > 3) throw invalid('Adicione no máximo três links.');
  const links = input.links.map(link => {
    if (!link || Object.keys(link).some(key => !['label','url'].includes(key)) || typeof link.label !== 'string' || !link.label.trim() || link.label.length > 80 || typeof link.url !== 'string' || link.url.length > 2048) throw invalid('Cada link precisa de um título e uma URL HTTPS.');
    let url; try { url = new URL(link.url); } catch { throw invalid('Informe um endereço HTTPS válido.'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw invalid('Links devem usar HTTPS e não podem conter credenciais.');
    return { label: link.label.trim(), url: url.href };
  });
  return { bio: input.bio.trim(), accent: input.accent.toLowerCase(), theme: input.theme, visibility: input.visibility, links };
}
class ProfileService {
  constructor({ repository, users, plans, client }) { Object.assign(this, { repository, users, plans, client }); }
  async member(guildId, userId) {
    if (!this.client?.isReady?.()) throw codedClientError(503, 'DISCORD_NOT_READY', 'O CYL está conectando ao Discord.');
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) throw codedClientError(403, 'PROFILE_COMMUNITY_REQUIRED', 'Escolha uma comunidade compartilhada com o CYL.');
    let member;
    try { member = await guild.members.fetch({ user: userId, force: true }); }
    catch (error) {
      if ([10007, 50001, 50013].includes(Number(error.code))) throw codedClientError(403, 'PROFILE_COMMUNITY_REQUIRED', 'Este perfil não está disponível nesta comunidade.');
      throw codedClientError(503, 'PROFILE_COMMUNITY_UNAVAILABLE', 'Não foi possível verificar a comunidade no Discord. Tente novamente.');
    }
    if (!member || member.id !== userId) throw codedClientError(403, 'PROFILE_COMMUNITY_REQUIRED', 'Este perfil não está disponível nesta comunidade.');
    return { guild, member };
  }
  async get({ viewerId, userId = viewerId, guildId, identity }) {
    if (!snowflake(userId) || !snowflake(viewerId) || (guildId && !snowflake(guildId))) throw invalid('Informe IDs válidos de usuário e comunidade.');
    const own = viewerId === userId;
    const stored = await this.repository?.get(userId) || { ...DEFAULT_PROFILE, links: [] };
    if (!own && stored.visibility === 'PRIVATE') throw codedClientError(403, 'PROFILE_PRIVATE', 'Este perfil é privado.');
    if (!own && stored.visibility === 'COMMUNITY' && !guildId) throw codedClientError(403, 'PROFILE_COMMUNITY_REQUIRED', 'Este perfil está disponível somente nas comunidades compartilhadas.');
    let community = null; let memberIdentity = null;
    if (guildId) {
      const context = await this.member(guildId, userId);
      if (!own) await this.member(guildId, viewerId);
      let administrator = false;
      try { administrator = new PermissionsBitField(context.member.permissions?.bitfield ?? context.member.permissions).has(P.Administrator); } catch {}
      const discordUser = context.member.user;
      if (discordUser) memberIdentity = { username: discordUser.username, displayName: discordUser.globalName || discordUser.username, avatarUrl: discordUser.displayAvatarURL?.({ size: 128 }) || null };
      const owner = context.guild.ownerId === userId;
      community = { id: guildId, name: context.guild.name, role: owner ? 'OWNER' : administrator ? 'ADMIN' : 'MEMBER',
        roleName: owner ? 'Dono do servidor' : administrator ? 'Administrador' : 'Membro', canManage: own && (owner || administrator) };
    }
    const account = identity && own ? identity : (await this.users?.getByDiscordId(userId)) || memberIdentity;
    if (!account) throw codedClientError(404, 'PROFILE_NOT_FOUND', 'Este usuário ainda não criou um perfil CYL.');
    const subscriptions = (await this.plans.personal(userId)).subscriptions;
    const hasPlus = subscriptions.some(s => s.plan === 'PLUS');
    const official = await this.repository?.badges(userId) || [];
    const badgeIds = [...new Set([...subscriptions.map(s => s.plan), ...official])].filter(id => BADGES[id]);
    return { user: { id: userId, username: account.username, displayName: account.displayName, avatarUrl: account.avatarUrl || null },
      profile: { ...stored, theme: hasPlus ? stored.theme : 'CLASSIC' },
      badges: badgeIds.map(id => ({ id, label: BADGES[id], verified: true })), community,
      canEdit: own, hasPlus, themes: THEMES };
  }
  async update(userId, patch) {
    if (!snowflake(userId)) throw invalid('Informe um ID de usuário válido.');
    if (!this.repository) throw codedClientError(503, 'PROFILE_STORAGE_UNAVAILABLE', 'A edição de perfis precisa do banco de dados ativo.');
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(key => !['bio','accent','theme','visibility','links'].includes(key))) throw invalid('Envie somente os campos editáveis do perfil.');
    const previous = await this.repository.get(userId) || { ...DEFAULT_PROFILE, links: [] };
    const value = validateProfile({ ...previous, ...patch });
    const hasPlus = (await this.plans.personal(userId)).subscriptions.some(s => s.plan === 'PLUS');
    if (!hasPlus && patch.theme && patch.theme !== 'CLASSIC') throw codedClientError(403, 'PROFILE_PLUS_REQUIRED', 'Os temas Aurora e Cósmico fazem parte do CYL Plus.');
    if (!hasPlus) value.theme = 'CLASSIC';
    await this.repository.save(userId, value); return value;
  }
}
module.exports = { ProfileService, DEFAULT_PROFILE, THEMES, validateProfile };
