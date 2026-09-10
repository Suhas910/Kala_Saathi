// src/features/speak/SpeakScreen.tsx
import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Button, Menu, ActivityIndicator } from 'react-native-paper';
import { useAudioRecorder, RecordingPresets, AudioModule } from 'expo-audio';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ArtisanStackParamList } from '../../types/navigation';
import { service } from '../../services';
import { colors, spacing } from '../../theme';

const LANGUAGES = [
  { code: 'kn', label: 'ಕನ್ನಡ (Kannada)' },
  { code: 'hi', label: 'हिन्दी (Hindi)' },
  { code: 'en', label: 'English' },
];

export default function SpeakScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<ArtisanStackParamList>>();
  const route = useRoute();
  const { draftId } = (route.params as { draftId: string }) ?? {};

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);

  const currentLang = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0];

  // Poll transcription job — same pattern as ImageReviewScreen (contract: GET /jobs/{job_id}).
  const { data: job } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => service.getJobStatus(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => (query.state.data?.status === 'complete' ? false : 1500),
  });
  const isProcessing = !!jobId && (!job || job.status === 'processing' || job.status === 'queued');
  const isFailed = job?.status === 'failed';
  const isComplete = job?.status === 'complete';

  const startRecording = async () => {
    setRecordError(null);
    try {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) {
        setRecordError('Microphone permission is needed to record. Please enable it in settings.');
        return;
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
    } catch (err) {
      setRecordError('Could not start recording. Try again.');
    }
  };

  const stopRecording = async () => {
    setRecordError(null);
    try {
      await recorder.stop();
      setIsRecording(false);
      setHasRecording(true);

      const res = await service.requestTranscription(draftId, {
        audio_media_id: 'mock_audio_123',
        declared_language: i18n.language,
      });
      setJobId(res.job_id);
    } catch (err) {
      // Contract: PROVIDER_UNAVAILABLE -> queue/retry, preserve draft. Never leave artisan with no feedback.
      setHasRecording(false);
      setRecordError('Could not process your recording. Check connection and try recording again.');
    }
  };

  const handleContinue = () => {
    // TODO: mockApi has no getTranscriptionResult (unlike getImageJobResult for image jobs) — contract's
    // GET /jobs/{job_id} only returns status metadata, not the actual transcript_id/text/confidence.
    // Flag to backend/AI contract owner: need a documented way to fetch job RESULT after status=complete,
    // matching the image-job pattern. Passing job_id forward as a stand-in until that's resolved.
    navigation.navigate('ConfirmDetails', { draftId, transcriptId: jobId ?? 'transcript_uuid' });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.instruction}>{t('speak.instruction')}</Text>

      <TouchableOpacity
        style={[styles.micBtn, isRecording && styles.micActive]}
        onPress={isRecording ? stopRecording : startRecording}
        disabled={isProcessing}
      >
        <Text style={styles.micIcon}>{isRecording ? '■' : '🎤'}</Text>
      </TouchableOpacity>

      {recordError && <Text style={styles.errorText}>{recordError}</Text>}

      <Menu
        visible={menuVisible}
        onDismiss={() => setMenuVisible(false)}
        anchor={
          <Button mode="outlined" onPress={() => setMenuVisible(true)} textColor={colors.secondary} style={styles.langBtn}>
            {currentLang.label}
          </Button>
        }
      >
        {LANGUAGES.map((lang) => (
          <Menu.Item key={lang.code} onPress={() => { i18n.changeLanguage(lang.code); setMenuVisible(false); }} title={lang.label} />
        ))}
      </Menu>

      {isProcessing && (
        <View style={styles.processingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.processingText}>Processing your recording…</Text>
        </View>
      )}

      {isFailed && (
        <Text style={styles.errorText}>Transcription failed. Please record again.</Text>
      )}

      {isComplete && (
        <Button mode="contained" onPress={handleContinue} buttonColor={colors.primary} style={styles.cta}>
          Continue
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, justifyContent: 'space-between', alignItems: 'center' },
  instruction: { fontSize: 20, color: colors.text, textAlign: 'center', marginTop: spacing.xxl },
  micBtn: { width: 140, height: 140, borderRadius: 70, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  micActive: { backgroundColor: colors.error },
  micIcon: { fontSize: 48 },
  langBtn: { marginBottom: spacing.md },
  cta: { width: '100%', minHeight: spacing.tapTarget, justifyContent: 'center' },
  errorText: { color: colors.error, textAlign: 'center', marginTop: spacing.sm },
  processingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  processingText: { color: colors.text },
});