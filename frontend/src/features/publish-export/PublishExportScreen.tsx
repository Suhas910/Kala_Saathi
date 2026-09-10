// src/features/publish-export/PublishExportScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, Card, ActivityIndicator } from 'react-native-paper';
import { useRoute, useNavigation } from '@react-navigation/native';
import { colors, spacing } from '../../theme';
import type { ExportResult } from '../../types/contracts';
import { service } from '../../services';

export default function PublishExportScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  // @ts-expect-error — typed nav params later
  const { listingId = 'mock_listing_123' } = route.params ?? {};

  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
  setLoading(true);
  try {
    const res = await service.requestExport(listingId, { target: 'ondc_retail', schema_version: '1.0.0' });
    setExportResult(res);
  } finally {
    setLoading(false);
  }
};

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text variant="titleLarge" style={styles.title}>Export Listing</Text>

      {!exportResult && !loading && (
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.text}>Listing approved. Ready for marketplace export.</Text>
            <Button
              mode="contained"
              onPress={handleExport}
              buttonColor={colors.primary}
              style={styles.btn}
            >
              Start Export
            </Button>
          </Card.Content>
        </Card>
      )}

      {loading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.text}>Processing export...</Text>
        </View>
      )}

      {exportResult && (
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Export Status</Text>
            
            <View style={styles.step}>
              <View style={[styles.dot, exportResult.contract_validation.passed ? styles.activeBg : styles.inactiveBg]} />
              <Text style={styles.text}>1. Validated (Schema match)</Text>
            </View>

            <View style={styles.step}>
              <View style={[styles.dot, exportResult.status === 'submitted' || exportResult.status === 'exported' ? styles.activeBg : styles.inactiveBg]} />
              <Text style={styles.text}>2. Submitted (Sent to network)</Text>
            </View>

            <View style={styles.step}>
              <View style={[styles.dot, exportResult.network_submission === 'success' ? styles.activeBg : styles.inactiveBg]} />
              <Text style={styles.text}>
                3. Exported 
                {exportResult.network_submission === 'success' ? ' (Published to ONDC)' : ' (Pending network confirm)'}
              </Text>
            </View>

            <View style={styles.metaBox}>
              <Text style={styles.metaText}>Target: {exportResult.target}</Text>
              <Text style={styles.metaText}>Hash: {exportResult.payload_hash.substring(0, 10)}...</Text>
            </View>

            <Button mode="outlined" onPress={() => navigation.goBack()} textColor={colors.secondary} style={styles.btn}>
              Return to Dashboard
            </Button>
          </Card.Content>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, backgroundColor: colors.background, flexGrow: 1 },
  centered: { padding: spacing.xl, alignItems: 'center' },
  title: { color: colors.text, marginBottom: spacing.lg, fontFamily: 'Baloo 2' },
  sectionTitle: { color: colors.text, marginBottom: spacing.md, fontWeight: 'bold' },
  card: { backgroundColor: colors.surface, borderRadius: 16, marginBottom: spacing.md },
  text: { color: colors.text, marginTop: spacing.xs },
  btn: { marginTop: spacing.md, minHeight: spacing.tapTarget, justifyContent: 'center' },
  step: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.sm, gap: spacing.md },
  dot: { width: 16, height: 16, borderRadius: 8 },
  activeBg: { backgroundColor: colors.success },
  inactiveBg: { backgroundColor: '#E0E0E0' },
  metaBox: { backgroundColor: '#EDE7DD', padding: spacing.sm, borderRadius: 8, marginTop: spacing.lg },
  metaText: { fontSize: 12, color: colors.secondary }
});