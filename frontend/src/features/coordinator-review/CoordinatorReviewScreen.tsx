// src/features/coordinator-review/CoordinatorReviewScreen.tsx
import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, Card, TextInput, ActivityIndicator } from 'react-native-paper';
import { useNavigation, useRoute } from '@react-navigation/native';
import { colors, spacing } from '../../theme';
import type { Claim } from '../../types/contracts';
import { service } from '../../services';

export default function CoordinatorReviewScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  // @ts-expect-error — typed nav params land once types/navigation.ts is filled
  const { listingId = 'mock_listing_123' } = route.params ?? {};

  const [loading, setLoading] = useState(false);
  const [evidenceNotes, setEvidenceNotes] = useState<Record<string, string>>({});
  const [claimDecisions, setClaimDecisions] = useState<Record<string, 'verified' | 'rejected'>>({});
  const [listingReason, setListingReason] = useState('');

  // Use mock claims pending mockApi.ts getListing expansion
  const mockClaims: Claim[] = [
    { claim: 'handloom_weave', asserted_by_artisan: true, coordinator_verified: false, evidence_note: null },
    { claim: 'natural_dye', asserted_by_artisan: true, coordinator_verified: false, evidence_note: null }
  ];
const handleClaimDecision = async (claimId: string, decision: 'verified' | 'rejected') => {
  setClaimDecisions(prev => ({ ...prev, [claimId]: decision }));
  await service.reviewClaim(listingId, claimId, {
    decision,
    evidence_note: evidenceNotes[claimId] ?? '',
    reason: decision === 'rejected' ? 'Insufficient evidence' : null,
  });
};

const handleListingDecision = async (decision: 'approved' | 'rejected') => {
  setLoading(true);
  try {
    await service.decideApproval(listingId, { decision, reason: listingReason });
    navigation.goBack();
  } finally {
    setLoading(false);
  }
};

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text variant="titleLarge" style={styles.title}>Review Queue</Text>
      
      <Text variant="titleMedium" style={styles.sectionTitle}>Sensitive Claims</Text>
      {mockClaims.map((c) => (
        <Card key={c.claim} style={styles.card}>
          <Card.Content>
            <Text style={styles.claimText}>Claim: {c.claim}</Text>
            <TextInput
              mode="outlined"
              label="Evidence Note"
              value={evidenceNotes[c.claim] || ''}
              onChangeText={(text) => setEvidenceNotes(prev => ({ ...prev, [c.claim]: text }))}
              style={styles.input}
            />
            <View style={styles.row}>
              <Button
                mode={claimDecisions[c.claim] === 'verified' ? 'contained' : 'outlined'}
                onPress={() => handleClaimDecision(c.claim, 'verified')}
                buttonColor={claimDecisions[c.claim] === 'verified' ? colors.success : undefined}
                textColor={claimDecisions[c.claim] === 'verified' ? '#FFF' : colors.success}
                style={styles.pill}
              >
                Verify
              </Button>
              <Button
                mode={claimDecisions[c.claim] === 'rejected' ? 'contained' : 'outlined'}
                onPress={() => handleClaimDecision(c.claim, 'rejected')}
                buttonColor={claimDecisions[c.claim] === 'rejected' ? colors.error : undefined}
                textColor={claimDecisions[c.claim] === 'rejected' ? '#FFF' : colors.error}
                style={styles.pill}
              >
                Reject
              </Button>
            </View>
          </Card.Content>
        </Card>
      ))}

      <Text variant="titleMedium" style={styles.sectionTitle}>Final Decision</Text>
      <TextInput
        mode="outlined"
        label="Reason (Required for rejection)"
        value={listingReason}
        onChangeText={setListingReason}
        style={styles.input}
        multiline
      />
      
      <View style={styles.row}>
        <Button
          mode="contained"
          onPress={() => handleListingDecision('approved')}
          buttonColor={colors.primary}
          style={styles.actionBtn}
        >
          Approve
        </Button>
        <Button
          mode="outlined"
          onPress={() => handleListingDecision('rejected')}
          textColor={colors.error}
          style={styles.actionBtn}
        >
          Reject
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, backgroundColor: colors.background, flexGrow: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  title: { color: colors.text, marginBottom: spacing.lg, fontFamily: 'Baloo 2' },
  sectionTitle: { color: colors.text, marginTop: spacing.md, marginBottom: spacing.sm, fontWeight: 'bold' },
  card: { backgroundColor: colors.surface, borderRadius: 16, marginBottom: spacing.md },
  claimText: { color: colors.text, fontWeight: 'bold', marginBottom: spacing.sm },
  input: { backgroundColor: colors.background, marginBottom: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  pill: { flex: 1, borderRadius: 24 },
  actionBtn: { flex: 1, minHeight: spacing.tapTarget, justifyContent: 'center' }
});