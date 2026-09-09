// src/features/SignInScreen.tsx

import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, useTheme } from 'react-native-paper';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../../store/authStore';
import { UserRole } from '../../types/contracts';

export default function SignInScreen() {
  const setAuth = useAuthStore((state) => state.setAuth);
  const theme = useTheme();
  const [loadingRole, setLoadingRole] = useState<UserRole | null>(null);

  // Assumption: Demo-safe login bypassing real network auth for MVP prototyping, 
  // but strictly storing the token to trigger our Role-Gated navigation.
  const handleDemoLogin = async (role: UserRole) => {
    setLoadingRole(role);
    try {
      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 800));
      
      const mockToken = `demo_token_${role}_123`;
      const mockUserId = `user_uuid_${role}`;
      
      // Store token securely exactly as a real auth flow would
      await SecureStore.setItemAsync('userToken', mockToken);
      
      // Hydrate Zustand store, which will trigger RootNavigator to switch stacks
      setAuth(mockToken, role, mockUserId);
    } catch (error) {
      console.error('Login failed', error);
      // Assumption: In a real scenario, we never expose raw model errors to the artisan.
    } finally {
      setLoadingRole(null);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text variant="displaySmall" style={[styles.title, { color: theme.colors.primary }]}>
        Karigari Connect
      </Text>
      <Text variant="bodyLarge" style={styles.subtitle}>
        Select your role to continue
      </Text>

      <Button
        mode="contained"
        onPress={() => handleDemoLogin('artisan')}
        loading={loadingRole === 'artisan'}
        disabled={loadingRole !== null}
        style={styles.button}
        buttonColor={theme.colors.primary}
      >
        Sign in as Artisan
      </Button>

      <Button
        mode="outlined"
        onPress={() => handleDemoLogin('coordinator')}
        loading={loadingRole === 'coordinator'}
        disabled={loadingRole !== null}
        style={styles.button}
        textColor={theme.colors.secondary}
      >
        Sign in as Coordinator
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    textAlign: 'center',
    fontWeight: 'bold',
    marginBottom: 8,
    fontFamily: 'Baloo 2', // Enforcing the mandatory brand typography 
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 48,
  },
  button: {
    marginVertical: 8,
    paddingVertical: 6,
  },
});