const anuncios = require('./anuncios');
const ping = require('./ping');
const say = require('./say');
const embed = require('./embed');
const presence = require('./presence');
const callsense = require('./callsense');
const texta_ai = require('./texta_ai');
const ticket = require('../Ticket/commands/ticket');

module.exports = [anuncios, ping, say, embed, presence, callsense, texta_ai, ticket];
