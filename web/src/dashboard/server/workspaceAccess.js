const GUILD_ID = /^\d{17,20}$/;
const TICKET_ID = /^[a-f0-9-]{36}$/;

export function parseServerRoute(path) {
  const match = path.match(/^\/dashboard\/([^/]+)(?:\/([^/]+)(?:\/([^/]+))?)?\/?$/);
  if (!match) return null;
  const [, guildId, section = 'overview', ticketId] = match;
  return { guildId, section, ticketId,
    supported: GUILD_ID.test(guildId) && (
      (section === 'overview' && !ticketId) ||
      (section === 'tickets' && (!ticketId || TICKET_ID.test(ticketId))) ||
      (section === 'announcements' && !ticketId)
    ) };
}

export function accessibleGuilds(guilds = []) {
  return guilds.filter(guild => guild.botInstalled === true && (guild.canManage === true || guild.canViewTickets === true));
}

export function serverHref(guild) {
  return `#/dashboard/${guild.id}${guild.canManage === true ? '' : '/tickets'}`;
}

// These capabilities come from the authorized API response, never from the URL.
export function workspaceAccess(guilds, route) {
  const guild = accessibleGuilds(guilds).find(item => item.id === route.guildId);
  if (!guild) return { status: 'denied' };
  if (!route.supported) return { status: 'unavailable', guild };
  if (route.section === 'overview' && !guild.canManage) {
    return { status: 'redirect', guild, href: `#/dashboard/${guild.id}/tickets` };
  }
  if (route.section === 'tickets' && !guild.canViewTickets) return { status: 'denied' };
  return { status: 'allowed', guild };
}

export const SERVER_SECTIONS = [
  { id: 'overview', label: 'Visão geral', group: 'Gerenciamento', capability: 'canManage', implemented: true, path: '' },
  { id: 'tickets', label: 'Tickets', group: 'Gerenciamento', capability: 'canViewTickets', implemented: true, path: '/tickets' },
  { id: 'announcements', label: 'Avisos e atualizações', group: 'Gerenciamento', capability: 'canManage', implemented: true, path: '/announcements' },
  { id: 'automation', label: 'Automação', group: 'Gerenciamento', capability: 'canManage' },
  { id: 'intelligence', label: 'Inteligência', group: 'Gerenciamento', capability: 'canManage' },
  { id: 'personalization', label: 'Personalização', group: 'Gerenciamento', capability: 'canManage' },
  { id: 'access', label: 'Acessos e equipe', group: 'Administração', capability: 'canManage' },
  { id: 'settings', label: 'Configurações', group: 'Administração', capability: 'canManage' },
];

export function serverSections(guild) {
  return SERVER_SECTIONS.filter(section => guild[section.capability] === true);
}
