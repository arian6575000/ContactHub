// Sync through the user's own Google Drive "appDataFolder" — a hidden, app-private folder.
// No server of ours is involved: the data lives in the user's Google account, so signing in with
// the same Gmail on another phone brings everything back.
//
// Flow: download the Drive copy → merge with local (see syncCore) → write merged data locally →
// upload merged copy. Uploads are guarded by the file's modifiedTime so two phones syncing at the
// same moment can't silently overwrite each other (we re-merge and retry instead).

import type { Snapshot } from '../db/types';
import { mergeSnapshots, sameData } from './syncCore';

export const SYNC_FILE_NAME = 'contracthub-sync.json';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export type FetchFn = (url: string, init?: any) => Promise<{
  ok: boolean; status: number; json(): Promise<any>; text(): Promise<string>;
}>;

export interface SyncDeps {
  getAccessToken: () => Promise<string>;
  getLocal: () => Promise<Snapshot>;
  applyLocal: (merged: Snapshot) => Promise<void>;
  fetchFn?: FetchFn;
  now?: () => number;
}

export interface SyncResult {
  /** Number of rows (clients + contracts) that differ from before on this phone. */
  changedLocal: boolean;
  uploaded: boolean;
  firstSync: boolean;
}

export class DriveError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function call(f: FetchFn, token: string, url: string, init: any = {}) {
  const res = await f(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 200); } catch { /* ignore */ }
    throw new DriveError(`Google Drive error ${res.status}${detail ? `: ${detail}` : ''}`, res.status);
  }
  return res;
}

async function findFile(f: FetchFn, token: string): Promise<{ id: string; modifiedTime: string } | null> {
  const q = encodeURIComponent(`name = '${SYNC_FILE_NAME}' and trashed = false`);
  const res = await call(f, token, `${API}/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&pageSize=10&orderBy=modifiedTime desc`);
  const body = await res.json();
  return body.files?.[0] ?? null;
}

async function download(f: FetchFn, token: string, id: string): Promise<Snapshot | null> {
  const res = await call(f, token, `${API}/files/${id}?alt=media`);
  const text = await res.text();
  if (!text.trim()) return null;
  const parsed = JSON.parse(text);
  if (parsed?.version !== 2 || !Array.isArray(parsed.clients) || !Array.isArray(parsed.contracts)) {
    throw new Error('The Drive sync file is not in a format this app version understands. Update the app.');
  }
  return parsed as Snapshot;
}

async function create(f: FetchFn, token: string, snap: Snapshot) {
  const boundary = 'contracthub' + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name: SYNC_FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' });
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(snap)}\r\n--${boundary}--`;
  await call(f, token, `${UPLOAD}/files?uploadType=multipart`, {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
  });
}

async function update(f: FetchFn, token: string, id: string, snap: Snapshot) {
  await call(f, token, `${UPLOAD}/files/${id}?uploadType=media`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snap),
  });
}

export async function runSync(deps: SyncDeps): Promise<SyncResult> {
  const f: FetchFn = deps.fetchFn ?? ((url, init) => fetch(url, init) as any);
  const now = deps.now ?? Date.now;
  const token = await deps.getAccessToken();

  let changedLocal = false;
  let uploaded = false;
  let firstSync = false;

  for (let attempt = 0; attempt < 3; attempt++) {
    const file = await findFile(f, token);
    const remote = file ? await download(f, token, file.id) : null;
    const local = await deps.getLocal();
    firstSync = firstSync || !file;

    const merged = mergeSnapshots(local, remote, now());
    if (!sameData(merged, local)) {
      await deps.applyLocal(merged);
      changedLocal = true;
    }

    if (remote && sameData(merged, remote)) return { changedLocal, uploaded, firstSync }; // Drive already up to date

    if (file) {
      // Optimistic concurrency: if someone else wrote while we were merging, start over.
      const check = await findFile(f, token);
      if (check && check.modifiedTime !== file.modifiedTime) continue;
      await update(f, token, file.id, merged);
    } else {
      await create(f, token, merged);
    }
    uploaded = true;
    return { changedLocal, uploaded, firstSync };
  }
  throw new Error('Sync kept conflicting with another device. Please try again in a moment.');
}
