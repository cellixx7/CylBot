const { clientError } = require('../api/http/errors');

class DiscordOAuthProvider {
  constructor(config, fetchImpl = fetch) {
    this.config = config;
    this.fetch = fetchImpl;
  }

  authorizationUrl(state) {
    const url = new URL('https://discord.com/oauth2/authorize');
    url.search = new URLSearchParams({ client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri, response_type: 'code', scope: 'identify guilds', state });
    return url.toString();
  }

  async request(url, options, { reloginOnAuthFailure = false } = {}) {
    let status;
    try {
      const response = await this.fetch(url, { ...options,
        headers: { 'User-Agent': 'DiscordBot (https://github.com/cellixx7/CylBot, 1.0.0)', ...options.headers },
        redirect: 'error', signal: AbortSignal.timeout(10000) });
      status = response.status;
      if (!response.ok) throw new Error();
      return await response.json();
    } catch {
      // Não propaga mensagens, headers ou bodies externos que podem conter tokens/code.
      if (reloginOnAuthFailure && (status === 401 || status === 403)) {
        throw clientError(401, 'AUTH_RELOGIN_REQUIRED');
      }
      throw clientError(502, 'Não foi possível autenticar com o Discord. Tente novamente.');
    }
  }

  async getCurrentUserGuilds(accessToken) {
    // Discord retorna até 200 guilds, limite atual de participação por usuário.
    const guilds = await this.request('https://discord.com/api/v10/users/@me/guilds?limit=200', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }, { reloginOnAuthFailure: true });
    if (!Array.isArray(guilds) || guilds.length > 200 || guilds.some(guild =>
      !guild || typeof guild.id !== 'string' || !/^\d{17,20}$/.test(guild.id) || typeof guild.name !== 'string')) {
      throw clientError(502, 'Resposta de servidores inválida do Discord.');
    }
    return guilds.map(guild => ({
      id: guild.id, name: guild.name,
      icon: typeof guild.icon === 'string' && /^(a_)?[a-f0-9]{32}$/.test(guild.icon) ? guild.icon : null,
      owner: guild.owner === true,
      permissions: typeof guild.permissions === 'string' ? guild.permissions : null,
    }));
  }

  async exchangeCode(code) {
    const token = await this.request('https://discord.com/api/oauth2/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.config.clientId, client_secret: this.config.clientSecret,
        grant_type: 'authorization_code', code, redirect_uri: this.config.redirectUri }),
    });
    if (!token || typeof token.access_token !== 'string' || !token.access_token || typeof token.token_type !== 'string' || token.token_type.toLowerCase() !== 'bearer' || !Number.isFinite(token.expires_in) || token.expires_in <= 0) {
      throw clientError(502, 'Resposta de autenticação inválida do Discord.');
    }
    return token;
  }

  async getUser(accessToken) {
    const user = await this.request('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!user || typeof user.id !== 'string' || !/^\d{17,20}$/.test(user.id) || typeof user.username !== 'string') {
      throw clientError(502, 'Perfil inválido retornado pelo Discord.');
    }
    const avatar = typeof user.avatar === 'string' && /^(a_)?[a-f0-9]{32}$/.test(user.avatar) ? user.avatar : null;
    const defaultIndex = /^\d{4}$/.test(user.discriminator) && user.discriminator !== '0000'
      ? Number(user.discriminator) % 5 : Number((BigInt(user.id) >> 22n) % 6n);
    return { id: user.id, username: user.username,
      displayName: typeof user.global_name === 'string' && user.global_name ? user.global_name : user.username,
      avatarUrl: avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${avatar}.${avatar.startsWith('a_') ? 'gif' : 'png'}`
        : `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png` };
  }
}

module.exports = { DiscordOAuthProvider };
