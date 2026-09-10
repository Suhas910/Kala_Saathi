// src/features/onboarding/SignInScreen.tsx
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, Card } from 'react-native-paper';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../../store/authStore';
import { UserRole } from '../../types/contracts';
import { colors, spacing } from '../../theme';

export default function SignInScreen() {
  const setAuth = useAuthStore((state) => state.setAuth);
  const [loadingRole, setLoadingRole] = useState<UserRole | null>(null);

  const handleDemoLogin = async (role: UserRole) => {
    setLoadingRole(role);
    try {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const mockToken = `demo_token_${role}_123`;
      const mockUserId = `user_uuid_${role}`;
      await setAuth(mockToken, role, mockUserId);
    } catch (error) {
      console.error('Login failed', error);
    } finally {
      setLoadingRole(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="headlineMedium" style={styles.title}>
          Karigari Connect
        </Text>
        <Text style={styles.subtitle}>
          Smart Cataloging & Market Linkage
        </Text>
      </View>

      <View style={styles.cardsContainer}>
        <Card style={styles.roleCard}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.roleTitle}>
              Artisan
            </Text>
            <Text style={styles.roleDescription}>
              Photograph your products, speak details in your language, and generate fair-priced listings.
            </Text>
            <Button
              mode="contained"
              onPress={() => handleDemoLogin('artisan')}
              loading={loadingRole === 'artisan'}
              disabled={loadingRole !== null}
              buttonColor={colors.primary}
              style={styles.actionBtn}
            >
              Continue as Artisan
            </Button>
          </Card.Content>
        </Card>

        <Card style={styles.roleCard}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.roleTitle}>
              Cluster Coordinator
            </Text>
            <Text style={styles.roleDescription}>
              Review submitted listings, verify craft provenance claims, and publish to ONDC.
            </Text>
            <Button
              mode="contained"
              onPress={() => handleDemoLogin('coordinator')}
              loading={loadingRole === 'coordinator'}
              disabled={loadingRole !== null}
              buttonColor={colors.secondary}
              textColor="#FFFFFF"
              style={styles.actionBtn}
            >
              Continue as Coordinator
            </Button>
          </Card.Content>
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
    marginTop: spacing.xxl,
    marginBottom: spacing.lg,
  },
  title: {
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  cardsContainer: {
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  roleCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 0,
  },
  roleTitle: {
    color: colors.text,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  roleDescription: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  actionBtn: {
    minHeight: spacing.tapTarget,
    justifyContent: 'center',
    borderRadius: 8,
  },
});