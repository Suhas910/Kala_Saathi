// src/features/image-review/ImageReviewScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Image, ScrollView } from 'react-native';
import { Text, Button, ActivityIndicator, Chip } from 'react-native-paper';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { service } from '../../services';
import { colors, spacing } from '../../theme';

export default function ImageReviewScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  // @ts-expect-error — typed nav params land once types/navigation.ts is filled
  const { draftId } = route.params ?? {};

  const [jobId, setJobId] = useState<string | null>(null);
  const [kickoffError, setKickoffError] = useState<string | null>(null);

  // Kick off image analysis once, on screen load
  useEffect(() => {
    if (!draftId) return;
    (async () => {
      try {
        const result = await service.requestImageAnalysis(draftId, { media_id: 'media_placeholder' });
        setJobId(result.job_id);
      } catch (err) {
        setKickoffError('Could not start photo processing. Check connection and try again.');
      }
    })();
  }, [draftId]);

  // Poll job status — same pattern used everywhere for AI jobs
  const { data: job } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => service.getJobStatus(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => (query.state.data?.status === 'complete' ? false : 1500),
  });

  const isProcessing = !kickoffError && (!job || job.status === 'processing' || job.status === 'queued');
  const isFailed = kickoffError || job?.status === 'failed';

  const handleRetake = () => {
    navigation.goBack();
  };

  const handleContinue = () => {
    // @ts-expect-error — same as above, typed later
    navigation.navigate('Speak', { draftId });
  };

  if (isProcessing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.hint}>Checking photo quality and enhancing image…</Text>
      </View>
    );
  }

  if (isFailed) {
    return (
      <View style={styles.centered}>
        <Text style={styles.hint}>Something went wrong processing this photo.</Text>
            <Button mode="contained" onPress={handleRetake} style={styles.retakeBtn} buttonColor={colors.primary}>
          Retake Photo
        </Button> 
      </View>
    );
  }

  // NOTE: mockApi's image job doesn't currently return quality/enhanced_media_id —
  // using placeholder values here until mockApi.requestImageAnalysis is expanded to match
  // the full contract shape from AI_INTERFACE_CONTRACTS.md.
  const mockOriginalUri = 'https://placehold.co/400x400/EDE7DD/2B2320?text=Original';
  const mockEnhancedUri = 'https://placehold.co/400x400/FFF8F0/2B2320?text=Enhanced';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text variant="titleLarge" style={styles.title}>Compare Your Photo</Text>
      <Text style={styles.subtitle}>We never change what your product looks like — only lighting, background, and crop.</Text>

      <View style={styles.compareRow}>
        <View style={styles.imageBlock}>
          <Text style={styles.label}>Original</Text>
          <Image source={{ uri: mockOriginalUri }} style={styles.image} />
        </View>
        <View style={styles.imageBlock}>
          <Text style={styles.label}>Enhanced</Text>
          <Image source={{ uri: mockEnhancedUri }} style={styles.image} />
          <Chip icon="check-circle" style={styles.qualityChip} textStyle={{ color: '#FFF' }}>
            Quality looks good
          </Chip>
        </View>
      </View>

      <View style={styles.actions}>
        <Button mode="outlined" onPress={handleRetake} style={styles.actionBtn} textColor={colors.secondary}>
          Retake
        </Button>
        <Button mode="contained" onPress={handleContinue} style={styles.actionBtn} buttonColor={colors.primary}>
          Continue
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, backgroundColor: colors.background, flexGrow: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg, backgroundColor: colors.background },
  title: { color: colors.text, marginBottom: spacing.xs },
  subtitle: { color: colors.text, opacity: 0.7, marginBottom: spacing.lg },
  compareRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
  imageBlock: { flex: 1, alignItems: 'center' },
  label: { color: colors.text, marginBottom: spacing.sm, fontWeight: '600' },
  image: { width: '100%', aspectRatio: 1, borderRadius: 16, backgroundColor: '#EEE' },
  qualityChip: { marginTop: spacing.sm, backgroundColor: colors.success },
  actions: { flexDirection: 'row', gap: spacing.md, justifyContent: 'center' },
  actionBtn: { flex: 1, minHeight: spacing.tapTarget, justifyContent: 'center' },
  hint: { color: colors.text, marginTop: spacing.md, textAlign: 'center' },
  retakeBtn: { marginTop: spacing.md },
});