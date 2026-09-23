const { getConfig } = require('./src/config/env');
const config = getConfig({ requireDiscord: false });

module.exports = {
  schema: './src/database/schema.js',
  out: './src/database/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: config.database.url || 'postgresql://cylbot:cylbot_dev@localhost:5432/cylbot',
  },
  strict: true,
  verbose: true,
  entities: { relations: true },
};
