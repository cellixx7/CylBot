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
    const value = this.readAll()[guildId];
    return Array.isArray(value) ? value : value?.categories;
  }

  saveCategories(guildId, categories) {
    const data = this.readAll();
    const previous = data[guildId];
    data[guildId] = previous && !Array.isArray(previous) ? { ...previous, categories } : categories;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(data, null, 2));
    fs.renameSync(temp, this.file);
  }

  getRecent(guildId, limit = 12) {
    const value = this.readAll()[guildId];
    const publications = Array.isArray(value) ? [] : value?.publications || [];
    return publications.slice().sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, limit);
  }

  savePublication(publication) {
    const data = this.readAll();
    const previous = data[publication.guildId];
    const record = Array.isArray(previous) ? { categories: previous, publications: [] } : previous || { categories: [], publications: [] };
    const saved = { id: require('node:crypto').randomUUID(), ...publication, publishedAt: new Date().toISOString() };
    data[publication.guildId] = { ...record, publications: [saved, ...(record.publications || [])].slice(0, 50) };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(data, null, 2));
    fs.renameSync(temp, this.file);
    return saved;
  }
}

module.exports = { JsonAnnouncementRepository };
