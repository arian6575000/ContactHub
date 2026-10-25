import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as repo from '../../db/repo';
import { useApp } from '../../ctx/AppContext';
import { Fmt } from '../../lib/format';
import { C, STATUS_COLOR } from '../../lib/theme';
import { printContract, shareContractPdf } from '../../lib/pdf';
import type { PdfLang } from '../../lib/pdfDict';
import { STATUSES } from '../../db/types';
import { ActionSheet, Avatar, Badge, Btn, Card, Chip, IconBtn, KV, Loading, Screen, SectionLabel, Segmented, T, TopBar, confirmDialog, useLoad } from '../../ui/kit';

export default function ContractDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { toast } = useApp();
  const [menu, setMenu] = useState(false);
  const [lang, setLang] = useState<PdfLang>('en');
  const [busy, setBusy] = useState<'share' | 'print' | null>(null);

  const { data, reload } = useLoad(async () => {
    const contract = await repo.getContract(id);
    if (!contract) return { contract: null, client: null, settings: await repo.getSettings() };
    const [client, settings] = await Promise.all([repo.getClient(contract.clientId), repo.getSettings()]);
    return { contract, client, settings };
  }, [id]);

  if (!data) return <Screen><Loading /></Screen>;
  const { contract, client, settings } = data;
  if (!contract) return <Screen><TopBar title="Contract" back /><T color={C.faint}>This contract no longer exists.</T></Screen>;

  const paid = contract.schedule.filter((s) => s.paidAt).reduce((a, s) => a + s.amount, 0);
  const terms = contract.termsAndConditions ?? settings.defaultTerms;

  const run = (kind: 'share' | 'print') => async () => {
    setBusy(kind);
    try {
      if (kind === 'share') await shareContractPdf(contract, client, settings, lang);
      else await printContract(contract, client, settings, lang);
    } catch (e: any) { toast(e?.message || 'Could not generate PDF', 'error'); }
    setBusy(null);
  };

  const remove = async () => {
    if (!(await confirmDialog('This will delete the contract.'))) return;
    await repo.deleteContract(contract.id);
    toast('Contract deleted');
    router.replace('/contracts');
  };

  return (
    <Screen>
      <TopBar title="Contract" back right={<IconBtn icon="more-horizontal" onPress={() => setMenu(true)} />} />

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <T size={12.5} weight="800" color={C.faint}>{contract.contractNumber}</T>
            <T size={19} weight="800" style={{ marginTop: 3 }}>{contract.softwareName || 'Untitled contract'}</T>
          </View>
          <Badge status={contract.status} />
        </View>
        {client ? (
          <Pressable onPress={() => router.push(`/client/${client.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 }}>
            <Avatar name={client.companyName} size={40} />
            <View style={{ flex: 1 }}>
              <T weight="700">{client.companyName}</T>
              <T size={12.5} color={C.faint}>{client.contactPerson || 'View client'}</T>
            </View>
            <Feather name="chevron-right" size={18} color={C.faint} />
          </Pressable>
        ) : null}
      </Card>

      <SectionLabel>Status</SectionLabel>
      <Card pad={12}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {STATUSES.map((s) => (
            <Chip key={s} label={Fmt.status(s)} on={contract.status === s} color={STATUS_COLOR[s]}
              onPress={async () => { await repo.setContractStatus(contract.id, s); toast(`Status set to ${Fmt.status(s)}`); reload(); }} />
          ))}
        </View>
      </Card>

      <SectionLabel>Contract Details</SectionLabel>
      <Card pad={14}>
        {contract.scopeDescription ? <T size={13.5} color={C.soft} style={{ lineHeight: 21, marginBottom: 10 }}>{contract.scopeDescription}</T> : null}
        <KV k="Total Amount" v={Fmt.money(contract.amount, contract.currency)} />
        <KV k="Payment Type" v={contract.paymentType === 'installments' ? 'Installments' : 'Full Payment'} />
        <KV k="Start Date" v={Fmt.date(contract.startDate)} />
        <KV k="Delivery Date" v={Fmt.date(contract.deliveryDate)} />
        <KV k="Support Period" v={`${contract.supportPeriodMonths} month${contract.supportPeriodMonths === 1 ? '' : 's'}`} />
      </Card>

      {contract.paymentType === 'installments' && contract.schedule.length ? (
        <>
          <SectionLabel right={<T size={12.5} weight="800" color={C.success}>{Fmt.money(paid, contract.currency)} received</T>}>Payment Schedule</SectionLabel>
          <Card pad={14}>
            {contract.schedule.map((p, i) => {
              const late = !p.paidAt && p.dueDate != null && p.dueDate < Date.now();
              return (
                <Pressable key={i} onPress={async () => { await repo.setInstallmentPaid(contract.id, i, !p.paidAt); reload(); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: i === contract.schedule.length - 1 ? 0 : 1, borderBottomColor: C.line }}>
                  <Feather name={p.paidAt ? 'check-circle' : 'circle'} size={22} color={p.paidAt ? C.success : late ? C.danger : C.faint} />
                  <View style={{ flex: 1 }}>
                    <T weight="700" size={14}>{p.label || 'Installment'}</T>
                    <T size={12.5} color={late ? C.danger : C.faint}>
                      {p.paidAt ? `Paid ${Fmt.date(p.paidAt, true)}` : `${late ? 'Overdue · ' : 'Due '}${Fmt.date(p.dueDate, true)}`}
                    </T>
                  </View>
                  <T weight="800">{Fmt.money(p.amount, contract.currency)}</T>
                </Pressable>
              );
            })}
            <T size={12} color={C.faint} style={{ marginTop: 8 }}>Tap an installment to mark it paid / unpaid.</T>
          </Card>
        </>
      ) : null}

      {contract.notes ? (<><SectionLabel>Internal Notes</SectionLabel><Card><T size={13.5} color={C.soft} style={{ lineHeight: 21 }}>{contract.notes}</T></Card></>) : null}

      <SectionLabel>Terms & Conditions</SectionLabel>
      <Card><T size={13} color={C.soft} style={{ lineHeight: 21 }}>{terms}</T></Card>

      <SectionLabel>Contract PDF</SectionLabel>
      <Card>
        <T size={13} weight="700" color={C.soft} style={{ marginBottom: 6 }}>PDF language</T>
        <Segmented value={lang} onChange={setLang} options={[{ value: 'en', label: 'English' }, { value: 'ur', label: 'اردو' }]} />
        <View style={{ height: 14 }} />
        <Btn title="Share / Save PDF" icon="share-2" onPress={run('share')} loading={busy === 'share'} disabled={busy !== null} />
        <Btn title="Print" icon="printer" variant="ghost" onPress={run('print')} loading={busy === 'print'} disabled={busy !== null} style={{ marginBottom: 0 }} />
      </Card>

      <ActionSheet visible={menu} title="Contract Options" onClose={() => setMenu(false)} actions={[
        { label: 'Edit Contract', icon: 'edit-2', onPress: () => router.push(`/contract/form?id=${contract.id}`) },
        { label: 'Delete Contract', icon: 'trash-2', danger: true, onPress: remove },
      ]} />
    </Screen>
  );
}
