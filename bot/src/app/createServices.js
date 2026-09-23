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
const { createDatabase } = require('../database/client');
const { PostgresUserRepository } = require('../repositories/postgresUserRepository');
const { PostgresTicketRepository } = require('../repositories/postgresTicketRepository');
const { PostgresTicketConfigRepository } = require('../repositories/postgresTicketConfigRepository');
const { TicketReconciliationService } = require('../services/ticketReconciliationService');
const { PostgresTicketAIRepository } = require('../repositories/postgresTicketAIRepository');
const { TicketAIService } = require('../services/ticketAIService');
const { TicketAIContextService } = require('../services/ticketAIContextService');
const { TicketAIPolicyService } = require('../services/ticketAIPolicyService');
const { TicketAIActionService } = require('../services/ticketAIActionService');
const { TicketAIMessageHandler } = require('../handlers/ticketAIMessageHandler');
const { PostgresTicketMessageRepository } = require('../repositories/postgresTicketMessageRepository');
const { TicketMessageService } = require('../services/ticketMessageService');
const { TicketMessageHandler } = require('../handlers/ticketMessageHandler');

function createServices(client, config) {
  const database = config.database?.url ? createDatabase(config.database.url) : null;
  const userRepository = database ? new PostgresUserRepository(database) : null;
  const ticketRepository = database ? new PostgresTicketRepository(database) : new TicketRepository();
  const ticketConfigs = database ? new PostgresTicketConfigRepository(database) : new TicketConfigRepository();
  const openRouter = new OpenRouterService(config.openRouter);
  const oauthProvider = new DiscordOAuthProvider(config.auth);
  const announcementRepository = new JsonAnnouncementRepository();
  const ticketAdapter = new DiscordTicketAdapter(client, config.tickets);
  const ticketPermissions = new TicketPermissionService(ticketAdapter);
  const ticketTranscripts = new TicketTranscriptService({ adapter: ticketAdapter, repository: new TicketTranscriptRepository() });
  const ticketReconciliation = new TicketReconciliationService({ adapter: ticketAdapter, repository: ticketRepository });
  const tickets = new TicketService({ repository: ticketRepository, configs: ticketConfigs,
    permissions: ticketPermissions, adapter: ticketAdapter, transcripts: ticketTranscripts, reconciliation: ticketReconciliation });
  const messageRepository = database ? new PostgresTicketMessageRepository(database) : null;
  const ticketMessages = new TicketMessageService({ repository: messageRepository, tickets, permissions: ticketPermissions, adapter: ticketAdapter });
  ticketTranscripts.messages = ticketMessages;
  const aiRepository = database ? new PostgresTicketAIRepository(database) : null;
  const aiSettings = config.ticketAI || { enabled: false, guildIds: [], model: config.openRouter.model, timeoutMs: 20000 };
  const aiPolicy = new TicketAIPolicyService(aiSettings);
  const ticketAI = new TicketAIService({ repository: aiRepository, tickets, provider: openRouter, settings: aiSettings,
    context: new TicketAIContextService(ticketMessages), policy: aiPolicy,
    actions: new TicketAIActionService({ repository: aiRepository, adapter: ticketAdapter, policy: aiPolicy,
      permissions: ticketPermissions, messages: ticketMessages }) });
  const ticketAIMessages = new TicketAIMessageHandler(ticketAI);

  return {
    openRouter,
    database,
    users: userRepository,
    // Somente o adapter Discord usa sessões; a Web chama generate com dados do formulário.
    textaAI: new TextaAIService({ ai: openRouter, sessions: new TextaAISessionManager() }),
    announcements: new AnnouncementService(announcementRepository, openRouter, new AnnouncementDraftManager()),
    auth: new AuthService({ config: config.auth, provider: oauthProvider, users: userRepository,
      sessions: new AuthSessionManager({ ttlSeconds: config.auth.sessionTtlSeconds }) }),
    dashboard: new DashboardService({ provider: oauthProvider, client }),
    presence: new PresenceManager(client),
    callSense: new CallSenseManager(client),
    ticketSetup: new TicketSetupService({ repository: ticketConfigs, permissions: ticketPermissions, adapter: ticketAdapter }),
    tickets,
    ticketMessages,
    ticketAI,
    ticketAIMessages,
    ticketMessageInbound: new TicketMessageHandler({ messages: ticketMessages, ai: ticketAIMessages }),
    ticketReconciliation,
  };
}

module.exports = { createServices };
