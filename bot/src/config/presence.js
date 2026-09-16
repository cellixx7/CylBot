const { getConfig } = require('./env');

const presenceConfig = {
  ownerId: '1051358891138629682',
  guildId: '1227405988135567370',
  voiceChannelId: '1548161477268217988',
  updateIntervalMs: 10_000,
  spotify: getConfig().spotify,
};

module.exports = presenceConfig;