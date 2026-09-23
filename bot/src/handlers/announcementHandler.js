const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');
const { assertCanManageAnnouncements } = require('../services/announcementPermissions');
const row = (...components) => new ActionRowBuilder().addComponents(...components);
const button = (id, label, primary = false) => new ButtonBuilder().setCustomId(`ann:${id}`).setLabel(label).setStyle(primary ? ButtonStyle.Success : ButtonStyle.Secondary);
function categoryPicker(guildId, announcements) {
  return { content: 'Escolha uma categoria ou use Adicionar para criar uma categoria do servidor.', embeds: [], components: [
    row(new StringSelectMenuBuilder().setCustomId('ann:choose').setPlaceholder('Categoria do anúncio').addOptions(announcements.categories(guildId).map(c => ({ label: c.name, value: c.id })))),
    row(button('add', 'Adicionar')),
  ] };
}
function modal(id, title, fields) {
  return new ModalBuilder().setCustomId(`ann:${id}`).setTitle(title).addComponents(fields.map(([key, label, value, max, paragraph, required = true]) => {
    const input = new TextInputBuilder().setCustomId(key).setLabel(label).setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short).setMaxLength(max).setRequired(required);
    if (value) input.setValue(value);
    return row(input);
  }));
}
function preview(result) {
  return { content: 'Revise o anúncio antes de confirmar o envio.', embeds: [result.embed], components: [row(button(`send:${result.draftId}`, 'Confirmar envio', true), button(`context:${result.draftId}`, 'Adicionar Contexto'))] };
}
async function handleAnnouncementInteraction(i, announcements = i.client?.services.announcements) {
  if (!i.customId?.startsWith('ann:')) return false;
  try {
    if (!i.guildId) throw new Error('Use este comando em um servidor.');
    const [, action, id] = i.customId.split(':');
    const authorization = { member: i.member, permissions: i.memberPermissions };
    if (['add', 'edit', 'save'].includes(action)) assertCanManageAnnouncements(authorization);
    const category = () => {
      const c = announcements.categories(i.guildId).find(c => c.id === id);
      if (!c) throw new Error('Categoria não encontrada.');
      return c;
    };
    if (action === 'choose') {
      const c = announcements.categories(i.guildId).find(c => c.id === i.values[0]);
      if (!c) throw new Error('Categoria não encontrada.');
      await i.update({ content: `Categoria: **${c.name}**. Os padrões são compartilhados com o servidor.`, components: [row(button(`write:${c.id}`, 'Criar anúncio', true), button(`edit:${c.id}`, 'Editar padrão'), button('back', 'Categorias'))] });
    } else if (action === 'back') await i.update(categoryPicker(i.guildId, announcements));
    else if (action === 'add' || action === 'edit') {
      const c = action === 'edit' ? category() : {};
      await i.showModal(modal(`save:${c.id || 'new'}`, 'Padrão do servidor', [
        ['name', 'Nome da categoria', c.name, 100], ['title', 'Título do anúncio', c.title, 256],
        ['description', 'Descrição padrão (opcional)', c.description, 2000, true, false], ['image', 'URL HTTPS da imagem (opcional)', c.image, 1000, false, false],
      ]));
    } else if (action === 'save') {
      const input = Object.fromEntries(['name', 'title', 'description', 'image'].map(key => [key, i.fields.getTextInputValue(key)]));
      announcements.save(i.guildId, { ...input, id: id === 'new' ? undefined : id }, authorization);
      await i.reply({ ...categoryPicker(i.guildId, announcements), ephemeral: true });
    } else if (action === 'write') {
      const c = category();
      await i.showModal(modal(`generate:${id}`, 'Descrição do anúncio', [['description', 'O que deseja anunciar?', c.description, 2000, true]]));
    } else if (action === 'context') {
      announcements.get(id, i.user.id, i.guildId);
      await i.showModal(modal(`revise:${id}`, 'Adicionar Contexto', [['context', 'O que deseja acrescentar ou ajustar?', '', 2000, true]]));
    } else if (action === 'generate' || action === 'revise') {
      await i.deferReply({ ephemeral: true });
      const result = await announcements.generate({ guildId: i.guildId, guildName: i.guild.name, owner: i.user.id, channelId: i.channelId,
        ...(action === 'generate' ? { categoryId: id, description: i.fields.getTextInputValue('description') } : { draftId: id, context: i.fields.getTextInputValue('context') }) });
      await i.editReply(preview(result));
    } else if (action === 'send') {
      const channel = i.channel;
      if (!channel || channel.guildId !== i.guildId || !channel.isTextBased?.() || typeof channel.send !== 'function') {
        throw new Error('Escolha um canal de texto do servidor original.');
      }
      const permissions = i.member && channel.permissionsFor?.(i.member);
      const sendPermission = channel.isThread?.() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages;
      if (!permissions?.has(PermissionFlagsBits.ViewChannel) || !permissions.has(sendPermission)) {
        throw new Error('Você precisa ter acesso ao canal e permissão para enviar mensagens nele.');
      }
      await i.deferUpdate();
      await announcements.send(id, i.user.id, i.guildId, i.channel);
      await i.editReply({ content: '✓ Anúncio enviado.', embeds: [], components: [] });
    }
  } catch (error) {
    const payload = { content: error.message || 'Não foi possível concluir a operação.', ephemeral: true };
    if (i.deferred || i.replied) await i.followUp(payload); else await i.reply(payload);
  }
  return true;
}
module.exports = { categoryPicker, handleAnnouncementInteraction };
