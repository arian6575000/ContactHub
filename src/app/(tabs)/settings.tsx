import React, { useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as repo from '../../db/repo';
import { useApp } from '../../ctx/AppContext';
import { Fmt } from '../../lib/format';
import { C } from '../../lib/theme';
import type { Settings } from '../../db/types';
import { Btn, Card, Field, Loading, Screen, SectionLabel, T, TopBar, useLoad } from '../../ui/kit';

function SyncCard() {
  const { profile, syncStatus, syncError, lastSyncAt, googleReady, signIn, signOut, syncNow, toast } = useApp();
  const [busy, setBusy] = useState(false);

  const doSignIn = async () => {
    setBusy(true);
    try { await signIn(); toast('Signed in — your data is syncing'); }
    catch (e: any) { toast(e?.message || 'Sign-in failed', 'error'); }
    setBusy(false);
  };

  if (!profile) {
    return (
      <Card>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(62,107,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="cloud" size={22} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <T weight="800" size={15.5}>Sync with Google</T>
            <T size={12.5} color={C.faint}>Sign in with Gmail to keep your clients and contracts in your own Google Drive and open them on any phone.</T>
          </View>
        </View>
        {!googleReady ? <T size={12} color={C.warning} style={{ marginTop: 10 }}>Google sign-in isn't configured in this build yet (see README → "Google sign-in setup").</T> : null}
        <Btn title="Sign in with Google" icon="log-in" onPress={doSignIn} loading={busy} disabled={!googleReady} style={{ marginTop: 14, marginBottom: 0 }} />
      </Card>
    );
  }
  const status = syncStatus === 'syncing' ? 'Syncing…' : syncStatus === 'error' ? 'Sync failed' : lastSyncAt ? `Last synced ${Fmt.date(lastSyncAt, true)}, ${new Date(lastSyncAt).toTimeString().slice(0, 5)}` : 'Not synced yet';
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        {profile.picture ? <Image source={{ uri: profile.picture }} style={{ width: 44, height: 44, borderRadius: 22 }} />
          : <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}><T color="#fff" weight="800">{Fmt.initials(profile.name)}</T></View>}
        <View style={{ flex: 1 }}>
          <T weight="800" size={15.5} lines={1}>{profile.name}</T>
          <T size={12.5} color={C.faint} lines={1}>{profile.email}</T>
        </View>
        <Feather name={syncStatus === 'error' ? 'alert-circle' : 'check-circle'} size={22} color={syncStatus === 'error' ? C.danger : C.success} />
      </View>
      <T size={12.5} color={syncStatus === 'error' ? C.danger : C.faint} style={{ marginTop: 10 }}>{status}{syncStatus === 'error' && syncError ? ` — ${syncError}` : ''}</T>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <Btn small title="Sync now" icon="refresh-cw" variant="subtle" onPress={syncNow} loading={syncStatus === 'syncing'} style={{ flex: 1 }} />
        <Btn small title="Sign out" icon="log-out" variant="ghost" onPress={async () => { await signOut(); toast('Signed out — data stays on this phone'); }} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

export default function SettingsTab() {
  const { data } = useLoad(() => repo.getSettings());
  const { toast } = useApp();
  const [f, setF] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data && !f) setF(data); }, [data, f]);
  // If a sync brings newer settings in while the form is untouched, show them.
  useEffect(() => { if (data && f && data.updatedAt > f.updatedAt) setF(data); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!f) return <Screen><Loading /></Screen>;
  const set = <K extends keyof Settings>(k: K) => (v: Settings[K]) => setF((p) => (p ? { ...p, [k]: v } : p));

  const pickLogo = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (res.canceled || !res.assets[0]) return;
    try {
      const out = await ImageManipulator.manipulateAsync(res.assets[0].uri, [{ resize: { width: 400 } }], {
        format: ImageManipulator.SaveFormat.PNG, base64: true,
      });
      if (out.base64) set('companyLogo')(`data:image/png;base64,${out.base64}`);
    } catch { toast('Could not read that image', 'error'); }
  };

  const save = async () => {
    if (!f.companyName.trim()) { toast('Company name is required', 'error'); return; }
    setBusy(true);
    try {
      const { updatedAt, ...rest } = f;
      const saved = await repo.saveSettings({ ...rest, contractPrefix: rest.contractPrefix.trim() || 'CN', currency: rest.currency.trim() || 'PKR' });
      setF(saved);
      toast('Settings saved');
    } catch (e: any) { toast(e.message, 'error'); }
    setBusy(false);
  };

  return (
    <Screen>
      <TopBar title="Settings" />

      <SectionLabel>Account & Sync</SectionLabel>
      <SyncCard />

      <SectionLabel>Company Profile</SectionLabel>
      <Card>
        <T size={13} weight="700" color={C.soft} style={{ marginBottom: 6, marginLeft: 2 }}>Logo</T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <View style={{ width: 72, height: 72, borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {f.companyLogo ? <Image source={{ uri: f.companyLogo }} style={{ width: 64, height: 64 }} resizeMode="contain" /> : <Feather name="image" size={26} color={C.faint} />}
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            <Btn small variant="subtle" title="Upload Logo" icon="upload" onPress={pickLogo} />
            {f.companyLogo ? <Pressable onPress={() => set('companyLogo')(null)}><T size={12.5} color={C.danger} weight="700">Remove logo</T></Pressable> : null}
          </View>
        </View>
        <Field label="Company Name *" value={f.companyName} onChangeText={set('companyName')} />
        <Field label="Tagline" value={f.companyTagline} onChangeText={set('companyTagline')} placeholder="e.g. Software Solutions" />
        <Field label="Address" value={f.companyAddress} onChangeText={set('companyAddress')} multiline placeholder="Office address shown on the contract header" />
        <Field label="Phone" value={f.companyPhone} onChangeText={set('companyPhone')} keyboardType="phone-pad" />
        <Field label="Email" value={f.companyEmail} onChangeText={set('companyEmail')} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Website" value={f.companyWebsite} onChangeText={set('companyWebsite')} autoCapitalize="none" placeholder="www.yourcompany.com" />
      </Card>

      <SectionLabel>Contract Numbering & Currency</SectionLabel>
      <Card>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><Field label="Contract Prefix" value={f.contractPrefix} onChangeText={set('contractPrefix')} autoCapitalize="characters" hint={`e.g. ${f.contractPrefix || 'CN'}-${new Date().getFullYear()}-001`} /></View>
          <View style={{ flex: 1 }}><Field label="Default Currency" value={f.currency} onChangeText={set('currency')} autoCapitalize="characters" /></View>
        </View>
      </Card>

      <SectionLabel>Default Terms & Conditions</SectionLabel>
      <Card>
        <Field label="" value={f.defaultTerms} onChangeText={set('defaultTerms')} multiline style={{ minHeight: 220 }}
          hint="Used to pre-fill every new contract. Existing contracts keep the terms they were saved with." />
      </Card>

      <Btn title="Save Settings" icon="check" onPress={save} loading={busy} />

      <SectionLabel>Data</SectionLabel>
      <Btn title="Backup & Restore" icon="database" variant="ghost" onPress={() => router.push('/backup')} />
    </Screen>
  );
}
