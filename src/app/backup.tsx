import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import * as repo from '../db/repo';
import { exportBackup, importBackup, validatePayload } from '../db/backup';
import { useApp } from '../ctx/AppContext';
import { C } from '../lib/theme';
import { Btn, Card, Screen, SectionLabel, T, TopBar, confirmDialog } from '../ui/kit';
import { Alert } from 'react-native';

function askMode(summary: string): Promise<'merge' | 'replace' | null> {
  return new Promise((resolve) => {
    Alert.alert('Import backup', `${summary}\n\nMerge adds to your current data (newest edit wins). Replace makes the file your full dataset.`, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      { text: 'Merge', onPress: () => resolve('merge') },
      { text: 'Replace', style: 'destructive', onPress: () => resolve('replace') },
    ], { cancelable: true, onDismiss: () => resolve(null) });
  });
}

export default function BackupScreen() {
  const { toast } = useApp();
  const [busy, setBusy] = useState<string | null>(null);

  const doExport = async () => {
    setBusy('export');
    try {
      const snap = await exportBackup();
      const name = `contracthub-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const file = new File(Paths.cache, name);
      if (file.exists) file.delete();
      file.create();
      file.write(JSON.stringify(snap, null, 2));
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'ContractHub backup' });
    } catch (e: any) { toast(e?.message || 'Export failed', 'error'); }
    setBusy(null);
  };

  const doImport = async () => {
    setBusy('import');
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
      if (res.canceled || !res.assets[0]) { setBusy(null); return; }
      const payload = JSON.parse(await new File(res.assets[0].uri).text());
      const kind = validatePayload(payload);
      const clients = kind === 'v2' ? payload.clients.length : (payload.data.clients ?? []).length;
      const contracts = kind === 'v2' ? payload.contracts.length : (payload.data.contracts ?? []).length;
      const mode = await askMode(`This file has ${clients} client(s) and ${contracts} contract(s)${kind === 'legacy' ? ' (from the old ContractHub web app)' : ''}.`);
      if (!mode) { setBusy(null); return; }
      const r = await importBackup(payload, mode);
      toast(`Imported ${r.clients} client(s), ${r.contracts} contract(s)`);
      router.replace('/');
    } catch (e: any) { toast(e instanceof SyntaxError ? 'That file is not valid JSON' : e?.message || 'Import failed', 'error'); }
    setBusy(null);
  };

  const wipe = async () => {
    if (!(await confirmDialog('This deletes every client and contract (and, if you use Google sync, on your other phones too).', 'Erase Everything'))) return;
    if (!(await confirmDialog('Are you absolutely sure? Consider exporting a backup first.', 'Yes, erase all'))) return;
    await repo.eraseAll();
    toast('All data erased');
    router.replace('/');
  };

  return (
    <Screen>
      <TopBar title="Backup & Restore" back />
      <SectionLabel>Export</SectionLabel>
      <Card>
        <T size={13.5} color={C.soft} style={{ marginBottom: 12 }}>Save a JSON file with all clients, contracts and settings. Keep a copy somewhere safe.</T>
        <Btn title="Export all data" icon="download" onPress={doExport} loading={busy === 'export'} style={{ marginBottom: 0 }} />
      </Card>
      <SectionLabel>Import</SectionLabel>
      <Card>
        <T size={13.5} color={C.soft} style={{ marginBottom: 12 }}>Restore from a backup file — including backups from the old ContractHub web app.</T>
        <Btn title="Import from file" icon="upload" variant="ghost" onPress={doImport} loading={busy === 'import'} style={{ marginBottom: 0 }} />
      </Card>
      <SectionLabel>Danger zone</SectionLabel>
      <Card>
        <T size={13.5} color={C.soft} style={{ marginBottom: 12 }}>Permanently delete every client and contract.</T>
        <Btn title="Erase all data" icon="trash-2" variant="danger" onPress={wipe} style={{ marginBottom: 0 }} />
      </Card>
      <View />
    </Screen>
  );
}
