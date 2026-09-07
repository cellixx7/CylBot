const { EmbedBuilder } = require('discord.js');
const presenceConfig = require('../config/presence');

class CallSenseManager {
  constructor(client) {
    this.client = client;
    this.active = false;
    this.knownUserIds = new Set();
  }

  activate() {
    const guild = this.client.guilds.cache.get(presenceConfig.guildId);
    const channel = guild?.channels.cache.get(presenceConfig.voiceChannelId);

    this.knownUserIds = new Set(
      channel?.members
        .filter((member) => !member.user.bot)
        .map((member) => member.id) ?? [],
    );
    this.active = true;

    return this.knownUserIds.size;
  }

  async handleVoiceStateUpdate(oldState, newState) {
    if (!this.active || newState.member?.user.bot) {
      return;
    }

    const enteredTargetChannel =
      newState.channelId === presenceConfig.voiceChannelId
      && oldState.channelId !== presenceConfig.voiceChannelId;

    if (!enteredTargetChannel) {
      if (oldState.channelId === presenceConfig.voiceChannelId) {
        this.knownUserIds.delete(newState.id);
      }
      return;
    }

    if (this.knownUserIds.has(newState.id)) {
      return;
    }

    this.knownUserIds.add(newState.id);
    await this.notifyOwner(newState.member);
  }

  async notifyOwner(member) {
    try {
      const owner = await this.client.users.fetch(presenceConfig.ownerId);
      const enteredAt = Math.floor(Date.now() / 1000);
      const channelUrl = `https://discord.com/channels/${presenceConfig.guildId}/${presenceConfig.voiceChannelId}`;
      const embed = new EmbedBuilder()
        .setTitle(`# ${member.displayName} entrou na call`)
        .setDescription(
          [
            `O usuário **${member.displayName}** entrou na call de resenha. [Entre agora mesmo aqui!](${channelUrl})`,
            `Usuário entrou às <t:${enteredAt}:T> | <t:${enteredAt}:R>`,
          ].join('\n\n'),
        )
        .setColor(0x5865f2)
        .setThumbnail(member.displayAvatarURL())
        .setTimestamp();

      await owner.send({ embeds: [embed] });
    } catch (error) {
      console.error('Não foi possível enviar a notificação de entrada na call:', error);
    }
  }
}

module.exports = CallSenseManager;