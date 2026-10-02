import test from 'node:test';
import assert from 'node:assert/strict';
import { DARK_THEME, LIGHT_THEME, nextTheme, normalizeTheme, readStoredTheme } from '../src/theme/themeState.js';

test('tema padrão é dark e valores inválidos não são aceitos', () => {
  assert.equal(readStoredTheme({ getItem: () => null }), DARK_THEME);
  assert.equal(readStoredTheme({ getItem: () => 'sepia' }), DARK_THEME);
  assert.equal(normalizeTheme('sepia'), null);
});

test('preferências light e dark são lidas e alternadas', () => {
  assert.equal(readStoredTheme({ getItem: () => LIGHT_THEME }), LIGHT_THEME);
  assert.equal(readStoredTheme({ getItem: () => DARK_THEME }), DARK_THEME);
  assert.equal(nextTheme(DARK_THEME), LIGHT_THEME);
  assert.equal(nextTheme(LIGHT_THEME), DARK_THEME);
});

test('storage indisponível não impede o fallback dark', () => {
  assert.equal(readStoredTheme({ getItem: () => { throw new Error('blocked'); } }), DARK_THEME);
});
