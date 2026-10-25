import assert from 'node:assert/strict';
import { test, done } from './nodeAdapter';
import { buildContractHtml, esc } from '../src/lib/contractHtml';
import { DEFAULT_SETTINGS } from '../src/lib/defaults';
import { Fmt } from '../src/lib/format';
import type { Client, Contract } from '../src/db/types';

const client: Client = { id: 'c', companyName: 'Al-Habib <Traders>', contactPerson: 'Ahmed', phone: '0300', email: 'a@b.c',
  address: 'Street 1', city: 'Lahore', notes: '', createdAt: 1, updatedAt: 1, deletedAt: null };
const contract: Contract = { id: 'k', clientId: 'c', contractNumber: 'CN-2026-001', softwareName: 'POS & Billing', scopeDescription: 'Build "POS"',
  amount: 500000, currency: 'PKR', paymentType: 'installments',
  schedule: [{ label: 'Advance', amount: 200000, dueDate: 1700000000000, paidAt: null }, { label: 'Final', amount: 300000, dueDate: null, paidAt: null }],
  startDate: 1700000000000, deliveryDate: null, supportPeriodMonths: 3, status: 'active', termsAndConditions: null, notes: 'secret internal note',
  createdAt: 1700000000000, updatedAt: 1700000000000, deletedAt: null };

(async () => {
  console.log('contract html + formatting');
  await test('escapes user text (no HTML injection) and never prints internal notes', () => {
    const html = buildContractHtml(contract, client, { ...DEFAULT_SETTINGS, companyName: '<script>x</script>' }, { lang: 'en' });
    assert.ok(!html.includes('<script>x'));
    assert.ok(html.includes('Al-Habib &lt;Traders&gt;'));
    assert.ok(!html.includes('secret internal note'));
  });
  await test('installments table with total, default terms used when contract has none', () => {
    const html = buildContractHtml(contract, client, DEFAULT_SETTINGS, { lang: 'en' });
    assert.ok(html.includes('Payment Schedule'));
    assert.ok(html.includes('PKR 500,000'));
    assert.ok(html.includes('SCOPE OF WORK') || html.includes('1. SCOPE OF WORK'));
  });
  await test('full payment contract has no schedule table; custom terms override defaults', () => {
    const html = buildContractHtml({ ...contract, paymentType: 'full', schedule: [], termsAndConditions: 'Only these terms.' }, client, DEFAULT_SETTINGS, { lang: 'en' });
    assert.ok(!html.includes('Payment Schedule'));
    assert.ok(html.includes('Only these terms.'));
    assert.ok(!html.includes('GOVERNING LAW'));
  });
  await test('urdu pdf is RTL with Urdu labels', () => {
    const html = buildContractHtml(contract, client, DEFAULT_SETTINGS, { lang: 'ur' });
    assert.ok(html.includes('dir="rtl"'));
    assert.ok(html.includes('سافٹ ویئر معاہدہ'));
  });
  await test('esc handles quotes and ampersands', () => assert.equal(esc(`a&b"c'<`), 'a&amp;b&quot;c&#39;&lt;'));
  await test('Fmt: money grouping, dates, input parsing', () => {
    assert.equal(Fmt.money(1234567.4), 'PKR 1,234,567');
    assert.equal(Fmt.money(0, 'USD'), 'USD 0');
    assert.equal(Fmt.parseDateInput(''), null);
    assert.equal(Fmt.parseDateInput('2026-02-30'), undefined);
    assert.equal(Fmt.parseDateInput('nope'), undefined);
    const t = Fmt.parseDateInput('2026-03-05') as number;
    assert.equal(Fmt.dateInput(t), '2026-03-05');
    assert.equal(Fmt.initials('al habib traders'), 'AH');
  });
  done();
})();
