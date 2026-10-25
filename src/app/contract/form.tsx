import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as repo from '../../db/repo';
import { useApp } from '../../ctx/AppContext';
import { Fmt } from '../../lib/format';
import { C, R } from '../../lib/theme';
import { STATUSES, type Client, type ContractStatus } from '../../db/types';
import { Btn, Card, Chip, DateField, Empty, Field, Loading, Screen, SearchBar, SectionLabel, Segmented, T, TopBar } from '../../ui/kit';

interface Row { key: number; label: string; amount: string; dueDate: number | null; paidAt: number | null }

export default function ContractForm() {
  const { id, clientId: presetClient } = useLocalSearchParams<{ id?: string; clientId?: string }>();
  const { toast } = useApp();
  const seq = useRef(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [pickClient, setPickClient] = useState(false);
  const [search, setSearch] = useState('');

  const [clientId, setClientId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [scope, setScope] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('PKR');
  const [paymentType, setPaymentType] = useState<'full' | 'installments'>('full');
  const [rows, setRows] = useState<Row[]>([]);
  const [startDate, setStartDate] = useState<number | null>(Date.now());
  const [deliveryDate, setDeliveryDate] = useState<number | null>(null);
  const [support, setSupport] = useState('3');
  const [status, setStatus] = useState<ContractStatus>('draft');
  const [terms, setTerms] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    (async () => {
      const [cl, settings, existing] = await Promise.all([repo.listClients(), repo.getSettings(), id ? repo.getContract(id) : Promise.resolve(null)]);
      setClients(cl);
      setCurrency(existing?.currency ?? settings.currency ?? 'PKR');
      setTerms(existing?.termsAndConditions ?? settings.defaultTerms);
      if (existing) {
        setClientId(existing.clientId); setTitle(existing.softwareName); setScope(existing.scopeDescription);
        setAmount(String(existing.amount)); setPaymentType(existing.paymentType);
        setRows(existing.schedule.map((s) => ({ key: ++seq.current, label: s.label, amount: String(s.amount), dueDate: s.dueDate, paidAt: s.paidAt })));
        setStartDate(existing.startDate); setDeliveryDate(existing.deliveryDate); setSupport(String(existing.supportPeriodMonths));
        setStatus(existing.status); setNotes(existing.notes);
      } else if (presetClient) setClientId(presetClient);
      setReady(true);
    })();
  }, [id, presetClient]);

  const client = clients.find((c) => c.id === clientId);
  const scheduleSum = useMemo(() => rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0), [rows]);
  const total = parseFloat(amount) || 0;
  const mismatch = paymentType === 'installments' && total > 0 && Math.abs(scheduleSum - total) > 0.01;

  const addRow = () => setRows((r) => [...r, { key: ++seq.current, label: `Installment ${r.length + 1}`, amount: '', dueDate: null, paidAt: null }]);
  const patchRow = (key: number, p: Partial<Row>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const save = async () => {
    if (!clientId) { toast('Please select a client', 'error'); return; }
    if (!title.trim()) { toast('Contract title is required', 'error'); return; }
    if (paymentType === 'installments' && rows.length === 0) { toast('Add at least one installment', 'error'); return; }
    setBusy(true);
    try {
      const savedId = await repo.saveContract({
        id, clientId, softwareName: title, scopeDescription: scope, amount: total, currency, paymentType,
        schedule: rows.map((r) => ({ label: r.label, amount: parseFloat(r.amount) || 0, dueDate: r.dueDate, paidAt: r.paidAt })),
        startDate, deliveryDate, supportPeriodMonths: parseInt(support, 10) || 0, status, termsAndConditions: terms, notes,
      });
      toast(id ? 'Contract updated' : 'Contract created');
      router.replace(`/contract/${savedId}`);
    } catch (e: any) { toast(e.message, 'error'); setBusy(false); }
  };

  if (!ready) return <Screen><Loading /></Screen>;
  if (clients.length === 0) {
    return (
      <Screen>
        <TopBar title="New Contract" back />
        <Empty icon="user-plus" title="Add a client first" text="You need at least one client before creating a contract."
          action={<Btn small title="Add Client" icon="plus" onPress={() => router.replace('/client/form')} />} />
      </Screen>
    );
  }

  const shown = clients.filter((c) => c.companyName.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <Screen>
      <TopBar title={id ? 'Edit Contract' : 'New Contract'} back />

      <SectionLabel>Client</SectionLabel>
      <Card onPress={() => setPickClient(true)} pad={14} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T weight="700" size={15} color={client ? C.ink : C.faint}>{client?.companyName ?? 'Choose a client…'}</T>
        <Feather name="chevron-down" size={20} color={C.faint} />
      </Card>

      <SectionLabel>Software / Service</SectionLabel>
      <Card>
        <Field label="Contract Title *" value={title} onChangeText={setTitle} placeholder="e.g. Point of Sale System Development" />
        <Field label="Scope of Work" value={scope} onChangeText={setScope} multiline placeholder="Describe what will be delivered — modules, features, platforms…" />
      </Card>

      <SectionLabel>Pricing</SectionLabel>
      <Card>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1.4 }}><Field label="Total Amount *" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" /></View>
          <View style={{ flex: 1 }}><Field label="Currency" value={currency} onChangeText={setCurrency} autoCapitalize="characters" placeholder="PKR" /></View>
        </View>
        <T size={13} weight="700" color={C.soft} style={{ marginBottom: 6, marginLeft: 2 }}>Payment Type</T>
        <Segmented value={paymentType} onChange={(v) => { setPaymentType(v); if (v === 'installments' && rows.length === 0) addRow(); }}
          options={[{ value: 'full', label: 'Full Payment' }, { value: 'installments', label: 'Installments' }]} />

        {paymentType === 'installments' ? (
          <View style={{ marginTop: 14 }}>
            {rows.map((r) => (
              <View key={r.key} style={{ backgroundColor: 'rgba(20,22,31,0.04)', borderRadius: R.sm, padding: 12, marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                  <View style={{ flex: 1.3 }}><Field label="Label" value={r.label} onChangeText={(v) => patchRow(r.key, { label: v })} /></View>
                  <View style={{ flex: 1 }}><Field label="Amount" value={r.amount} onChangeText={(v) => patchRow(r.key, { amount: v })} keyboardType="decimal-pad" /></View>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
                  <DateField label="Due date" value={r.dueDate} onChange={(v) => patchRow(r.key, { dueDate: v })} />
                  <Pressable onPress={() => setRows((x) => x.filter((y) => y.key !== r.key))} hitSlop={8} style={{ paddingBottom: 26, paddingHorizontal: 6 }}>
                    <Feather name="trash-2" size={20} color={C.danger} />
                  </Pressable>
                </View>
              </View>
            ))}
            <Btn small variant="subtle" title="Add Installment" icon="plus" onPress={addRow} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
              <T size={13} weight="700" color={mismatch ? C.danger : C.soft}>Installments total</T>
              <T size={13} weight="800" color={mismatch ? C.danger : C.ink}>
                {Fmt.money(scheduleSum, currency)}{mismatch ? `  (contract: ${Fmt.money(total, currency)})` : ''}
              </T>
            </View>
          </View>
        ) : null}
      </Card>

      <SectionLabel>Timeline</SectionLabel>
      <Card>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <DateField label="Start Date" value={startDate} onChange={setStartDate} />
          <DateField label="Delivery Date" value={deliveryDate} onChange={setDeliveryDate} />
        </View>
        <Field label="Support / Warranty Period (months)" value={support} onChangeText={setSupport} keyboardType="number-pad" placeholder="3" />
      </Card>

      <SectionLabel>Status</SectionLabel>
      <Card pad={12}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {STATUSES.map((s) => <Chip key={s} label={Fmt.status(s)} on={status === s} onPress={() => setStatus(s)} />)}
        </View>
      </Card>

      <SectionLabel>Terms & Conditions</SectionLabel>
      <Card>
        <Field label="" value={terms} onChangeText={setTerms} multiline style={{ minHeight: 220 }}
          hint="Pre-filled from your default terms in Settings — edit freely for this contract. A copy is saved with the contract." />
      </Card>

      <SectionLabel>Notes</SectionLabel>
      <Card><Field label="" value={notes} onChangeText={setNotes} multiline placeholder="Internal notes (not shown on the PDF)" /></Card>

      {mismatch ? <T size={13} color={C.danger} style={{ marginBottom: 10, textAlign: 'center' }}>Installments don't add up to the contract amount.</T> : null}
      <Btn title={id ? 'Save Changes' : 'Create Contract'} icon="check" onPress={save} loading={busy} />

      <Modal visible={pickClient} animationType="slide" onRequestClose={() => setPickClient(false)}>
        <Screen scroll={false}>
          <View style={{ flex: 1, paddingHorizontal: 16 }}>
            <TopBar title="Select Client" right={<Btn small variant="ghost" title="Close" onPress={() => setPickClient(false)} />} />
            <SearchBar value={search} onChangeText={setSearch} placeholder="Search clients…" />
            <ScrollView keyboardShouldPersistTaps="handled">
              {shown.map((c) => (
                <Card key={c.id} pad={14} style={{ marginBottom: 8 }} onPress={() => { setClientId(c.id); setPickClient(false); setSearch(''); }}>
                  <T weight="700" size={15}>{c.companyName}</T>
                  {c.contactPerson ? <T size={12.5} color={C.faint}>{c.contactPerson}</T> : null}
                </Card>
              ))}
              <Btn variant="ghost" title="Add new client" icon="user-plus" onPress={() => { setPickClient(false); router.push('/client/form'); }} />
            </ScrollView>
          </View>
        </Screen>
      </Modal>
    </Screen>
  );
}
