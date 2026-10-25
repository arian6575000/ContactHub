import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import * as repo from '../../db/repo';
import { Fmt } from '../../lib/format';
import { STATUSES, type ContractStatus } from '../../db/types';
import { Badge, Btn, Card, Chip, Empty, IconBtn, Loading, Row, Screen, SearchBar, TopBar, useLoad } from '../../ui/kit';

export default function ContractsTab() {
  const { data } = useLoad(async () => {
    const [contracts, clients] = await Promise.all([repo.listContracts(), repo.listClients()]);
    return { contracts, names: new Map(clients.map((c) => [c.id, c.companyName])), hasClients: clients.length > 0 };
  });
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ContractStatus | 'all'>('all');

  const list = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    return data.contracts.filter((c) => {
      if (status !== 'all' && c.status !== status) return false;
      if (!term) return true;
      return [c.softwareName, c.contractNumber, data.names.get(c.clientId)].join(' ').toLowerCase().includes(term);
    });
  }, [data, q, status]);

  const add = () => (data?.hasClients ? router.push('/contract/form') : router.push('/client/form'));

  return (
    <Screen>
      <TopBar title="Contracts" right={<IconBtn icon="plus" onPress={add} />} />
      <SearchBar value={q} onChangeText={setQ} placeholder="Search by client, title or number…" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
        <Chip label="All" on={status === 'all'} onPress={() => setStatus('all')} />
        {STATUSES.map((s) => <Chip key={s} label={Fmt.status(s)} on={status === s} onPress={() => setStatus(s)} />)}
      </ScrollView>
      {!data ? <Loading /> : list.length === 0 ? (
        <Empty icon={q || status !== 'all' ? 'search' : 'file-text'}
          title={q || status !== 'all' ? 'No matches' : 'No contracts yet'}
          text={q || status !== 'all' ? 'Try a different search or filter.' : data.hasClients ? 'Create a contract for a client to see it here.' : 'Add a client first, then create a contract.'}
          action={q || status !== 'all' ? undefined : <Btn small title={data.hasClients ? 'New Contract' : 'Add Client'} icon="plus" onPress={add} />} />
      ) : (
        <Card pad={14}>
          {list.map((c, i) => (
            <Row key={c.id} avatar={data.names.get(c.clientId) ?? c.softwareName} title={c.softwareName || 'Untitled contract'}
              sub={`${data.names.get(c.clientId) ?? 'Unknown client'} · ${c.contractNumber}`}
              trail={Fmt.money(c.amount, c.currency)} trailSub={<Badge status={c.status} />}
              last={i === list.length - 1} onPress={() => router.push(`/contract/${c.id}`)} />
          ))}
        </Card>
      )}
      <View />
    </Screen>
  );
}
