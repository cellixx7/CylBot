import { useEffect, useState } from 'react';
import cylLogoUrl from '../assets/brand/cyl-logo-white.png';
import { discordCommunityUrl, discordInstallUrl } from '../lib/discordLinks.js';
import { communityChannels, communityStats, cylBotTags } from './communityData.js';
import { emptySnapshot, getCommunitySnapshot, unavailableCommunitySnapshot } from './communityApi.js';
import './community-preview.css';

const metricFormatter = new Intl.NumberFormat('pt-BR');
const postDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
});

function formatPostDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : postDateFormatter.format(date);
}

function revealCommunityPosts(event) {
  const feed = event.currentTarget.closest('.community-feed');
  if (!feed) return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nextPosition = Math.min(feed.scrollHeight - feed.clientHeight, feed.scrollTop + feed.clientHeight * 0.72);
  feed.scrollTo({ top: nextPosition, behavior: reducedMotion ? 'auto' : 'smooth' });
}

function useCommunitySnapshot() {
  const [snapshot, setSnapshot] = useState(emptySnapshot);

  useEffect(() => {
    let controller;
    let active = true;
    const refresh = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const next = await getCommunitySnapshot(controller.signal);
        if (active) setSnapshot(next);
      } catch (error) {
        if (active && error.name !== 'AbortError') setSnapshot(current => unavailableCommunitySnapshot(current));
      }
    };
    const refreshVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    refresh();
    const interval = window.setInterval(refreshVisible, 10_000);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, []);

  return snapshot;
}

function ExternalLink({ href, className, children, label }) {
  if (!href) return <span className={className} aria-label={label}>{children}</span>;
  return <a className={className} href={href} target="_blank" rel="noreferrer" aria-label={label}>{children}</a>;
}

