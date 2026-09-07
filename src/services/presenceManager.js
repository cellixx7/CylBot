const { ActivityType } = require('discord.js');
const presenceConfig = require('../config/presence');

const staticActivities = [
  { type: ActivityType.Streaming, name: 'twitch.tv/cellixx7', url: 'https://twitch.tv/cellixx7' },
  { type: ActivityType.Watching, name: 'Instagram.com/imcylex7' },
  { type: ActivityType.Watching, name: 'github.com/cellixx7' },
  { type: ActivityType.Listening, name: 'linkedin.com/in/cellixx7' },
];

class PresenceManager {
  constructor(client) {
    this.client = client;
    this.activityIndex = 0;
    this.interval = null;
    this.spotifyAccessToken = null;
    this.spotifyAccessTokenExpiresAt = 0;
  }

  start() {
    this.update();
    this.interval = setInterval(() => this.update(), presenceConfig.updateIntervalMs);
    this.interval.unref();
  }

  async update() {
    try {
      const voiceActivity = this.getVoiceActivity();

      if (voiceActivity) {
        this.setActivity(voiceActivity);
        return;
      }

      let spotifyActivity = null;

      try {
        spotifyActivity = await this.getSpotifyActivity();
      } catch (error) {
        console.error('Spotify indisponível; continuando a rotação fixa:', error.message);
      }

      if (spotifyActivity) {
        this.setActivity(spotifyActivity);
        return;
      }

      const staticActivity = staticActivities[this.activityIndex];
      this.setActivity(staticActivity);
      console.log(`Rich presence atualizada: ${staticActivity.name}`);
      this.activityIndex = (this.activityIndex + 1) % staticActivities.length;
    } catch (error) {
      console.error('Não foi possível atualizar a presença:', error);
    }
  }

  getVoiceActivity() {
    const guild = this.client.guilds.cache.get(presenceConfig.guildId);
    const channel = guild?.channels.cache.get(presenceConfig.voiceChannelId);

    if (!channel?.isVoiceBased()) {
      return null;
    }

    const peopleInCall = channel.members.filter((member) => !member.user.bot).size;

    if (peopleInCall <= 1) {
      return null;
    }

    return {
      type: ActivityType.Watching,
      name: `${peopleInCall} pessoas na call da clínica`,
    };
  }

  async getSpotifyActivity() {
    const {
      clientId,
      clientSecret,
      refreshToken,
      playlistId,
    } = presenceConfig.spotify;

    if (!clientId || !clientSecret || !refreshToken || !playlistId) {
      return null;
    }

    const accessToken = await this.getSpotifyAccessToken();
    const response = await fetch('https://api.spotify.com/v1/me/player', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 204 || response.status === 202) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Spotify respondeu com HTTP ${response.status}.`);
    }

    const player = await response.json();

    if (
      !player.is_playing
      || !player.item?.name
      || player.context?.type !== 'playlist'
      || this.getSpotifyResourceId(player.context.uri) !== this.getSpotifyResourceId(playlistId)
    ) {
      return null;
    }

    const artists = player.item.artists.map((artist) => artist.name).join(', ');

    return {
      type: ActivityType.Listening,
      name: `${player.item.name} - ${artists}`,
    };
  }

  getSpotifyResourceId(value) {
    if (!value) {
      return null;
    }

    const resource = value.trim();
    const match = resource.match(/(?:spotify:playlist:|[/?]playlist[/?])([^/?#?]+)/i);

    return match ? match[1] : resource;
  }

  async getSpotifyAccessToken() {
    if (this.spotifyAccessToken && Date.now() < this.spotifyAccessTokenExpiresAt) {
      return this.spotifyAccessToken;
    }

    const { clientId, clientSecret, refreshToken } = presenceConfig.spotify;
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`Spotify não renovou o token (HTTP ${response.status}).`);
    }

    const token = await response.json();
    this.spotifyAccessToken = token.access_token;
    this.spotifyAccessTokenExpiresAt = Date.now() + (token.expires_in - 60) * 1000;

    return this.spotifyAccessToken;
  }

  setActivity(activity) {
    this.client.user.setPresence({
      activities: [{
        name: activity.name,
        type: activity.type,
        ...(activity.url ? { url: activity.url } : {}),
      }],
      status: 'online',
    });
  }
}

module.exports = PresenceManager;