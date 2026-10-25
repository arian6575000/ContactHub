import assert from 'node:assert/strict';
import { nodeDb, test, done } from './nodeAdapter';
import * as repo from '../src/db/repo';
import { convertLegacy, importBackup } from '../src/db/backup';

const DAY = 24 * 3600 * 1000;

async function fresh() {
  await repo.initRepo(nodeDb());
}

(async () => {
  console.log('repo');

  await test('settings: defaults are not persisted (updatedAt stays 0) until saved', async () => {
    await fresh();
    const s = await repo.getSettings();
    assert.equal(s.updatedAt, 0);
    assert.equal(s.contractPrefix, 'CN');
    const saved = await repo.saveSettings({ ...s, companyName: 'Acme Soft' });
    assert.ok(saved.updatedAt > 0);
    assert.equal((await repo.getSettings()).companyName, 'Acme Soft');
  });

  await test('clients: create, update, list with stats, soft delete', async () => {
    await fresh();
    const id = await repo.saveClient({ companyName: ' Al-Habib Traders ', city: 'Lahore' });
    assert.match(id, /^[0-9a-f-]{36}$/);
    await repo.saveClient({ id, companyName: 'Al-Habib Traders', phone: '0300' });
    const c = await repo.getClient(id);
    assert.equal(c?.city, 'Lahore'); // untouched field survives partial update
    assert.equal(c?.phone, '0300');
    const list = await repo.listClients();
    assert.equal(list.length, 1);
    assert.equal(list[0].contractCount, 0);
    await repo.deleteClient(id);
    assert.equal((await repo.listClients()).length, 0);
    assert.equal((await repo.getSnapshot()).clients.length, 1); // tombstone kept for sync
    await assert.rejects(() => repo.saveClient({ companyName: '  ' }), /required/);
  });

  await test('contracts: auto numbering is sequential and never reused after delete', async () => {
    await fresh();
    const cid = await repo.saveClient({ companyName: 'A' });
    const y = new Date().getFullYear();
    const a = await repo.saveContract({ clientId: cid, softwareName: 'POS', amount: 100 });
    const b = await repo.saveContract({ clientId: cid, softwareName: 'ERP', amount: 200 });
    assert.equal((await repo.getContract(a))?.contractNumber, `CN-${y}-001`);
    assert.equal((await repo.getContract(b))?.contractNumber, `CN-${y}-002`);
    await repo.deleteContract(b);
    const c = await repo.saveContract({ clientId: cid, softwareName: 'Web', amount: 5 });
    assert.equal((await repo.getContract(c))?.contractNumber, `CN-${y}-003`);
  });

  await test('contracts: client with live contracts cannot be deleted; with none it can', async () => {
    await fresh();
    const cid = await repo.saveClient({ companyName: 'A' });
    const k = await repo.saveContract({ clientId: cid, softwareName: 'X', amount: 1 });
    await assert.rejects(() => repo.deleteClient(cid), /1 contract/);
    await repo.deleteContract(k);
    await repo.deleteClient(cid);
  });

  await test('contracts: schedule round-trips and installments can be marked paid', async () => {
    await fresh();
    const cid = await repo.saveClient({ companyName: 'A' });
    const id = await repo.saveContract({
      clientId: cid, softwareName: 'X', amount: 300, paymentType: 'installments',
      schedule: [
        { label: 'Advance', amount: 100, dueDate: 1000, paidAt: null },
        { label: 'Final', amount: 200, dueDate: 2000, paidAt: null },
      ],
    });
    await repo.setInstallmentPaid(id, 0, true);
    const c = await repo.getContract(id);
    assert.ok(c!.schedule[0].paidAt);
    assert.equal(c!.schedule[1].paidAt, null);
    await repo.setInstallmentPaid(id, 0, false);
    assert.equal((await repo.getContract(id))!.schedule[0].paidAt, null);
  });

  await test('contracts: full payment drops any schedule; terms null means "use default"', async () => {
    await fresh();
    const cid = await repo.saveClient({ companyName: 'A' });
    const id = await repo.saveContract({
      clientId: cid, softwareName: 'X', amount: 10, paymentType: 'full',
      schedule: [{ label: 'x', amount: 1, dueDate: null, paidAt: null }],
    });
    const c = await repo.getContract(id);
    assert.equal(c!.schedule.length, 0);
    assert.equal(c!.termsAndConditions, null);
  });

  await test('dashboard: totals, overdue and upcoming payments, cancelled excluded', async () => {
    await fresh();
    const now = Date.now();
    const cid = await repo.saveClient({ companyName: 'A' });
    await repo.saveContract({
      clientId: cid, softwareName: 'X', amount: 600, paymentType: 'installments', status: 'active',
      schedule: [
        { label: 'p1', amount: 100, dueDate: now - 2 * DAY, paidAt: null },          // overdue
        { label: 'p2', amount: 200, dueDate: now + 5 * DAY, paidAt: null },          // upcoming
        { label: 'p3', amount: 300, dueDate: now - 10 * DAY, paidAt: now - 9 * DAY }, // paid
      ],
    });
    await repo.saveContract({
      clientId: cid, softwareName: 'Y', amount: 999, paymentType: 'installments', status: 'cancelled',
      schedule: [{ label: 'z', amount: 999, dueDate: now - DAY, paidAt: null }],
    });
    const s = await repo.dashboardStats(now);
    assert.equal(s.contractCount, 2);
    assert.equal(s.overdue.length, 1);
    assert.equal(s.overdue[0].label, 'p1');
    assert.equal(s.upcoming.length, 1);
    assert.equal(s.received, 300);
    assert.equal(s.outstanding, 300);
    assert.equal(s.active, 1);
  });

  await test('eraseAll tombstones everything but keeps settings', async () => {
    await fresh();
    await repo.saveSettings({ ...(await repo.getSettings()), companyName: 'Keep me' });
    const cid = await repo.saveClient({ companyName: 'A' });
    await repo.saveContract({ clientId: cid, softwareName: 'X', amount: 1 });
    await repo.eraseAll();
    assert.equal((await repo.listClients()).length, 0);
    assert.equal((await repo.listContracts()).length, 0);
    assert.equal((await repo.getSettings()).companyName, 'Keep me');
  });

  await test('subscribe: local edits notify with source "local"', async () => {
    await fresh();
    const seen: string[] = [];
    const off = repo.subscribe((s) => seen.push(s));
    await repo.saveClient({ companyName: 'A' });
    off();
    await repo.saveClient({ companyName: 'B' });
    assert.deepEqual(seen, ['local']);
  });

  console.log('backup');

  const legacyBackup = {
    app: 'ContractHub', version: 1, exportedAt: '2026-01-01T00:00:00Z',
    data: {
      clients: [{ id: 1, companyName: 'Al-Habib', contactPerson: 'Ahmed', phone: '0300', createdAt: 1700000000000 }],
      contracts: [{
        id: 7, clientId: 1, contractNumber: 'CN-2026-007', softwareName: 'POS', amount: 500000, currency: 'PKR',
        paymentType: 'installments', status: 'signed', startDate: 1700000000000, deliveryDate: null,
        paymentSchedule: [{ label: 'Advance', amount: 200000, dueDate: 1700500000000 }],
        supportPeriodMonths: 3, termsAndConditions: 'Custom terms', createdAt: 1700000000000,
      }],
      settings: [{ id: 'main', companyName: 'My Software House', contractPrefix: 'MSH', currency: 'PKR', updatedAt: 1700000000000 }],
    },
  };

  await test('legacy web-app backup converts with deterministic ids and keeps relations', async () => {
    const snap = convertLegacy(legacyBackup);
    assert.equal(snap.clients[0].id, 'legacy-client-1');
    assert.equal(snap.contracts[0].clientId, 'legacy-client-1');
    assert.equal(snap.contracts[0].schedule[0].paidAt, null);
    assert.equal(snap.settings?.contractPrefix, 'MSH');
  });

  await test('importing a legacy backup twice is idempotent (merge)', async () => {
    await fresh();
    const r1 = await importBackup(legacyBackup, 'merge');
    assert.deepEqual([r1.clients, r1.contracts, r1.legacy], [1, 1, true]);
    await importBackup(legacyBackup, 'merge');
    assert.equal((await repo.listClients()).length, 1);
    assert.equal((await repo.listContracts()).length, 1);
    const c = (await repo.listContracts())[0];
    assert.equal(c.contractNumber, 'CN-2026-007');
    assert.equal(c.termsAndConditions, 'Custom terms');
    assert.equal((await repo.getSettings()).companyName, 'My Software House');
  });

  await test('replace import tombstones records that are not in the file', async () => {
    await fresh();
    const keep = await repo.saveClient({ companyName: 'Will be replaced' });
    await importBackup(legacyBackup, 'replace');
    const names = (await repo.listClients()).map((c) => c.companyName);
    assert.deepEqual(names, ['Al-Habib']);
    assert.equal(await repo.getClient(keep), null);
  });

  await test('v2 export → import round-trip preserves data', async () => {
    await fresh();
    const cid = await repo.saveClient({ companyName: 'RT Client' });
    await repo.saveContract({ clientId: cid, softwareName: 'RT', amount: 42 });
    const exported = JSON.parse(JSON.stringify(await repo.getSnapshot()));
    await fresh();
    const r = await importBackup(exported, 'merge');
    assert.deepEqual([r.clients, r.contracts, r.legacy], [1, 1, false]);
    assert.equal((await repo.listContracts())[0].softwareName, 'RT');
  });

  await test('garbage files are rejected', async () => {
    await fresh();
    await assert.rejects(() => importBackup({ hello: 'world' }), /not a ContractHub backup/);
    await assert.rejects(() => importBackup(null), /Invalid backup/);
  });

  done();
})();