function CommunityAvatar({ author }) {
  const [failed, setFailed] = useState(false);
  if (author.avatarUrl && !failed) {
    return <img className="community-message-avatar" src={author.avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
  }
  return <span className="community-message-avatar community-message-avatar-fallback" aria-hidden="true">{author.name.charAt(0).toUpperCase()}</span>;
}

function CylBotProfile() {
  return (
    <article className="community-bot-profile" aria-label="Perfil do aplicativo CylBot">
      <div className="community-bot-banner" />
      <ExternalLink href={discordInstallUrl} className="community-bot-avatar community-action-tooltip" label="Adicionar bot">
        <img src={cylLogoUrl} alt="" />
      </ExternalLink>
      <div className="community-bot-name">
        <ExternalLink href={discordInstallUrl} className="community-bot-handle community-action-tooltip" label="Adicionar bot">@Cylbot</ExternalLink>
        <span>APP</span>
      </div>
      <p>Automação, IA e suporte para o controle e personalização da sua comunidade.</p>
      <ul aria-label="Recursos do CylBot">
        {cylBotTags.map(tag => <li key={tag}>{tag}</li>)}
      </ul>
      <small>Aplicativo oficial da CYL</small>
    </article>
  );
}

function CommunityPost({ post, href }) {
  const accessibleTitle = post.title || `Mensagem de ${post.author.name}`;
  return (
    <article className="community-post" style={{ '--community-post-accent': post.accent }}>
      <div className="community-embed">
        <header className="community-message-header">
          <CommunityAvatar author={post.author} />
          <div className="community-message-author">
            <ExternalLink href={href} label={`Abrir mensagem de ${post.author.name} no Discord`}>{post.author.name}</ExternalLink>
            {post.source === 'web' && <span>via Web</span>}
          </div>
          <time dateTime={post.publishedAt}>{formatPostDate(post.publishedAt)}</time>
        </header>
        {post.title && <h3><ExternalLink href={href} label={`Abrir ${post.title} no Discord`}>{post.title}</ExternalLink></h3>}
        <p>{post.content}</p>
      </div>
      {post.reactions.length > 0 && (
        <ul className="community-reactions" aria-label={`Reações em ${accessibleTitle}`}>
          {post.reactions.map(reaction => (
            <li key={`${reaction.emoji}-${reaction.count}`}><span aria-hidden="true">{reaction.emoji}</span>{reaction.count}</li>
          ))}
        </ul>
      )}
    </article>
  );
}

export default function CommunityPreview({ channels = communityChannels, stats = communityStats }) {
  const channelIds = Object.keys(channels);
  const [activeChannelId, setActiveChannelId] = useState(channelIds[0]);
  const activeChannel = channels[activeChannelId] || channels[channelIds[0]];
  const snapshot = useCommunitySnapshot();
  const communityUrl = snapshot.communityUrl || discordCommunityUrl;
  const activeChannelUrl = snapshot.channels?.[activeChannelId]?.url;
  const posts = snapshot.channels?.[activeChannelId]?.posts;
  const statusState = snapshot.loading ? 'loading' : !snapshot.available ? 'unavailable' : snapshot.online ? 'online' : 'offline';
  const statusText = snapshot.loading ? 'verificando' : !snapshot.available ? 'indisponível' : snapshot.online ? 'online agora' : 'offline';

  return (
    <section id="comunidade" className="community-preview" aria-labelledby="community-preview-title">
      <header className="community-preview-topbar">
        <h2 id="community-preview-title">
          <ExternalLink href={communityUrl} className="community-brand" label="Abrir servidor CYL Community no Discord">
            <span className="community-brand-avatar" aria-hidden="true"><img src={cylLogoUrl} alt="" /></span>
            <span>CYL COMMUNITY</span>
          </ExternalLink>
        </h2>
        <span className={`community-online is-${statusState}`} aria-live="polite">
          <i aria-hidden="true" />{statusText}
        </span>
      </header>

      <div className="community-preview-body">
        <aside className="community-sidebar" aria-label="Canais da comunidade CYL">
          <div className="community-server">
            <nav aria-label="Canais da comunidade">
              {channelIds.map(channelId => {
                const channel = channels[channelId];
                const active = channelId === activeChannelId;
                return (
                  <button key={channelId} type="button" aria-current={active ? 'page' : undefined}
                    aria-controls="community-channel-feed" onClick={() => setActiveChannelId(channelId)}>
                    <span aria-hidden="true">#</span>{channel.label}
                  </button>
                );
              })}
            </nav>
          </div>
          <CylBotProfile />
        </aside>

        <section id="community-channel-feed" className="community-feed" key={activeChannelId} aria-live="polite">
          <span className="community-channel-label"># {activeChannel.label}</span>
          <h2>{activeChannel.title}</h2>
          <p className="community-channel-description">{activeChannel.description}</p>
          {Array.isArray(posts) && posts.length > 0 && (
            <button className="community-news-jump" type="button" onClick={revealCommunityPosts}>
              <span>Veja todas as notícias</span><i aria-hidden="true" />
            </button>
          )}
          <div className="community-posts">
            {Array.isArray(posts) && posts.map(post => (
              <CommunityPost key={post.id} post={post} href={post.url || activeChannelUrl} />
            ))}
            {!Array.isArray(posts) && <p className="community-posts-state">Não foi possível carregar as mensagens deste canal.</p>}
            {Array.isArray(posts) && posts.length === 0 && <p className="community-posts-state">Ainda não há mensagens publicadas neste canal.</p>}
          </div>
        </section>

        <aside className="community-stats" aria-label="Estatísticas do CYL">
          <span>CYL EM NÚMEROS</span>
          <div className="community-stat-list">
            {stats.map(stat => {
              const value = snapshot.metrics?.[stat.metric];
              return (
                <article key={stat.id} style={{ '--community-stat-accent': stat.accent }}>
                  <strong>{Number.isSafeInteger(value) ? metricFormatter.format(value) : '—'}</strong><p>{stat.label}</p>
                </article>
              );
            })}
          </div>
          <small>Comandos de ticket contabilizados nesta sessão do bot</small>
        </aside>
      </div>
    </section>
  );
}
