const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, escapeMarkdown } = require('discord.js');
const row = (...components) => new ActionRowBuilder().addComponents(...components);
const button = (action, id, label) => new ButtonBuilder().setCustomId(`profile:${action}:${id}`).setLabel(label).setStyle(ButtonStyle.Secondary);
const identity = user => ({ id: user.id, username: user.username, displayName: user.globalName || user.username, avatarUrl: user.displayAvatarURL({ size: 128 }) });
const visibilityName = value => ({ PUBLIC: 'Público', COMMUNITY: 'Comunidades compartilhadas', PRIVATE: 'Somente eu' })[value];
function profileCard(data, webOrigin, guildId) {
  const { user, profile, community } = data;
  const embed = new EmbedBuilder().setColor(profile.accent).setTitle(`${user.displayName} · Perfil CYL`)
    .setDescription(escapeMarkdown(profile.bio || 'Adicione uma bio para se apresentar.'))
    .addFields({ name: 'Selos verificados', value: data.badges.map(b => b.label).join(' · ') || 'Membro CYL' });
  if (user.avatarUrl) embed.setThumbnail(user.avatarUrl);
  if (community) embed.addFields({ name: community.name, value: community.roleName });
  if (profile.links.length) embed.addFields({ name: 'Links', value: profile.links.map(link => `${escapeMarkdown(link.label)}: <${link.url}>`).join('\n').slice(0, 1024) });
  embed.setFooter({ text: `${visibilityName(profile.visibility)} · ${data.themes.find(t => t.id === profile.theme)?.name || 'Clássico'}` });
  const url = new URL(webOrigin); url.hash = `${data.canEdit ? '/profile' : `/profile/${user.id}`}${guildId ? `?guildId=${guildId}` : ''}`;
  const web = new ButtonBuilder().setLabel('Abrir na web').setStyle(ButtonStyle.Link).setURL(url.href);
  return { embeds: [embed], content: '', allowedMentions: { parse: [] }, components: [data.canEdit
    ? row(button('edit', user.id, 'Editar'), button('appearance', user.id, 'Aparência'), button('privacy', user.id, 'Privacidade'), button('community', user.id, 'Minha comunidade'), web)
    : row(web)] };
}
function modal(action, userId, title, fields) {
  return new ModalBuilder().setCustomId(`profile:${action}:${userId}`).setTitle(title).addComponents(fields.map(([id, label, value, limit, paragraph, required = false]) => {
    const input = new TextInputBuilder().setCustomId(id).setLabel(label).setMaxLength(limit).setRequired(required).setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short);
    if (value) input.setValue(value); return row(input);
  }));
}
async function handleProfileInteraction(i, services) {
  if (!i.customId?.startsWith('profile:')) return false;
  try {
    const [, action, userId, extra] = i.customId.split(':');
    if (extra || userId !== i.user.id) { await i.reply({ content: 'Você pode editar somente o seu próprio perfil.', ephemeral: true }); return true; }
    const profiles = services.profiles;
    const current = () => profiles.get({ viewerId: i.user.id, guildId: i.guildId || undefined, identity: identity(i.user) });
    if (action === 'edit') {
      const data = await current(); const link = data.profile.links[0];
      await i.showModal(modal('save', userId, 'Editar perfil CYL', [['bio','Sua bio', data.profile.bio,500,true], ['link_label','Título do link principal',link?.label,80], ['link_url','URL HTTPS do link principal',link?.url,2048]]));
    } else if (action === 'color') {
      const data = await current(); await i.showModal(modal('savecolor', userId, 'Cor do seu perfil', [['accent','Cor hexadecimal, exemplo: #7c5cff',data.profile.accent,7,false,true]]));
    } else if (action === 'appearance' || action === 'privacy') {
      await i.deferReply({ ephemeral: true }); const data = await current();
      const options = action === 'appearance' ? data.themes.map(t => ({ label: `${t.name}${t.plus ? ' · CYL Plus' : ''}`, value: t.id, default: t.id === data.profile.theme }))
        : ['PUBLIC','COMMUNITY','PRIVATE'].map(value => ({ label: visibilityName(value), value, default: value === data.profile.visibility }));
      const select = new StringSelectMenuBuilder().setCustomId(`profile:${action === 'appearance' ? 'theme' : 'visibility'}:${userId}`).setPlaceholder(action === 'appearance' ? 'Escolha um tema' : 'Quem pode ver seu perfil?').addOptions(options);
      await i.editReply({ content: action === 'appearance' ? 'Personalize seu cartão. Aurora e Cósmico são temas CYL Plus; a cor está disponível para todos.' : 'Escolha quem pode consultar sua bio e seus links.', components: [row(select), ...(action === 'appearance' ? [row(button('color', userId, 'Alterar cor'))] : [])] });
    } else if (['save','savecolor','theme','visibility'].includes(action)) {
      await i.deferReply({ ephemeral: true });
      const data = await current(); let patch;
      if (action === 'save') {
        const label = i.fields.getTextInputValue('link_label').trim(), url = i.fields.getTextInputValue('link_url').trim();
        patch = { bio: i.fields.getTextInputValue('bio'), links: [...(label || url ? [{ label, url }] : []), ...data.profile.links.slice(1)] };
      } else patch = action === 'savecolor' ? { accent: i.fields.getTextInputValue('accent') } : { [action === 'theme' ? 'theme' : 'visibility']: i.values[0] };
      await profiles.update(userId, patch); await i.editReply(profileCard(await current(), services.auth.config.webOrigin, i.guildId));
    } else if (action === 'community') {
      await i.deferReply({ ephemeral: true });
      if (!i.guildId) await i.editReply({ content: 'Use o perfil dentro de um servidor para ver sua função na comunidade.' });
      else await i.editReply(profileCard(await current(), services.auth.config.webOrigin, i.guildId));
    } else await i.reply({ content: 'Esta ação de perfil não está disponível.', ephemeral: true });
  } catch (error) {
    const payload = { content: error.statusCode ? error.message : 'Não foi possível atualizar o perfil. Tente novamente.', components: [], embeds: [], allowedMentions: { parse: [] } };
    if (i.deferred) await i.editReply(payload); else if (i.replied) await i.followUp({ ...payload, ephemeral: true }); else await i.reply({ ...payload, ephemeral: true });
  }
  return true;
}
module.exports = { handleProfileInteraction, profileCard, identity };
