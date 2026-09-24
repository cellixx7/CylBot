module.exports = {
  name: 'messageUpdate',
  async execute(oldMessage, newMessage, client) {
    let message = newMessage;
    if (message.partial) {
      try {
        message = await message.fetch();
      } catch {
        return;
      }
    }
    if (!message.guildId || message.author?.bot || message.webhookId || message.system ||
      !message.id || !message.channelId || !message.author?.id) return;
    return client.services.ticketMessageInbound.handleUpdate({
      guildId: message.guildId,
      channelId: message.channelId,
      messageId: message.id,
      userId: message.author.id,
      content: message.content,
      editedAt: message.editedTimestamp,
    });
  },
};
