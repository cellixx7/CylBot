const { handleAnnouncementInteraction } = require('./announcementHandler');
const { handleTextaAIInteraction } = require('./textaAIHandler');
const { handleTicketInteraction } = require('./ticketHandler');
const { handleTicketAIInteraction } = require('./ticketAIHandler');

const interactionHandlers = [
  (interaction, services) => handleAnnouncementInteraction(interaction, services.announcements),
  (interaction, services) => handleTextaAIInteraction(interaction, services.textaAI),
  handleTicketAIInteraction,
  handleTicketInteraction,
];

module.exports = { interactionHandlers };
