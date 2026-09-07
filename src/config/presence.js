const presenceConfig = {
  guildId: '1227405988135567370',
  voiceChannelId: '1227405988135567374',
  updateIntervalMs: 15_000,
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    refreshToken: process.env.SPOTIFY_REFRESH_TOKEN,
    playlistId: process.env.SPOTIFY_PLAYLIST_ID,
  },
};

module.exports = presenceConfig;