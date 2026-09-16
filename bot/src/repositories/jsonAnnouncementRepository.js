const fs = require('node:fs');
const path = require('node:path');

class JsonAnnouncementRepository {
  constructor(file = path.join(__dirname, '../../data/announcements.json')) {
    this.file = file;
  }

  readAll() {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  }

  getCategories(guildId) {
    return this.readAll()[guildId];
  }

  saveCategories(guildId, categories) {
    const data = this.readAll();
    data[guildId] = categories;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(data, null, 2));
    fs.renameSync(temp, this.file);
  }
}

module.exports = { JsonAnnouncementRepository };
