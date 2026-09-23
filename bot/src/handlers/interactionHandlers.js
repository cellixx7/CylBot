const { handleAnnouncementInteraction } = require('./announcementHandler');
const { handleTextaAIInteraction } = require('./textaAIHandler');
const { handleTicketInteraction } = require('./ticketHandler');

const interactionHandlers = [
  (interaction, services) => handleAnnouncementInteraction(interaction, services.announcements),
  (interaction, services) => handleTextaAIInteraction(interaction, services.textaAI),
  handleTicketInteraction,
];

module.exports = { interactionHandlers };
