// src/features/confirm-details/ConfirmDetailsScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, TextInput, ActivityIndicator, Chip } from 'react-native-paper';
import { useNavigation, useRoute } from '@react-navigation/native';
import { service } from '../../services';
import { colors, spacing } from '../../theme';
import type { CatalogueResult } from '../../types/contracts';

// Confidence -> friendly colored dot, never a raw percentage (low-literacy rule)
const confidenceColor = (score: number) => {
  if (score >= 0.85) return colors.success;
  if (score >= 0.65) return colors.accent;
  return colors.error;
};

export default function ConfirmDetailsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  // @ts-expect-error — typed nav params land once types/navigation.ts is filled
  const { draftId, transcriptId } = route.params ?? {};

  const [result, setResult] = useState<CatalogueResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [editedFields, setEditedFields] = useState<Record<string, any>>({});
  const [confirmedFields, setConfirmedFields] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const res = await service.requestCatalogueGeneration(draftId, {
        transcript_id: transcriptId,
        image_media_ids: [],
        confirmed_facts: {},
        taxonomy_version: '0.1.0',
      });
      setResult(res);
      setLoading(false);
    })();
  }, [draftId, transcriptId]);

  if (loading || !result) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.hint}>Generating your product details…</Text>
      </View>
    );
  }

  const { catalogue, field_confidence, needs_confirmation } = result;

  // Flatten the fields we actually need to show for confirmation.
  // Per contract: low confidence != wrong — always needs explicit user action, never auto-accept.
  const fieldsToConfirm = [
    { key: 'category', label: 'Category', value: catalogue.category },
    { key: 'materials', label: 'Materials', value: catalogue.materials.join(', ') },
    { key: 'techniques', label: 'Techniques', value: catalogue.techniques.join(', ') },
    { key: 'labour.hours', label: 'Hours to make', value: String(catalogue.labour.hours) },
    { key: 'title.en', label: 'Title (English)', value: catalogue.title.en },
    { key: 'description.en', label: 'Description', value: catalogue.description.en },
  ];

  const handleFieldChange = (key: string, value: string) => {
    setEditedFields((prev) => ({ ...prev, [key]: value }));
  };

  const handleConfirmField = (key: string) => {
    setConfirmedFields((prev) => new Set(prev).add(key));
  };

  const allNeedsConfirmationHandled = needs_confirmation.every((key) => confirmedFields.has(key));

  const handleSubmit = async () => {
    const corrections = Object.entries(editedFields).map(([field, new_value]) => ({
      field,
      old_value: (catalogue as any)[field],
      new_value,
      source: 'artisan',
    }));

    await service.confirmListing(draftId, {
      catalogue,
      confirmed_fields: fieldsToConfirm.map((f) => f.key),
      corrections,
    });

    // @ts-expect-error
    navigation.navigate('Price', { draftId });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text variant="titleLarge" style={styles.title}>Confirm Your Details</Text>
      <Text style={styles.subtitle}>Check what we understood. Edit anything that's wrong.</Text>

      {fieldsToConfirm.map((field) => {
        const confidence = field_confidence[field.key];
        const needsConfirmation = needs_confirmation.includes(field.key);
        const isConfirmed = confirmedFields.has(field.key);

        return (
          <View key={field.key} style={styles.fieldCard}>
            <View style={styles.fieldHeader}>
              <Text style={styles.fieldLabel}>{field.label}</Text>
              {confidence !== undefined && (
                <View style={[styles.confidenceDot, { backgroundColor: confidenceColor(confidence) }]} />
              )}
            </View>

            <TextInput
              mode="outlined"
              value={editedFields[field.key] ?? field.value}
              onChangeText={(text) => handleFieldChange(field.key, text)}
              style={styles.input}
              multiline={field.key === 'description.en'}
            />

            {needsConfirmation && (
              <Chip
                icon={isConfirmed ? 'check-circle' : 'alert-circle-outline'}
                style={[styles.confirmChip, { backgroundColor: isConfirmed ? colors.success : colors.accent }]}
                textStyle={{ color: '#FFF' }}
                onPress={() => handleConfirmField(field.key)}
              >
                {isConfirmed ? 'Confirmed' : 'Tap to confirm this is correct'}
              </Chip>
            )}
          </View>
        );
      })}

      <Button
        mode="contained"
        onPress={handleSubmit}
        disabled={!allNeedsConfirmationHandled}
        buttonColor={colors.primary}
        style={styles.submitBtn}
      >
        Continue to Price
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, backgroundColor: colors.background, flexGrow: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg, backgroundColor: colors.background },
  title: { color: colors.text, marginBottom: spacing.xs },
  subtitle: { color: colors.text, opacity: 0.7, marginBottom: spacing.lg },
  fieldCard: { backgroundColor: colors.surface, borderRadius: 16, padding: spacing.md, marginBottom: spacing.md },
  fieldHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  fieldLabel: { color: colors.text, fontWeight: '600', flex: 1 },
  confidenceDot: { width: 12, height: 12, borderRadius: 6 },
  input: { backgroundColor: colors.background },
  confirmChip: { marginTop: spacing.sm, alignSelf: 'flex-start' },
  submitBtn: { marginTop: spacing.md, minHeight: spacing.tapTarget, justifyContent: 'center' },
  hint: { color: colors.text, marginTop: spacing.md, textAlign: 'center' },
});