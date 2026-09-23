const { handleAnnouncementInteraction } = require('./announcementHandler');
const { handleTextaAIInteraction } = require('./textaAIHandler');
const { handleTicketInteraction } = require('../Ticket/handlers/ticketHandler');
const { handleTicketAIInteraction } = require('../Ticket/handlers/ticketAIHandler');

const interactionHandlers = [
  (interaction, services) => handleAnnouncementInteraction(interaction, services.announcements),
  (interaction, services) => handleTextaAIInteraction(interaction, services.textaAI),
  handleTicketAIInteraction,
  handleTicketInteraction,
];

module.exports = { interactionHandlers };
