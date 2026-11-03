const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/core.js');
const AI = require('../js/calc.js');

const CODES = [
  { kod: 'TIADA', nama: 'Tiada cukai', kadar: 0 },
  { kod: 'SST-PERKHIDMATAN-6', nama: 'Cukai Perkhidmatan 6%', kadar: 6 },
  { kod: 'SST-PERKHIDMATAN-8', nama: 'Cukai Perkhidmatan 8%', kadar: 8 },
  { kod: 'SST-JUALAN-10', nama: 'Cukai Jualan 10%', kadar: 10 }
];

test('toCents & fmtMoney: tepat tanpa ralat titik terapung', () => {
  assert.equal(AI.toCents('1,234.56'), 123456);
  assert.equal(AI.toCents(0.1 + 0.2), 30);
  assert.equal(AI.toCents('1.005'), 101);          // separuh ke atas
  assert.equal(AI.toCents(''), 0);
  assert.ok(Number.isNaN(AI.toCents('abc')));
  assert.equal(AI.fmtMoney(123456789), '1,234,567.89');
  assert.equal(AI.fmtMoney(5), '0.05');
  assert.equal(AI.fmtMoney(-1500), '-15.00');
  assert.equal(AI.fmtQty('2.5000'), '2.5');
});

test('Kes 1: tanpa cukai', () => {
  const r = AI.calcDoc([{ qty: 2, price: '150.00' }, { qty: 1, price: '49.90' }], CODES, { taxable: false });
  assert.equal(r.subtotal, 34990); assert.equal(r.tax, 0); assert.equal(r.total, 34990);
  assert.deepEqual(r.taxes, []);
});

test('Kes 2: SST 6% pada peringkat kod (bukan setiap baris)', () => {
  // 3 baris × 0.25 → setiap baris cukai 0.015 (dibundar 0.02 = 0.06), tetapi peringkat kod 0.75×6% = 0.045 → 0.05
  const items = [1, 2, 3].map(() => ({ qty: 1, price: '0.25', tax_code: 'SST-PERKHIDMATAN-6' }));
  const r = AI.calcDoc(items, CODES, { taxable: true });
  assert.equal(r.subtotal, 75); assert.equal(r.tax, 5); assert.equal(r.total, 80);
  assert.equal(r.taxes[0].base, 75);
});

test('Kes 3: SST 8% contoh biasa', () => {
  const r = AI.calcDoc([{ qty: 3, price: '1,200.00', tax_code: 'SST-PERKHIDMATAN-8' }], CODES, { taxable: true });
  assert.equal(r.subtotal, 360000); assert.equal(r.tax, 28800); assert.equal(r.total, 388800);
});

test('Kes 4: campuran kod, termasuk TIADA', () => {
  const r = AI.calcDoc([
    { qty: 1, price: 1000, tax_code: 'SST-PERKHIDMATAN-8' },
    { qty: 2, price: 99.99, tax_code: 'SST-JUALAN-10' },
    { qty: 1, price: 50, tax_code: 'TIADA' }
  ], CODES, { taxable: true });
  assert.equal(r.subtotal, 100000 + 19998 + 5000);
  assert.deepEqual(r.taxes.map((t) => [t.kod, t.base, t.tax]), [['SST-JUALAN-10', 19998, 2000], ['SST-PERKHIDMATAN-8', 100000, 8000]]);
  assert.equal(r.total, 124998 + 10000);
});

test('Kes 5: diskaun per baris dikira sebelum cukai; kuantiti perpuluhan', () => {
  const r = AI.calcDoc([{ qty: '2.5', price: '40.00', disc: '10', tax_code: 'SST-PERKHIDMATAN-8' }, { qty: '0.333', price: '3.00' }], CODES, { taxable: true });
  assert.equal(r.lines[0].amount, 9000); assert.equal(r.lines[0].gross, 10000); assert.equal(r.lines[0].disc, 1000);
  assert.equal(r.lines[1].amount, 100);              // 0.333 × 3.00 = 0.999 → 1.00
  assert.equal(r.discount, 1000); assert.equal(r.tax, 720); assert.equal(r.total, 9000 + 100 + 720);
  assert.equal(r.qty, 2.833);
});

test('tidak berdaftar SST: kod cukai diabaikan; DO tanpa harga', () => {
  assert.equal(AI.calcDoc([{ qty: 1, price: 100, tax_code: 'SST-PERKHIDMATAN-8' }], CODES, { taxable: false }).tax, 0);
  const d = AI.calcDoc([{ qty: 3, price: 100 }, { qty: 2 }], CODES, { jenis: 'do' });
  assert.equal(d.total, 0); assert.equal(d.qty, 5);
});

test('input tidak sah ditanda, tidak merosakkan jumlah', () => {
  const r = AI.calcDoc([{ qty: 'x', price: 10 }, { qty: 1, price: 5 }], CODES, {});
  assert.equal(r.lines[0].invalid, true); assert.equal(r.subtotal, 500);
});

test('nilai besar dan sempadan', () => {
  const r = AI.calcDoc([{ qty: 1000, price: '999,999.99' }], CODES, {});
  assert.equal(r.total, 99999999000);
  assert.equal(AI.fmtMoney(r.total), '999,999,990.00');
});

test('jumlah dalam perkataan', () => {
  assert.equal(AI.amountWords(0), 'RINGGIT MALAYSIA ZERO ONLY');
  assert.equal(AI.amountWords(123456), 'RINGGIT MALAYSIA ONE THOUSAND TWO HUNDRED THIRTY-FOUR AND CENTS FIFTY-SIX ONLY');
  assert.equal(AI.amountWords(100000005), 'RINGGIT MALAYSIA ONE MILLION AND CENTS FIVE ONLY');
  assert.equal(AI.amountWords(1101900), 'RINGGIT MALAYSIA ELEVEN THOUSAND NINETEEN ONLY');
  assert.equal(AI.amountWords(2000000000000), 'RINGGIT MALAYSIA TWENTY BILLION ONLY');
  assert.equal(AI.intWords(110), 'ONE HUNDRED TEN');
});
