const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    console.log(`Bot conectado como ${client.user.tag}.`);
    client.presenceManager.start();

    try {
      const owner = await client.users.fetch('1051358891138629682');

      const startedAt = new Date(Date.now() - client.uptime);

      const uptime = formatUptime(client.uptime);

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
            `**Tempo ativo:** \`${uptime}\``,
            `**Iniciado às:** \`${time}\` - \`${date}\``,
          ].join('\n')
        )
        .setColor(0x2ecc71)
        .setTimestamp();

      await owner.send({ embeds: [embed] });

      console.log('Mensagem de inicialização enviada ao proprietário.');
    } catch (error) {
      console.error(
        'Não foi possível enviar a mensagem de inicialização:',
        error
      );
    }
  },
};

function formatUptime(ms) {
  const totalSeconds = Math.floor(ms / 1000);

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];

  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);

  parts.push(`${seconds}s`);

  return parts.join(' ');
}