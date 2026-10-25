import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as repo from '../../db/repo';
import { Fmt } from '../../lib/format';
import { C, STATUS_COLOR } from '../../lib/theme';
import { STATUSES } from '../../db/types';
import { Badge, Btn, Card, IconBtn, Loading, Row, Screen, SectionLabel, T, TopBar, useLoad } from '../../ui/kit';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

function Stat({ icon, color, value, label }: { icon: React.ComponentProps<typeof Feather>['name']; color: string; value: string | number; label: string }) {
  return (
    <Card style={{ width: '48.5%', marginBottom: 12 }} pad={14}>
      <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: `${color}22`, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name={icon} size={18} color={color} />
      </View>
      <T size={24} weight="800" style={{ marginTop: 10 }}>{value}</T>
      <T size={12.5} color={C.faint} weight="600">{label}</T>
    </Card>
  );
}

export default function Dashboard() {
  const { data } = useLoad(async () => {
    const [stats, settings, clients] = await Promise.all([repo.dashboardStats(), repo.getSettings(), repo.listClients()]);
    return { stats, settings, names: new Map(clients.map((c) => [c.id, c.companyName])) };
  });
  if (!data) return <Screen><Loading /></Screen>;
  const { stats, settings, names } = data;
  const cur = settings.currency;

  return (
    <Screen>
      <TopBar title={settings.companyName || 'ContractHub'} subtitle={greeting()}
        right={<IconBtn icon="settings" onPress={() => router.navigate('/settings')} />} />

      <Card style={{ backgroundColor: C.primary, borderColor: C.primary }} pad={20}>
        <T size={12.5} weight="700" color="rgba(255,255,255,0.8)">TOTAL CONTRACT VALUE</T>
        <T size={30} weight="800" color="#fff" style={{ marginTop: 6 }}>{Fmt.money(stats.totalValue, cur)}</T>
        <T size={12.5} color="rgba(255,255,255,0.8)" style={{ marginTop: 6 }}>
          {stats.contractCount} contract{stats.contractCount === 1 ? '' : 's'} · {stats.clientCount} client{stats.clientCount === 1 ? '' : 's'}
        </T>
      </Card>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <Stat icon="check-circle" color={C.success} value={Fmt.money(stats.received, cur)} label="Payments received" />
        <Stat icon="clock" color={C.warning} value={Fmt.money(stats.outstanding, cur)} label="Outstanding" />
        <Stat icon="award" color={C.primary2} value={stats.active} label="Active / Signed" />
        <Stat icon="calendar" color={C.primary} value={stats.thisMonth} label="New this month" />
      </View>

      {stats.overdue.length || stats.upcoming.length ? (
        <>
          <SectionLabel>Payments</SectionLabel>
          <Card pad={14}>
            {[...stats.overdue.map((p) => ({ p, late: true })), ...stats.upcoming.map((p) => ({ p, late: false }))].slice(0, 6).map(({ p, late }, i, arr) => (
              <Row key={`${p.contractId}-${p.index}`} last={i === arr.length - 1}
                title={`${p.clientName || p.contractNumber} · ${p.label || 'Installment'}`}
                sub={`${late ? 'Overdue since' : 'Due'} ${Fmt.date(p.dueDate, true)}`}
                trail={<T weight="800" size={13.5} color={late ? C.danger : C.ink}>{Fmt.money(p.amount, p.currency)}</T>}
                onPress={() => router.push(`/contract/${p.contractId}`)} />
            ))}
          </Card>
        </>
      ) : null}

      <SectionLabel>Status breakdown</SectionLabel>
      <Card style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {STATUSES.map((s) => (
          <View key={s} style={{ backgroundColor: `${STATUS_COLOR[s]}22`, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999 }}>
            <T size={12} weight="800" color={STATUS_COLOR[s]}>{Fmt.status(s)} · {stats.byStatus[s] || 0}</T>
          </View>
        ))}
      </Card>

      <SectionLabel>Recent contracts</SectionLabel>
      <Card pad={14}>
        {stats.recent.length ? stats.recent.map((c, i) => (
          <Row key={c.id} avatar={names.get(c.clientId) ?? '?'} title={c.softwareName || 'Untitled contract'}
            sub={`${names.get(c.clientId) ?? 'Unknown client'} · ${c.contractNumber}`}
            trail={Fmt.money(c.amount, c.currency)} trailSub={<Badge status={c.status} />}
            last={i === stats.recent.length - 1} onPress={() => router.push(`/contract/${c.id}`)} />
        )) : <T color={C.faint} style={{ textAlign: 'center', padding: 18 }}>Create your first client and contract to see it here.</T>}
      </Card>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        <Btn title="New Contract" icon="plus" style={{ flex: 1 }} onPress={() => router.push('/contract/form')} />
        <Btn title="New Client" icon="user-plus" variant="ghost" style={{ flex: 1 }} onPress={() => router.push('/client/form')} />
      </View>
    </Screen>
  );
}
