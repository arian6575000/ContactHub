import React, { useState } from 'react';
import { Linking, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as repo from '../../db/repo';
import { useApp } from '../../ctx/AppContext';
import { Fmt } from '../../lib/format';
import { C } from '../../lib/theme';
import { ActionSheet, Avatar, Badge, Btn, Card, IconBtn, KV, Loading, Row, Screen, SectionLabel, T, TopBar, confirmDialog, useLoad } from '../../ui/kit';

export default function ClientDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { toast } = useApp();
  const [menu, setMenu] = useState(false);
  const { data } = useLoad(async () => {
    const client = await repo.getClient(id);
    return { client, contracts: client ? await repo.listContractsForClient(id) : [] };
  }, [id]);

  if (!data) return <Screen><Loading /></Screen>;
  if (!data.client) return <Screen><TopBar title="Client" back /><T color={C.faint}>This client no longer exists.</T></Screen>;
  const { client, contracts } = data;
  const total = contracts.reduce((s, c) => s + c.amount, 0);

  const remove = async () => {
    if (!(await confirmDialog('This removes the client. Clients that still have contracts cannot be deleted.'))) return;
    try { await repo.deleteClient(client.id); toast('Client deleted'); router.back(); }
    catch (e: any) { toast(e.message, 'error'); }
  };

  return (
    <Screen>
      <TopBar title="Client" back right={<IconBtn icon="more-horizontal" onPress={() => setMenu(true)} />} />
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar name={client.companyName} size={58} />
        <View style={{ flex: 1 }}>
          <T size={19} weight="800">{client.companyName}</T>
          <T size={13} color={C.faint}>{client.contactPerson || 'No contact person set'}</T>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            {client.phone ? <IconBtn icon="phone" onPress={() => Linking.openURL(`tel:${client.phone}`)} /> : null}
            {client.email ? <IconBtn icon="mail" onPress={() => Linking.openURL(`mailto:${client.email}`)} /> : null}
          </View>
        </View>
      </Card>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Card style={{ flex: 1 }} pad={14}><T size={22} weight="800">{contracts.length}</T><T size={12.5} color={C.faint} weight="600">Contracts</T></Card>
        <Card style={{ flex: 1.4 }} pad={14}><T size={18} weight="800">{Fmt.money(total, contracts[0]?.currency)}</T><T size={12.5} color={C.faint} weight="600">Total value</T></Card>
      </View>

      <Card pad={14}>
        {client.phone ? <KV k="Phone" v={client.phone} /> : null}
        {client.email ? <KV k="Email" v={client.email} /> : null}
        {client.address ? <KV k="Address" v={client.address} /> : null}
        {client.city ? <KV k="City" v={client.city} /> : null}
        {client.notes ? <KV k="Notes" v={client.notes} /> : null}
        {!client.phone && !client.email && !client.address && !client.city && !client.notes
          ? <T color={C.faint} size={13}>No additional details yet.</T> : null}
      </Card>

      <SectionLabel right={<Btn small title="New" icon="plus" onPress={() => router.push(`/contract/form?clientId=${client.id}`)} />}>Contracts</SectionLabel>
      <Card pad={14}>
        {contracts.length ? contracts.map((c, i) => (
          <Row key={c.id} title={c.softwareName || 'Untitled contract'} sub={c.contractNumber} trail={Fmt.money(c.amount, c.currency)}
            trailSub={<Badge status={c.status} />} last={i === contracts.length - 1} onPress={() => router.push(`/contract/${c.id}`)} />
        )) : <T color={C.faint} style={{ textAlign: 'center', padding: 16 }}>No contracts yet for this client.</T>}
      </Card>

      <ActionSheet visible={menu} title="Client Options" onClose={() => setMenu(false)} actions={[
        { label: 'Edit Client', icon: 'edit-2', onPress: () => router.push(`/client/form?id=${client.id}`) },
        { label: 'Delete Client', icon: 'trash-2', danger: true, onPress: remove },
      ]} />
    </Screen>
  );
}
