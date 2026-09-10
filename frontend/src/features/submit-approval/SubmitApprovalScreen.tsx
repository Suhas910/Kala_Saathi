// src/features/submit-approval/SubmitApprovalScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, Checkbox, Card } from 'react-native-paper';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ArtisanStackParamList } from '../../types/navigation';
import { service } from '../../services';
import { getDraft } from '../../services/database';
import { colors, spacing } from '../../theme';

// Checklist items mirror the contract's actual gate conditions before awaiting_approval:
// catalogue valid, confirmations done, image accepted, price resolved, claims evidenced.
const CHECKLIST = [
  { key: 'catalogue', label: 'Product details confirmed' },
  { key: 'image', label: 'Photo quality accepted' },
  { key: 'price', label: 'Price reviewed' },
  { key: 'claims', label: 'No unverified sensitive claims pending' },
];

interface DraftPayload {
  catalogueConfirmed?: boolean;
  imageAccepted?: boolean;
  priceReviewed?: boolean;
}

export default function SubmitApprovalScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ArtisanStackParamList>>();
  const route = useRoute<RouteProp<ArtisanStackParamList, 'SubmitApproval'>>();
  const { draftId } = route.params;

  const [draftPayload, setDraftPayload] = useState<DraftPayload>({});
  const [noUnverifiedClaims, setNoUnverifiedClaims] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!draftId) return;
    (async () => {
      try {
        const draft = await getDraft(draftId);
        if (draft?.payload) {
          setDraftPayload(draft.payload);
        }
      } catch (err) {
        console.error('Failed to load draft payload in SubmitApprovalScreen', err);
      }

      try {
        const listing = await service.getListing(draftId);
        const claims = listing.claims ?? [];
        const verifiedOrNone = claims.every(
          (c) => !(c.asserted_by_artisan && !c.coordinator_verified)
        );
        setNoUnverifiedClaims(verifiedOrNone);
      } catch (err) {
        console.error('Failed to load listing claims in SubmitApprovalScreen', err);
      }
    })();
  }, [draftId]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await service.submitForApproval(draftId);
      setSubmitted(true);
    } catch (err) {
      // Contract: LISTING_STATE_INVALID -> refresh status, block duplicate action.
      // Backend re-validates all checklist gates server-side; surface its rejection honestly.
      setSubmitError('Could not submit for review. Some details may still need attention — check your listing and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDone = () => {
    navigation.navigate('MyListings');
  };

  const isChecked = (key: string) => {
    switch (key) {
      case 'catalogue':
        return !!draftPayload.catalogueConfirmed;
      case 'image':
        return !!draftPayload.imageAccepted;
      case 'price':
        return !!draftPayload.priceReviewed;
      case 'claims':
        return noUnverifiedClaims;
      default:
        return false;
    }
  };

  if (submitted) {
    return (
      <View style={styles.centered}>
        <Text variant="titleLarge" style={styles.title}>Sent for Review</Text>
        <Text style={styles.subtitle}>
          Your coordinator will review this listing soon. You'll see updates on your listings page.
        </Text>
        <Button mode="contained" onPress={handleDone} buttonColor={colors.primary} style={styles.doneBtn}>
          Back to My Listings
        </Button>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text variant="titleLarge" style={styles.title}>Ready to Submit</Text>
      <Text style={styles.subtitle}>
        Your draft is locked from here — a coordinator will review it next.
      </Text>

      <Card style={styles.checklistCard}>
        <Card.Content>
          {CHECKLIST.map((item) => (
            <View key={item.key} style={styles.checklistRow}>
              <Checkbox
                status={isChecked(item.key) ? 'checked' : 'unchecked'}
                color={colors.success}
              />
              <Text style={styles.checklistLabel}>{item.label}</Text>
            </View>
          ))}
        </Card.Content>
      </Card>

      {submitError && <Text style={styles.errorText}>{submitError}</Text>}

      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={submitting}
        disabled={submitting}
        buttonColor={colors.primary}
        style={styles.submitBtn}
      >
        Submit for Coordinator Review
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, backgroundColor: colors.background, flexGrow: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg, backgroundColor: colors.background },
  title: { color: colors.text, marginBottom: spacing.xs, textAlign: 'center' },
  subtitle: { color: colors.text, opacity: 0.7, marginBottom: spacing.lg, textAlign: 'center' },
  checklistCard: { backgroundColor: colors.surface, borderRadius: 16, marginBottom: spacing.xl },
  checklistRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  checklistLabel: { color: colors.text, flex: 1 },
  submitBtn: { minHeight: spacing.tapTarget, justifyContent: 'center' },
  doneBtn: { marginTop: spacing.xl, minHeight: spacing.tapTarget, justifyContent: 'center' },
  errorText: { color: colors.error, textAlign: 'center', marginBottom: spacing.md },
});