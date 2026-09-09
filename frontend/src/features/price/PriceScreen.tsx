// src/features/price/PriceScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, ActivityIndicator, Card } from 'react-native-paper';
import { useNavigation, useRoute } from '@react-navigation/native';
import { service } from '../../services';
import { colors, spacing } from '../../theme';
import type { PriceResult } from '../../types/contracts';

const paiseToRupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

export default function PriceScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  // @ts-expect-error — typed nav params land once types/navigation.ts is filled
  const { draftId } = route.params ?? {};

  const [price, setPrice] = useState<PriceResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const result = await service.requestPrice(draftId, {
        material_cost_inr: 800,
        labour_hours: 12,
        state_code: 'KA',
        skill_level: 'skilled',
        techniques: ['handloom_weave'],
        comparables: [],
      });
      setPrice(result);
      setLoading(false);
    })();
  }, [draftId]);

  const handleContinue = () => {
    // @ts-expect-error
    navigation.navigate('SubmitApproval', { draftId });
  };

  if (loading || !price) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.hint}>Calculating a fair price…</Text>
      </View>
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