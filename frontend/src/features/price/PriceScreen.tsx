// src/features/price/PriceScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, Card } from 'react-native-paper';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ArtisanStackParamList } from '../../types/navigation';
import { service } from '../../services';
import { getDraft, saveDraft } from '../../services/database';
import { colors, spacing } from '../../theme';
import type { PriceResult } from '../../types/contracts';
import { ProcessingIndicator, ErrorRetryCard } from '../../components';

const paiseToRupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

export default function PriceScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ArtisanStackParamList>>();
  const route = useRoute<RouteProp<ArtisanStackParamList, 'Price'>>();
  const { draftId } = route.params;

  const [price, setPrice] = useState<PriceResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [priceError, setPriceError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setPriceError(null);
      try {
        // TODO: Replace hardcoded payload with real confirmed catalogue values from draftStore
        // (material_cost_inr, labour_hours, state_code, skill_level, techniques) once ConfirmDetailsScreen
        // persists them. Currently static — works for demo, wrong once real drafts vary.
        const result = await service.requestPrice(draftId, {
          material_cost_inr: 800,
          labour_hours: 12,
          state_code: 'KA',
          skill_level: 'skilled',
          techniques: ['handloom_weave'],
          comparables: [],
        });
        setPrice(result);

        if (result.status === 'available') {
          try {
            const existing = await getDraft(draftId);
            await saveDraft({
              id: draftId,
              listing_id: existing?.listing_id ?? draftId,
              state: existing?.state ?? 'draft',
              preferred_language: existing?.preferred_language ?? 'kn',
              payload: {
                ...(existing?.payload ?? {}),
                priceReviewed: true,
              },
            });
          } catch (dbErr) {
            console.error('Failed to update draft payload in PriceScreen', dbErr);
          }
        }
      } catch (err) {
        // Never invent a price on failure — show recoverable error, not a stuck spinner.
        setPriceError('Could not load price. Check connection and try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, [draftId]);

  const handleContinue = async () => {
    try {
      const existing = await getDraft(draftId);
      await saveDraft({
        id: draftId,
        listing_id: existing?.listing_id ?? draftId,
        state: existing?.state ?? 'draft',
        preferred_language: existing?.preferred_language ?? 'kn',
        payload: {
          ...(existing?.payload ?? {}),
          priceReviewed: true,
        },
      });
    } catch (dbErr) {
      console.error('Failed to update draft payload on continue', dbErr);
    }
    navigation.navigate('SubmitApproval', { draftId });
  };

  if (loading) {
    return <ProcessingIndicator hint="Calculating a fair price…" />;
  }

  if (priceError || !price) {
    return (
      <ErrorRetryCard
        errorText={priceError ?? 'Something went wrong loading your price.'}
        onRetry={() => {
          setLoading(true);
          setPriceError(null);
          service.requestPrice(draftId, {
            material_cost_inr: 800,
            labour_hours: 12,
            state_code: 'KA',
            skill_level: 'skilled',
            techniques: ['handloom_weave'],
            comparables: [],
          }).then(async (res) => {
            setPrice(res);
            if (res.status === 'available') {
              try {
                const existing = await getDraft(draftId);
                await saveDraft({
                  id: draftId,
                  listing_id: existing?.listing_id ?? draftId,
                  state: existing?.state ?? 'draft',
                  preferred_language: existing?.preferred_language ?? 'kn',
                  payload: { ...(existing?.payload ?? {}), priceReviewed: true },
                });
              } catch (dbErr) {
                console.error('Failed to update draft payload on retry', dbErr);
              }
            }
          }).catch(() => setPriceError('Could not load price. Check connection and try again.')).finally(() => setLoading(false));
        }}
        retryLabel="Retry"
      />
    );
  }

  // Hard rule: never invent a number. If unavailable, say so plainly — calm, not alarming.
  if (price.status === 'unavailable') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Card style={styles.unavailableCard}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.unavailableTitle}>
              Price not available yet
            </Text>
            <Text style={styles.unavailableText}>
              We don't have a verified wage rate for your state yet. Your coordinator will help set a fair price
              before this listing moves forward.
            </Text>
          </Card.Content>
        </Card>
        <Button
          mode="contained"
          onPress={handleContinue}
          buttonColor={colors.primary}
          style={styles.continueBtn}
        >
          Continue Anyway
        </Button>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text variant="titleLarge" style={styles.title}>Your Fair Price</Text>

      <Card style={styles.statCard}>
        <Card.Content>
          <Text style={styles.statLabel}>Protected Floor</Text>
          <Text style={styles.statValue}>{paiseToRupees(price.floor_amount_paise)}</Text>
          <Text style={styles.statSub}>
            You should never sell below this — it covers your materials and fair labour.
          </Text>
        </Card.Content>
      </Card>

      <Card style={styles.statCard}>
        <Card.Content>
          <Text style={styles.statLabel}>Suggested Range</Text>
          <Text style={styles.statValue}>
            {paiseToRupees(price.recommended_low_paise)} – {paiseToRupees(price.recommended_high_paise)}
          </Text>
        </Card.Content>
      </Card>

      <Text style={styles.explanation}>{price.explanation}</Text>

      {price.wage_source && (
        <View style={styles.sourceBox}>
          <Text style={styles.sourceLabel}>Wage source</Text>
          <Text style={styles.sourceText}>
            {price.wage_source.state_code} — effective {price.wage_source.effective_from}
          </Text>
          <Text style={styles.sourceRef}>{price.wage_source.notification_ref}</Text>
        </View>
      )}

      <Button
        mode="contained"
        onPress={handleContinue}
        buttonColor={colors.primary}
        style={styles.continueBtn}
      >
        Continue
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, backgroundColor: colors.background, flexGrow: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg, backgroundColor: colors.background },
  title: { color: colors.text, marginBottom: spacing.lg },
  statCard: { backgroundColor: colors.surface, borderRadius: 16, marginBottom: spacing.md },
  statLabel: { color: colors.text, opacity: 0.7, fontSize: 13 },
  statValue: { color: colors.primary, fontSize: 28, fontWeight: '700', marginTop: spacing.xs },
  statSub: { color: colors.text, opacity: 0.6, marginTop: spacing.xs, fontSize: 12 },
  explanation: { color: colors.text, marginVertical: spacing.md, lineHeight: 20 },
  sourceBox: { backgroundColor: '#EDE7DD', borderRadius: 12, padding: spacing.md, marginBottom: spacing.lg },
  sourceLabel: { color: colors.text, fontWeight: '600', fontSize: 12 },
  sourceText: { color: colors.text, marginTop: spacing.xs },
  sourceRef: { color: colors.text, opacity: 0.6, fontSize: 12, marginTop: spacing.xs },
  continueBtn: { minHeight: spacing.tapTarget, justifyContent: 'center' },
  unavailableCard: { backgroundColor: '#FCEFD6', borderRadius: 16, marginBottom: spacing.lg },
  unavailableTitle: { color: colors.text, marginBottom: spacing.sm },
  unavailableText: { color: colors.text, lineHeight: 20 },
  hint: { color: colors.text, marginTop: spacing.md, textAlign: 'center' },
});