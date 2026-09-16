const { logger } = require('../lib/logger');
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    logger.info('discord.ready', { module: 'ready', userId: client.user.id });
    client.presenceManager.start();

    try {
      const owner = await client.users.fetch('1051358891138629682');

      const startedAt = new Date();
      const unix = Math.floor(startedAt.getTime() / 1000);

      const time = startedAt.toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
      });

      const date = startedAt.toLocaleDateString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
      });

      const embed = new EmbedBuilder()
        .setTitle('🟢 BOT INICIADO')
        .setDescription(
          [
            `**Tempo ativo:** <t:${unix}:R>`,
            `**Iniciado às:** \`${time}\` - \`${date}\``,
          ].join('\n')
        )
        .setColor(0x2ecc71);

      await owner.send({ embeds: [embed] });

      logger.info('discord.startup_notification_sent', { module: 'ready', userId: owner.id });
    } catch (error) {
      logger.warn('discord.startup_notification_failed', { module: 'ready', error });
    }
  },
};