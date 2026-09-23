const OpenRouterService = require('../services/openRouterService');
const { TextaAIService } = require('../services/textaAIService');
const TextaAISessionManager = require('../services/textaAISessionManager');
const { AnnouncementService } = require('../services/announcementService');
const { AnnouncementDraftManager } = require('../services/announcementDraftManager');
const { JsonAnnouncementRepository } = require('../repositories/jsonAnnouncementRepository');
const { DiscordOAuthProvider } = require('../providers/discordOAuthProvider');
const { AuthService } = require('../services/authService');
const { AuthSessionManager } = require('../services/authSessionManager');
const { DashboardService } = require('../services/dashboardService');
const PresenceManager = require('../services/presenceManager');
const CallSenseManager = require('../services/callSenseManager');
const { TicketRepository } = require('../repositories/ticketRepository');
const { TicketConfigRepository } = require('../repositories/ticketConfigRepository');
const { TicketTranscriptRepository } = require('../repositories/ticketTranscriptRepository');
const { DiscordTicketAdapter } = require('../providers/discordTicketAdapter');
const { TicketPermissionService } = require('../services/ticketPermissionService');
const { TicketTranscriptService } = require('../services/ticketTranscriptService');
const { TicketSetupService } = require('../services/ticketSetupService');
const { TicketService } = require('../services/ticketService');

function createServices(client, config) {
  const openRouter = new OpenRouterService(config.openRouter);
  const oauthProvider = new DiscordOAuthProvider(config.auth);
  const announcementRepository = new JsonAnnouncementRepository();
  const ticketConfigs = new TicketConfigRepository();
  const ticketAdapter = new DiscordTicketAdapter(client, config.tickets);
  const ticketPermissions = new TicketPermissionService(ticketAdapter);
  const ticketTranscripts = new TicketTranscriptService({ adapter: ticketAdapter, repository: new TicketTranscriptRepository() });

  return {
    openRouter,
    // Somente o adapter Discord usa sessões; a Web chama generate com dados do formulário.
    textaAI: new TextaAIService({ ai: openRouter, sessions: new TextaAISessionManager() }),
    announcements: new AnnouncementService(announcementRepository, openRouter, new AnnouncementDraftManager()),
    auth: new AuthService({ config: config.auth, provider: oauthProvider,
      sessions: new AuthSessionManager({ ttlSeconds: config.auth.sessionTtlSeconds }) }),
    dashboard: new DashboardService({ provider: oauthProvider, client }),
    presence: new PresenceManager(client),
    callSense: new CallSenseManager(client),
    ticketSetup: new TicketSetupService({ repository: ticketConfigs, permissions: ticketPermissions, adapter: ticketAdapter }),
    tickets: new TicketService({ repository: new TicketRepository(), configs: ticketConfigs,
      permissions: ticketPermissions, adapter: ticketAdapter, transcripts: ticketTranscripts }),
  };
}

module.exports = { createServices };
