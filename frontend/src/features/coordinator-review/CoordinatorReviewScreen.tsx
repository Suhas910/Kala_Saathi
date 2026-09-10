// src/features/coordinator-review/CoordinatorReviewScreen.tsx
import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, Card, TextInput, ActivityIndicator } from 'react-native-paper';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { CoordinatorStackParamList } from '../../types/navigation';
import { colors, spacing } from '../../theme';
import type { Claim } from '../../types/contracts';
import { service } from '../../services';
import { ProcessingIndicator } from '../../components';

export default function CoordinatorReviewScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<CoordinatorStackParamList>>();
  const route = useRoute<RouteProp<CoordinatorStackParamList, 'CoordinatorDashboard'>>();
  const listingId = 'mock_listing_123';

  const [loading, setLoading] = useState(false);
  const [evidenceNotes, setEvidenceNotes] = useState<Record<string, string>>({});
  const [claimDecisions, setClaimDecisions] = useState<Record<string, 'verified' | 'rejected'>>({});
  const [listingReason, setListingReason] = useState('');

  // TODO: Replace mock with backend API integration — pull from getListing(listingId).claims once endpoint live.
  const mockClaims: Claim[] = [
    { claim: 'handloom_weave', asserted_by_artisan: true, coordinator_verified: false, evidence_note: null },
    { claim: 'natural_dye', asserted_by_artisan: true, coordinator_verified: false, evidence_note: null }
  ];

  const [claimError, setClaimError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);

  // Hard rule (build guide): sensitive claims cannot publish without evidence + verification.
  // Block listing approval until every claim has an explicit decision.
  const allClaimsDecided = mockClaims.every((c) => claimDecisions[c.claim]);

  const handleClaimDecision = async (claimId: string, decision: 'verified' | 'rejected') => {
    setClaimError(null);
    const prevDecision = claimDecisions[claimId];
    setClaimDecisions(prev => ({ ...prev, [claimId]: decision }));
    try {
      await service.reviewClaim(listingId, claimId, {
        decision,
        evidence_note: evidenceNotes[claimId] ?? '',
        reason: decision === 'rejected' ? 'Insufficient evidence' : null,
      });
    } catch (err) {
      // Revert optimistic update on failure — never show a claim as decided if backend didn't confirm it.
      setClaimDecisions(prev => {
        const next = { ...prev };
        if (prevDecision) next[claimId] = prevDecision;
        else delete next[claimId];
        return next;
      });
      setClaimError('Could not save claim decision. Check connection and try again.');
    }
  };

  const handleListingDecision = async (decision: 'approved' | 'rejected') => {
    if (decision === 'approved' && !allClaimsDecided) {
      setClaimError('Resolve every claim (Verify or Reject) before approving the listing.');
      return;
    }
    if (decision === 'rejected' && !listingReason.trim()) {
      setReasonError('Reason is required to reject a listing.');
      return;
    }
    setReasonError(null);
    setClaimError(null);
    setLoading(true);
    try {
      await service.decideApproval(listingId, { decision, reason: listingReason });
      navigation.goBack();
    } catch (err) {
      setClaimError('Could not submit decision. Check connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <ProcessingIndicator />;
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text variant="titleLarge" style={styles.title}>Review Queue</Text>
      
      <Text variant="titleMedium" style={styles.sectionTitle}>Sensitive Claims</Text>
      {claimError && <Text style={styles.errorText}>{claimError}</Text>}
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
      {reasonError && <Text style={styles.errorText}>{reasonError}</Text>}
      {!allClaimsDecided && (
        <Text style={styles.hintText}>Resolve all claims above before approving.</Text>
      )}

      <View style={styles.row}>
        <Button
          mode="contained"
          onPress={() => handleListingDecision('approved')}
          buttonColor={colors.primary}
          disabled={!allClaimsDecided}
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
  actionBtn: { flex: 1, minHeight: spacing.tapTarget, justifyContent: 'center' },
  errorText: { color: colors.error, marginBottom: spacing.sm },
  hintText: { color: colors.secondary, marginBottom: spacing.sm, fontStyle: 'italic' }
});