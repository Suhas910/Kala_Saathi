// src/features/publish-export/PublishExportScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, Card, ActivityIndicator } from 'react-native-paper';
import { useRoute, useNavigation, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { CoordinatorStackParamList } from '../../types/navigation';
import { colors, spacing } from '../../theme';
import type { ExportResult } from '../../types/contracts';
import { service } from '../../services';
import { ErrorRetryCard } from '../../components';

export default function PublishExportScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<CoordinatorStackParamList>>();
  const route = useRoute<RouteProp<CoordinatorStackParamList, 'PublishExport'>>();
  const { listingId } = route.params;

  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = async () => {
    setLoading(true);
    setExportError(null);
    try {
      const res = await service.requestExport(listingId, { target: 'ondc_retail', schema_version: '1.0.0' });
      setExportResult(res);
    } catch (err) {
      // Contract: EXPORT_CONTRACT_INVALID -> "show export not ready; do not claim marketplace publication."
      setExportError('Export not ready. The listing payload did not pass validation — check with coordinator before retrying.');
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

      {exportError && !loading && (
        <ErrorRetryCard
          asCard
          errorText={exportError}
          onRetry={handleExport}
          retryLabel="Retry Export"
        />
      )}

      {exportResult && (
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Export Status</Text>

            {/* NOTE: status 'submitted'/'exported' values in types/contracts.ts are NOT confirmed by
                AI_INTERFACE_CONTRACTS.md — doc only documents status:"validated" as an example.
                Flagged to backend/integration owner. Stepper below leans on network_submission
                instead, since contract explicitly documents that field's states (not_attempted/
                pending/success/failed) — safer source of truth until confirmed. */}
            <View style={styles.step}>
              <View style={[styles.dot, exportResult.contract_validation.passed ? styles.activeBg : styles.inactiveBg]} />
              <Text style={styles.text}>1. Validated (Schema match)</Text>
            </View>

            <View style={styles.step}>
              <View style={[styles.dot, exportResult.network_submission === 'pending' || exportResult.network_submission === 'success' ? styles.activeBg : styles.inactiveBg]} />
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
              <Text style={styles.metaText}>Hash: {exportResult.payload_hash ? `${exportResult.payload_hash.substring(0, 10)}...` : 'N/A'}</Text>
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
  metaText: { fontSize: 12, color: colors.secondary },
  errorText: { color: colors.error, marginBottom: spacing.sm }
});