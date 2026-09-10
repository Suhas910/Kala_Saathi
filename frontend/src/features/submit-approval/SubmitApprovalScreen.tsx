// src/features/submit-approval/SubmitApprovalScreen.tsx
import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, Checkbox, Card } from 'react-native-paper';
import { useNavigation, useRoute } from '@react-navigation/native';
import { service } from '../../services';
import { colors, spacing } from '../../theme';

// Checklist items mirror the contract's actual gate conditions before awaiting_approval:
// catalogue valid, confirmations done, image accepted, price resolved, claims evidenced.
const CHECKLIST = [
  { key: 'catalogue', label: 'Product details confirmed' },
  { key: 'image', label: 'Photo quality accepted' },
  { key: 'price', label: 'Price reviewed' },
  { key: 'claims', label: 'No unverified sensitive claims pending' },
];

export default function SubmitApprovalScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  // @ts-expect-error — typed nav params land once types/navigation.ts is filled
  const { draftId } = route.params ?? {};

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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
    // @ts-expect-error
    navigation.navigate('MyListings');
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
          {/* TODO: checklist below is a static preview, not wired to real draft/listing state yet.
              Contract: backend re-checks all these conditions server-side on submitForApproval and
              will reject via LISTING_STATE_INVALID if any fail — this UI should eventually read the
              actual confirmation/image/price/claim status from the draft rather than always showing
              "checked". Left as-is for demo, but don't treat these checkmarks as ground truth. */}
          {CHECKLIST.map((item) => (
            <View key={item.key} style={styles.checklistRow}>
              <Checkbox status="checked" color={colors.success} />
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