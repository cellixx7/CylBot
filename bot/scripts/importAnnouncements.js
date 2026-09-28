const path = require('node:path');
const { getConfig } = require('../src/config/env');
const { JsonAnnouncementRepository } = require('../src/repositories/jsonAnnouncementRepository');
const { PostgresAnnouncementRepository } = require('../src/repositories/postgresAnnouncementRepository');
const { createDatabase } = require('../src/database/client');

async function main() {
  const config = getConfig({ requireDiscord: false });
  if (!config.database?.url) throw new Error('DATABASE_URL is required to import announcements.');
  const source = new JsonAnnouncementRepository(path.join(__dirname, '../data/announcements.json'));
  const database = createDatabase(config.database.url);
  try {
    const target = new PostgresAnnouncementRepository(database);
    const data = source.readAll();
    const entries = Object.entries(data);
    for (const [guildId, categories] of entries) await target.saveCategories(guildId, categories);
    process.stdout.write(`Imported ${entries.length} guild announcement catalog(s).\n`);
  } finally {
    await database.close();
  }
}

main().catch(error => {
  process.stderr.write(`Announcement import failed: ${error.message}\n`);
  process.exitCode = 1;
});
