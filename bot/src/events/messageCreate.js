module.exports = {
  name: 'messageCreate',
  execute(message, client) {
    if (!message.guildId || message.author.bot || message.webhookId || message.system) return;
    return client.services.ticketMessageInbound.handle({ guildId: message.guildId, channelId: message.channelId,
      messageId: message.id, userId: message.author.id, bot: message.author.bot, content: message.content,
      createdAt: message.createdAt,
      authorAvatarUrl: message.member?.displayAvatarURL?.({ extension: 'png', size: 64 }) || message.author.displayAvatarURL?.({ extension: 'png', size: 64 }) || null });
  },
};
