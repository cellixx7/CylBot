const { invalidateCommunityChannel } = require('../api/routes/communityPreviewRoutes');

module.exports = {
  name: 'messageDelete',
  execute(message) {
    invalidateCommunityChannel(message.channelId);
  },
};
