const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function tempDirectory(t, prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

module.exports = { tempDirectory };
