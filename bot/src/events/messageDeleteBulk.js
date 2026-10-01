const { invalidateCommunityChannel } = require('../api/routes/communityPreviewRoutes');

module.exports = {
  name: 'messageDeleteBulk',
  execute(messages) {
    const channelIds = new Set([...messages.values()].map(message => message.channelId).filter(Boolean));
    for (const channelId of channelIds) invalidateCommunityChannel(channelId);
  },
};
