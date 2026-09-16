const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { tempDirectory } = require('./helpers/tempDirectory');
const path = require('node:path');
const { JsonAnnouncementRepository } = require('../src/repositories/jsonAnnouncementRepository');

function tempFile(t) {
  const dir = tempDirectory(t, 'announcement-repository-');
  return path.join(dir, 'nested', 'announcements.json');
}

test('repository cria diretório, persiste no formato existente e preserva outras guilds', t => {
  const file = tempFile(t);
  const repository = new JsonAnnouncementRepository(file);
  assert.deepEqual(repository.readAll(), {});
  assert.equal(repository.getCategories('a'), undefined);
  assert.equal(fs.existsSync(file), false);
  const a = [{ id: 'a1', name: 'Categoria A', title: 'Título', description: '', image: '' }];
  const b = [{ id: 'b1', name: 'Categoria B', title: 'Outro', description: '', image: '' }];
  repository.saveCategories('a', a);
  repository.saveCategories('b', b);
  const reopened = new JsonAnnouncementRepository(file);
  assert.deepEqual(reopened.readAll(), { a, b });
  const edited = [{ ...a[0], title: 'Editado' }];
  reopened.saveCategories('a', edited);
  assert.deepEqual(repository.getCategories('a'), edited);
  assert.deepEqual(repository.getCategories('b'), b);
  assert.equal(fs.readFileSync(file, 'utf8'), JSON.stringify({ a: edited, b }, null, 2));
  assert.equal(fs.existsSync(`${file}.tmp`), false);
  // Listas vazias são dados persistidos; defaults pertencem ao service.
  repository.saveCategories('a', []);
  assert.deepEqual(reopened.getCategories('a'), []);
  assert.deepEqual(reopened.getCategories('b'), b);
});

test('repository preserva JSON existente inválido e propaga erros de leitura', t => {
  const file = tempFile(t);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{inválido');
  const repository = new JsonAnnouncementRepository(file);
  assert.throws(() => repository.readAll(), SyntaxError);
  assert.throws(() => repository.saveCategories('a', []), SyntaxError);
  assert.equal(fs.readFileSync(file, 'utf8'), '{inválido');
  const denied = Object.assign(new Error('Sem acesso'), { code: 'EACCES' });
  t.mock.method(fs, 'readFileSync', () => { throw denied; });
  assert.throws(() => repository.getCategories('a'), error => error === denied);
});

test('falha ao escrever temporário preserva arquivo anterior', t => {
  const file = tempFile(t);
  const repository = new JsonAnnouncementRepository(file);
  repository.saveCategories('a', [{ id: 'original' }]);
  const before = fs.readFileSync(file, 'utf8');
  const full = Object.assign(new Error('Disco cheio'), { code: 'ENOSPC' });
  t.mock.method(fs, 'writeFileSync', () => { throw full; });
  assert.throws(() => repository.saveCategories('a', [{ id: 'novo' }]), error => error === full);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('falha no rename preserva arquivo anterior e permite nova tentativa', t => {
  const file = tempFile(t);
  const repository = new JsonAnnouncementRepository(file);
  repository.saveCategories('a', [{ id: 'original' }]);
  const before = fs.readFileSync(file, 'utf8');
  const denied = Object.assign(new Error('Rename negado'), { code: 'EACCES' });
  const rename = t.mock.method(fs, 'renameSync', (source, destination) => {
    assert.equal(destination, file);
    assert.deepEqual(JSON.parse(fs.readFileSync(source, 'utf8')), { a: [{ id: 'novo' }] });
    throw denied;
  });
  assert.throws(() => repository.saveCategories('a', [{ id: 'novo' }]), error => error === denied);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  rename.mock.restore();
  repository.saveCategories('a', [{ id: 'nova tentativa' }]);
  assert.deepEqual(repository.getCategories('a'), [{ id: 'nova tentativa' }]);
  assert.equal(fs.existsSync(`${file}.tmp`), false);
});
