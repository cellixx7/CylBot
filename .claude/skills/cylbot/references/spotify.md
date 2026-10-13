# Spotify no CYLBOT

Uso atual: presence do bot mostra a música tocando quando o player está na playlist configurada.

- Código: `bot/src/services/presenceManager.js` (`getSpotifyActivity`, `getSpotifyAccessToken`), config em `bot/src/config/presence.js` e `env.js`.
- Variáveis: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN`, `SPOTIFY_PLAYLIST_ID`, `SPOTIFY_REDIRECT_URI` (padrão `http://127.0.0.1:8888/callback`, deve coincidir com o app no Spotify Dashboard).
- Refresh token obtido uma vez com `npm --prefix bot run spotify:auth` (exige só Client ID/Secret).
- Token de acesso: `POST https://accounts.spotify.com/api/token` com `grant_type=refresh_token` e Basic auth; cache em memória até `expires_in - 60s`.
- Leitura: `GET https://api.spotify.com/v1/me/player`. 204/202 = nada tocando; falhas caem para presence estática com `logger.warn('presence.spotify_unavailable', ...)`.

## Ao estender

- Se o Spotify passar a ser usado por outra feature (ex.: comando de música, web), extraia `bot/src/providers/spotifyProvider.js` com token/cache e injete pelo `createServices`, em vez de duplicar `fetch`.
- Respeite 429 com `Retry-After`; não faça polling mais agressivo que o atual.
- Escopos adicionais exigem refazer `spotify:auth`. Nunca logar tokens.
