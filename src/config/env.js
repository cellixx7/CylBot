const dotenv = require('dotenv');

dotenv.config();

const requiredVariables = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID'];

for (const variable of requiredVariables) {
  if (!process.env[variable]) {
    throw new Error(`A variável de ambiente ${variable} não foi definida.`);
  }
}

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
};