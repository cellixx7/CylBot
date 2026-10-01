const emptySnapshot = {
  loading: true,
  available: false,
  online: false,
  communityUrl: undefined,
  channels: {},
  metrics: {},
};

function metric(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

export async function getCommunitySnapshot(signal) {
  const response = await fetch('/api/community-preview', {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) throw new Error('Status da comunidade indisponível.');
  const data = await response.json();
  return {
    loading: false,
    available: true,
    online: data?.bot?.online === true,
    communityUrl: typeof data?.communityUrl === 'string' ? data.communityUrl : undefined,
    channels: data?.channels && typeof data.channels === 'object' ? data.channels : {},
    metrics: {
      commands: metric(data?.metrics?.commands),
      servers: metric(data?.metrics?.servers),
      ticketCommands: metric(data?.metrics?.ticketCommands),
    },
  };
}

export function unavailableCommunitySnapshot(previous = emptySnapshot) {
  return { ...previous, loading: false, available: false, online: false };
}

export { emptySnapshot };
