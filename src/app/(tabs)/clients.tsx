import React, { useMemo, useState } from 'react';
import { router } from 'expo-router';
import * as repo from '../../db/repo';
import { Btn, Card, Empty, IconBtn, Loading, Row, Screen, SearchBar, T, TopBar, useLoad } from '../../ui/kit';

export default function ClientsTab() {
  const { data } = useLoad(() => repo.listClients());
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!data) return [];
    return term
      ? data.filter((c) => [c.companyName, c.contactPerson, c.phone, c.email, c.city].join(' ').toLowerCase().includes(term))
      : data;
  }, [data, q]);

  return (
    <Screen>
      <TopBar title="Clients" right={<IconBtn icon="plus" onPress={() => router.push('/client/form')} />} />
      <SearchBar value={q} onChangeText={setQ} placeholder="Search clients…" />
      {!data ? <Loading /> : list.length === 0 ? (
        <Empty icon={q ? 'search' : 'users'} title={q ? 'No matches' : 'No clients yet'}
          text={q ? 'Try a different search term.' : 'Add the businesses you sell software to, then create contracts for them.'}
          action={q ? undefined : <Btn small title="Add Client" icon="plus" onPress={() => router.push('/client/form')} />} />
      ) : (
        <Card pad={14}>
          {list.map((c, i) => (
            <Row key={c.id} avatar={c.companyName} title={c.companyName} last={i === list.length - 1}
              sub={c.contactPerson || c.phone || c.email || 'No contact info'}
              trail={String(c.contractCount)} trailSub={<T size={11} color="#8A8FA0">contract{c.contractCount === 1 ? '' : 's'}</T>}
              onPress={() => router.push(`/client/${c.id}`)} />
          ))}
        </Card>
      )}
    </Screen>
  );
}
