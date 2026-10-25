import assert from 'node:assert/strict';
import { nodeDb, test, done } from './nodeAdapter';
import * as repo from '../src/db/repo';
import { runSync, SYNC_FILE_NAME, type FetchFn } from '../src/lib/driveSync';
import { mergeSnapshots, resolveNumberCollisions } from '../src/lib/syncCore';
import { nextNumber } from '../src/lib/numbering';
import type { Client, Contract, Snapshot } from '../src/db/types';

const client = (id: string, over: Partial<Client> = {}): Client => ({
  id, companyName: id, contactPerson: '', phone: '', email: '', address: '', city: '', notes: '',
  createdAt: 100, updatedAt: 100, deletedAt: null, ...over,
});
const contract = (id: string, over: Partial<Contract> = {}): Contract => ({
  id, clientId: 'c1', contractNumber: 'CN-2026-001', softwareName: id, scopeDescription: '', amount: 1, currency: 'PKR',
  paymentType: 'full', schedule: [], startDate: null, deliveryDate: null, supportPeriodMonths: 0, status: 'draft',
  termsAndConditions: null, notes: '', createdAt: 100, updatedAt: 100, deletedAt: null, ...over,
});
const snap = (clients: Client[] = [], contracts: Contract[] = [], settings: Snapshot['settings'] = null): Snapshot =>
  ({ app: 'ContractHub', version: 2, exportedAt: 0, clients, contracts, settings });

// A tiny in-memory Google Drive (appDataFolder) so the real sync code runs end to end.
function fakeDrive() {
  let file: { id: string; body: string; modifiedTime: number } | null = null;
  let tick = 1;
  const calls: string[] = [];
  const fetchFn: FetchFn = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    calls.push(`${method} ${url.split('?')[0].replace('https://www.googleapis.com', '')}`);
    assert.match(init.headers.Authorization, /^Bearer /);
    const ok = (data: any, text?: string) => ({ ok: true, status: 200, json: async () => data, text: async () => text ?? JSON.stringify(data) });
    if (method === 'GET' && url.includes('/drive/v3/files?')) {
      return ok({ files: file ? [{ id: file.id, modifiedTime: String(file.modifiedTime) }] : [] });
    }
    if (method === 'GET' && url.includes('alt=media')) return ok(null, file!.body);
    if (method === 'POST') {
      const body: string = init.body;
      const json = body.split('\r\n\r\n')[2].split('\r\n--')[0];
      assert.ok(body.includes(SYNC_FILE_NAME) && body.includes('appDataFolder'));
      file = { id: 'f1', body: json, modifiedTime: tick++ };
      return ok({ id: 'f1' });
    }
    if (method === 'PATCH') { file = { id: 'f1', body: init.body, modifiedTime: tick++ }; return ok({ id: 'f1' }); }
    throw new Error('unexpected ' + method + ' ' + url);
  };
  return { fetchFn, calls, get file() { return file; }, set file(v) { file = v; } };
}

