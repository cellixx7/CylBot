module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, client) {
    await client.callSenseManager.handleVoiceStateUpdate(oldState, newState);
  },
};