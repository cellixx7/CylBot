// These are public navigation URLs, not credentials or a separate OAuth flow.
function discordUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['discord.com', 'discord.gg'].includes(url.hostname)
      && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

const environment = typeof import.meta.env === 'object' ? import.meta.env : {};

export const discordInstallUrl = discordUrl(environment.VITE_DISCORD_INSTALL_URL
  || 'https://discord.com/oauth2/authorize?client_id=1546366426216931439');
export const discordCommunityUrl = discordUrl(environment.VITE_DISCORD_COMMUNITY_URL)
  || 'https://discord.gg/aBUxPSJWhZ';