(async () => {
  console.log('merge');

  await test('newer edit wins per row; rows from both sides are kept', () => {
    const local = snap([client('a', { companyName: 'A-local', updatedAt: 300 }), client('only-local')]);
    const remote = snap([client('a', { companyName: 'A-remote', updatedAt: 200 }), client('only-remote')]);
    const m = mergeSnapshots(local, remote, 1000);
    assert.equal(m.clients.find((c) => c.id === 'a')!.companyName, 'A-local');
    assert.deepEqual(m.clients.map((c) => c.id).sort(), ['a', 'only-local', 'only-remote']);
  });

  await test('a delete on one phone beats an older edit on the other', () => {
    const local = snap([], [contract('k', { deletedAt: 500, updatedAt: 500 })]);
    const remote = snap([], [contract('k', { softwareName: 'edited', updatedAt: 400 })]);
    const m = mergeSnapshots(local, remote, 1000);
    assert.equal(m.contracts[0].deletedAt, 500);
  });

  await test('an edit made after a delete resurrects the row (newest wins)', () => {
    const local = snap([], [contract('k', { deletedAt: 500, updatedAt: 500 })]);
    const remote = snap([], [contract('k', { softwareName: 'edited later', updatedAt: 600 })]);
    const m = mergeSnapshots(local, remote, 1000);
    assert.equal(m.contracts[0].deletedAt, null);
    assert.equal(m.contracts[0].softwareName, 'edited later');
  });

  await test('merge is symmetric: both phones converge to identical data', () => {
    const a = snap([client('x', { updatedAt: 5 })], [contract('p', { updatedAt: 7, contractNumber: 'CN-2026-001' })]);
    const b = snap([client('x', { updatedAt: 5, companyName: 'tie' })], [contract('q', { updatedAt: 8, contractNumber: 'CN-2026-001', createdAt: 200 })]);
    const ab = mergeSnapshots(a, b, 1000);
    const ba = mergeSnapshots(b, a, 1000);
    const key = (s: Snapshot) => JSON.stringify([s.clients, s.contracts].map((l) => [...l].sort((x: any, y: any) => (x.id < y.id ? -1 : 1))));
    assert.equal(key(ab), key(ba));
  });

  await test('two contracts with the same number: older keeps it, newer is renumbered', () => {
    const merged = resolveNumberCollisions([
      contract('old', { contractNumber: 'CN-2026-002', createdAt: 100 }),
      contract('new', { contractNumber: 'CN-2026-002', createdAt: 200 }),
      contract('other', { contractNumber: 'CN-2026-003', createdAt: 150 }),
    ], 1000);
    const num = Object.fromEntries(merged.map((c) => [c.id, c.contractNumber]));
    assert.equal(num.old, 'CN-2026-002');
    assert.equal(num.other, 'CN-2026-003');
    assert.equal(num.new, 'CN-2026-004');
  });

  await test('old tombstones are purged, recent ones kept', () => {
    const now = 200 * 24 * 3600 * 1000;
    const m = mergeSnapshots(
      snap([client('old', { deletedAt: 1, updatedAt: 1 }), client('recent', { deletedAt: now - 1000, updatedAt: now - 1000 })]),
      null, now);
    // with no remote the local snapshot is returned as-is; purge applies on a real merge:
    const m2 = mergeSnapshots(snap([client('old', { deletedAt: 1, updatedAt: 1 }), client('recent', { deletedAt: now - 1000, updatedAt: now - 1000 })]), snap(), now);
    assert.equal(m.clients.length, 2);
    assert.deepEqual(m2.clients.map((c) => c.id), ['recent']);
  });

  await test('settings: newest wins; a never-saved fresh phone (null) never overwrites', () => {
    const s = (name: string, updatedAt: number) => ({ companyName: name, updatedAt } as any);
    assert.equal(mergeSnapshots(snap([], [], s('local', 1)), snap([], [], s('remote', 2)), 9).settings!.companyName, 'remote');
    assert.equal(mergeSnapshots(snap([], [], null), snap([], [], s('remote', 2)), 9).settings!.companyName, 'remote');
    assert.equal(mergeSnapshots(snap([], [], s('local', 3)), snap([], [], null), 9).settings!.companyName, 'local');
  });

  await test('nextNumber ignores other prefixes/years', () => {
    assert.equal(nextNumber(['CN-2025-009', 'XX-2026-050', 'CN-2026-004'], 'CN', 2026), 'CN-2026-005');
    assert.equal(nextNumber([], 'CN', 2026), 'CN-2026-001');
  });

  console.log('drive sync (two phones, one Google account)');

  await test('phone A uploads; phone B (fresh install, same Gmail) pulls everything', async () => {
    const drive = fakeDrive();
    const token = async () => 'tok';

    // --- Phone A ---
    const A = nodeDb();
    await repo.initRepo(A);
    await repo.saveSettings({ ...(await repo.getSettings()), companyName: 'Acme Soft', contractPrefix: 'AS' });
    const cid = await repo.saveClient({ companyName: 'Al-Habib', city: 'Lahore' });
    await repo.saveContract({ clientId: cid, softwareName: 'POS', amount: 500 });
    const rA = await runSync({ getAccessToken: token, getLocal: repo.getSnapshot, applyLocal: (s) => repo.applySnapshot(s), fetchFn: drive.fetchFn });
    assert.deepEqual([rA.firstSync, rA.uploaded], [true, true]);

    // --- Phone B: brand new install ---
    const B = nodeDb();
    await repo.initRepo(B);
    assert.equal((await repo.listClients()).length, 0);
    const rB = await runSync({ getAccessToken: token, getLocal: repo.getSnapshot, applyLocal: (s) => repo.applySnapshot(s), fetchFn: drive.fetchFn });
    assert.equal(rB.changedLocal, true);
    assert.equal((await repo.listClients())[0].companyName, 'Al-Habib');
    const c = (await repo.listContracts())[0];
    assert.equal(c.softwareName, 'POS');
    assert.match(c.contractNumber, /^AS-\d{4}-001$/); // settings (prefix) synced too
    assert.equal((await repo.getSettings()).companyName, 'Acme Soft');
  });

  await test('edits and deletes on either phone propagate; unchanged sync does not re-upload', async () => {
    const drive = fakeDrive();
    const token = async () => 'tok';
    const sync = () => runSync({ getAccessToken: token, getLocal: repo.getSnapshot, applyLocal: (s) => repo.applySnapshot(s), fetchFn: drive.fetchFn });

    const A = nodeDb(); const B = nodeDb();
    await repo.initRepo(A);
    const c1 = await repo.saveClient({ companyName: 'Keep' });
    const c2 = await repo.saveClient({ companyName: 'Doomed' });
    await sync();
    await repo.initRepo(B); await sync(); // B gets both

    // B edits Keep and deletes Doomed, syncs
    await repo.saveClient({ id: c1, companyName: 'Keep (edited on B)' });
    await repo.deleteClient(c2);
    await sync();

    // A syncs and sees both changes
    await repo.initRepo(A);
    const r = await sync();
    assert.equal(r.changedLocal, true);
    const names = (await repo.listClients()).map((c) => c.companyName);
    assert.deepEqual(names, ['Keep (edited on B)']);

    // Nothing changed → no upload
    const before = drive.calls.filter((c) => c.startsWith('PATCH')).length;
    const r2 = await sync();
    assert.deepEqual([r2.changedLocal, r2.uploaded], [false, false]);
    assert.equal(drive.calls.filter((c) => c.startsWith('PATCH')).length, before);
  });

  await test('offline edits on both phones merge without losing either (same-number contracts renumbered)', async () => {
    const drive = fakeDrive();
    const token = async () => 'tok';
    const sync = () => runSync({ getAccessToken: token, getLocal: repo.getSnapshot, applyLocal: (s) => repo.applySnapshot(s), fetchFn: drive.fetchFn });
    const A = nodeDb(); const B = nodeDb();

    await repo.initRepo(A); await repo.saveSettings({ ...(await repo.getSettings()), contractPrefix: 'CN' });
    const cid = await repo.saveClient({ companyName: 'Shared client' });
    await sync();
    await repo.initRepo(B); await sync();

    // both go "offline" and each creates a contract → both get CN-<year>-001
    await repo.initRepo(A); await repo.saveContract({ clientId: cid, softwareName: 'From A', amount: 1 });
    await repo.initRepo(B); await repo.saveContract({ clientId: cid, softwareName: 'From B', amount: 2 });
    await sync(); // B uploads
    await repo.initRepo(A); await sync(); // A merges
    await repo.initRepo(B); await sync(); // B picks up final numbering

    const view = async (d: ReturnType<typeof nodeDb>) => { await repo.initRepo(d); return (await repo.listContracts()).map((c) => `${c.softwareName}:${c.contractNumber}`).sort(); };
    const a = await view(A); const b = await view(B);
    assert.equal(a.length, 2);
    assert.deepEqual(a, b);
    assert.equal(new Set(a.map((x) => x.split(':')[1])).size, 2); // unique numbers
  });

  await test('concurrent writer is detected and re-merged (optimistic concurrency)', async () => {
    const drive = fakeDrive();
    const token = async () => 'tok';
    const A = nodeDb();
    await repo.initRepo(A);
    await repo.saveClient({ companyName: 'Seed' });
    await runSync({ getAccessToken: token, getLocal: repo.getSnapshot, applyLocal: (s) => repo.applySnapshot(s), fetchFn: drive.fetchFn });

    await repo.saveClient({ companyName: 'Local change' });
    // Another device writes between our download and our upload.
    let interfered = false;
    const racing: FetchFn = async (url, init) => {
      const res = await drive.fetchFn(url, init);
      if (!interfered && url.includes('alt=media')) {
        interfered = true;
        const remote = JSON.parse(drive.file!.body) as Snapshot;
        remote.clients.push(client('from-other-device', { updatedAt: Date.now() + 10 }));
        drive.file = { id: 'f1', body: JSON.stringify(remote), modifiedTime: drive.file!.modifiedTime + 100 };
      }
      return res;
    };
    await runSync({ getAccessToken: token, getLocal: repo.getSnapshot, applyLocal: (s) => repo.applySnapshot(s), fetchFn: racing });
    const names = (await repo.listClients()).map((c) => c.companyName).sort();
    assert.deepEqual(names, ['Local change', 'Seed', 'from-other-device'].sort());
    const finalRemote = JSON.parse(drive.file!.body) as Snapshot;
    assert.equal(finalRemote.clients.length, 3); // nothing was overwritten
  });

  await test('Drive errors surface a readable message', async () => {
    const bad: FetchFn = async () => ({ ok: false, status: 401, json: async () => ({}), text: async () => 'unauthorized' });
    await repo.initRepo(nodeDb());
    await assert.rejects(
      () => runSync({ getAccessToken: async () => 't', getLocal: repo.getSnapshot, applyLocal: (s) => repo.applySnapshot(s), fetchFn: bad }),
      /Google Drive error 401/);
  });

  done();
})();
