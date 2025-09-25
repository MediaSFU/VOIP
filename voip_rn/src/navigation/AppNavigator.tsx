import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import DashboardScreen from '../screens/DashboardScreen';
import CallsScreen from '../screens/CallsScreen';
import HistoryScreen from '../screens/HistoryScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();

// Map route names to icon names
const ICONS: Record<string, string> = {
  Dashboard: 'home',
  Calls: 'call',
  History: 'time',
  Settings: 'settings',
};

// Factory that returns a stable tabBarIcon renderer for a given route name
const makeTabBarIcon = (routeName: string) =>
  ({ color, size }: { color: string; size: number }) => (
    <Ionicons name={(ICONS[routeName] || 'help') as any} size={size} color={color} />
  );

// Screen options factory moved out of component to avoid creating functions during render
const screenOptions = ({ route }: { route: { name: string } }) => ({
  headerStyle: { backgroundColor: '#f8f9fa' },
  headerTintColor: '#333',
  tabBarActiveTintColor: '#2196F3',
  tabBarInactiveTintColor: '#666',
  tabBarIcon: makeTabBarIcon(route.name),
});

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator screenOptions={screenOptions}>
        <Tab.Screen name="Dashboard" component={DashboardScreen} />
        <Tab.Screen name="Calls" component={CallsScreen} />
        <Tab.Screen name="History" component={HistoryScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
