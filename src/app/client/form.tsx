import React, { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import * as repo from '../../db/repo';
import { useApp } from '../../ctx/AppContext';
import { Btn, Card, Field, Screen, TopBar } from '../../ui/kit';

export default function ClientForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { toast } = useApp();
  const [f, setF] = useState({ companyName: '', contactPerson: '', phone: '', email: '', address: '', city: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!id) return;
    repo.getClient(id).then((c) => {
      if (c) setF({ companyName: c.companyName, contactPerson: c.contactPerson, phone: c.phone, email: c.email, address: c.address, city: c.city, notes: c.notes });
    });
  }, [id]);

  const save = async () => {
    if (!f.companyName.trim()) { toast('Company name is required', 'error'); return; }
    setBusy(true);
    try {
      const savedId = await repo.saveClient({ ...f, id });
      toast(id ? 'Client updated' : 'Client added');
      router.replace(`/client/${savedId}`);
    } catch (e: any) { toast(e.message, 'error'); setBusy(false); }
  };

  return (
    <Screen>
      <TopBar title={id ? 'Edit Client' : 'New Client'} back />
      <Card>
        <Field label="Company / Business Name *" value={f.companyName} onChangeText={set('companyName')} placeholder="e.g. Al-Habib Traders" />
        <Field label="Contact Person" value={f.contactPerson} onChangeText={set('contactPerson')} placeholder="e.g. Ahmed Khan" />
        <Field label="Phone" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="03xx-xxxxxxx" />
        <Field label="Email" value={f.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" placeholder="name@company.com" />
        <Field label="Address" value={f.address} onChangeText={set('address')} multiline placeholder="Street, area" />
        <Field label="City" value={f.city} onChangeText={set('city')} placeholder="e.g. Lahore" />
        <Field label="Notes" value={f.notes} onChangeText={set('notes')} multiline placeholder="Anything worth remembering about this client" />
      </Card>
      <Btn title={id ? 'Save Changes' : 'Add Client'} icon="check" onPress={save} loading={busy} />
    </Screen>
  );
}
