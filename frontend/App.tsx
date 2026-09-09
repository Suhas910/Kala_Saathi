// App.tsx
import React, { useEffect } from 'react';
import { MD3LightTheme as DefaultTheme, PaperProvider } from 'react-native-paper';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import RootNavigator from './src/app/RootNavigator';
import { initDatabase } from './src/services/database';
import { colors } from './src/theme';

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    secondary: colors.secondary,
    background: colors.background,
    error: colors.error,
    surface: colors.surface,
  },
};

const queryClient = new QueryClient();

export default function App() {
  // Initialize SQLite local draft + outbox tables on boot
  useEffect(() => {
    initDatabase();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <PaperProvider
        theme={theme}
        settings={{ icon: (props) => <MaterialCommunityIcons {...props} /> }}
      >
        <RootNavigator />
      </PaperProvider>
    </QueryClientProvider>
  );
}