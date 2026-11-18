const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/core.js');
const AI = require('../js/google.js');

const err = (status, message, reason) => Object.assign(new Error(message), { status, reason });

test('googleErrorHint: kebenaran tidak lengkap, ruang penuh, had kadar, 403 umum', () => {
  assert.match(AI.googleErrorHint(err(403, 'Request had insufficient authentication scopes.', 'insufficientPermissions')), /Kebenaran Drive belum lengkap/);
  assert.match(AI.googleErrorHint(err(403, 'The user storage quota has been exceeded', 'storageQuotaExceeded')), /Ruang Google Drive/);
  assert.match(AI.googleErrorHint(err(403, 'User Rate Limit Exceeded', 'userRateLimitExceeded')), /Terlalu banyak/);
  assert.match(AI.googleErrorHint(err(403, 'forbidden', 'forbidden')), /menolak akses/);
  assert.match(AI.googleErrorHint(err(403, 'Google Sheets API has not been used in project 1', 'accessNotConfigured')), /belum diaktifkan/);
  assert.match(AI.googleErrorHint(err(401, 'x')), /Sesi Google tamat/);
});

test('syncInfo: mesej + butiran teknikal (status, sebab, mesej mentah dipendekkan)', () => {
  const i = AI.syncInfo(err(403, 'Request had insufficient authentication scopes.', 'insufficientPermissions'));
  assert.equal(i.detail.status, 403); assert.equal(i.detail.reason, 'insufficientPermissions'); assert.match(i.message, /Kebenaran Drive/);
  assert.equal(AI.syncInfo(err(500, 'x'.repeat(500))).detail.raw.length, 200);
  assert.deepEqual(AI.syncInfo(null).detail, { status: 0, reason: '', raw: '' });
});

test('syncAdvice: langkah ikut jenis ralat; amaran pelayar dalam app', () => {
  const adv = (e, ua) => AI.syncAdvice(AI.syncInfo(e), ua).join(' | ');
  assert.match(adv(err(403, 'insufficient', 'insufficientPermissions')), /myaccount\.google\.com\/permissions/);
  assert.match(adv(err(403, 'quota', 'storageQuotaExceeded')), /drive\.google\.com\/settings\/storage/);
  assert.match(adv(err(429, 'x')), /Tunggu seminit/);
  assert.match(adv(err(503, 'x')), /Tunggu seminit/);
  assert.match(adv(err(403, 'API has not been used', 'accessNotConfigured')), /Google Cloud Console/);
  assert.match(adv(err(404, 'x')), /Trash/);
  assert.match(adv(Object.assign(new Error('Tiada sambungan internet'), { network: true })), /sambungan internet/);
  assert.match(adv(err(418, 'aneh')), /Salin butiran/);
  const fb = 'Mozilla/5.0 (Linux; Android 13; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/450.0]';
  assert.match(adv(err(403, 'forbidden', 'forbidden'), fb), /Chrome atau Safari/);
  assert.doesNotMatch(adv(err(403, 'forbidden', 'forbidden'), 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1'), /pelayar dalam aplikasi/);
  assert.equal(AI.inAppBrowser('Instagram 300.0'), true); assert.equal(AI.inAppBrowser('Chrome/120 Mobile Safari/537.36'), false);
});
