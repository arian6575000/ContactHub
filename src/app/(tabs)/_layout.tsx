import React from 'react';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../../lib/theme';

type Icon = React.ComponentProps<typeof Feather>['name'];
const tab = (title: string, icon: Icon) => ({
  title,
  tabBarIcon: ({ color, size }: { color: any; size: number }) => <Feather name={icon} size={size} color={color} />,
});

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: C.primary,
      tabBarInactiveTintColor: C.faint,
      tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      tabBarStyle: {
        position: 'absolute', left: 14, right: 14, bottom: Math.max(insets.bottom, 10), height: 64, borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.94)', borderTopWidth: 0, paddingBottom: Platform.OS === 'ios' ? 8 : 6, paddingTop: 6,
        shadowColor: '#1F2850', shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 10,
      },
    }}>
      <Tabs.Screen name="index" options={tab('Home', 'grid')} />
      <Tabs.Screen name="clients" options={tab('Clients', 'users')} />
      <Tabs.Screen name="contracts" options={tab('Contracts', 'file-text')} />
      <Tabs.Screen name="settings" options={tab('Settings', 'settings')} />
    </Tabs>
  );
}
