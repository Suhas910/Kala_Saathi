// src/features/speak/SpeakScreen.tsx
import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Button, ActivityIndicator, Menu } from 'react-native-paper';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useAudioRecorder, RecordingPresets, AudioModule } from 'expo-audio';
import { service } from '../../services';
import { colors, spacing } from '../../theme';

const LANGUAGES = [
  { code: 'kn', label: 'ಕನ್ನಡ (Kannada)' },
  { code: 'hi', label: 'हिन्दी (Hindi)' },
  { code: 'en', label: 'English' },
];

export default function SpeakScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  // @ts-expect-error — typed nav params land later
  const { draftId } = route.params ?? {};

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [menuVisible, setMenuVisible] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  const ensurePermission = async () => {
    const status = await AudioModule.requestRecordingPermissionsAsync();
    return status.granted;
  };

  const handleStartRecording = async () => {
    const granted = await ensurePermission();
    if (!granted) return;
    await recorder.prepareToRecordAsync();
    recorder.record();
    setIsRecording(true);
  };

  const handleStopRecording = async () => {
    await recorder.stop();
    setIsRecording(false);
    setHasRecording(true);

    // Upload + kick off transcription job
    const result = await service.requestTranscription(draftId, {
      audio_media_id: 'audio_placeholder',
      declared_language: language.code,
    });
    setJobId(result.job_id);
  };

  const { data: job } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => service.getJobStatus(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => (query.state.data?.status === 'complete' ? false : 1500),
  });

  const handleContinue = () => {
    // @ts-expect-error
    navigation.navigate('ConfirmDetails', { draftId, transcriptId: 'transcript_uuid' });
  };

  const isProcessingTranscript = jobId && job?.status !== 'complete';

  return (
    <View style={styles.container}>
      <Text variant="titleLarge" style={styles.title}>Describe Your Product</Text>
      <Text style={styles.subtitle}>Speak naturally in your language — mention material, technique, and how long it took.</Text>

      <TouchableOpacity
        style={[styles.micButton, isRecording && styles.micButtonActive]}
        onPress={isRecording ? handleStopRecording : handleStartRecording}
        disabled={!!isProcessingTranscript}
      >
        <Text style={styles.micIcon}>{isRecording ? '■' : '🎤'}</Text>
      </TouchableOpacity>

      <Text style={styles.status}>
        {isRecording ? 'Recording… tap to stop' : hasRecording ? 'Recorded — processing or ready' : 'Tap to start recording'}
      </Text>

      <Menu
        visible={menuVisible}
        onDismiss={() => setMenuVisible(false)}
        anchor={
          <Button mode="outlined" onPress={() => setMenuVisible(true)} textColor={colors.secondary} style={styles.langButton}>
            {language.label}
          </Button>
        }
      >
        {LANGUAGES.map((lang) => (
          <Menu.Item key={lang.code} onPress={() => { setLanguage(lang); setMenuVisible(false); }} title={lang.label} />
        ))}
      </Menu>

      {isProcessingTranscript && (
        <View style={styles.processingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.hint}>Transcribing your recording…</Text>
        </View>
      )}

      {job?.status === 'complete' && (
        <Button mode="contained" onPress={handleContinue} buttonColor={colors.primary} style={styles.continueBtn}>
          Continue
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, backgroundColor: colors.background, alignItems: 'center' },
  title: { color: colors.text, marginTop: spacing.xl, textAlign: 'center' },
  subtitle: { color: colors.text, opacity: 0.7, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xxl },
  micButton: {
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: colors.primary, shadowOpacity: 0.4, shadowRadius: 20, elevation: 8,
  },
  micButtonActive: { backgroundColor: colors.error },
  micIcon: { fontSize: 48 },
  status: { color: colors.text, marginTop: spacing.lg, marginBottom: spacing.xl },
  langButton: { borderColor: colors.secondary, minHeight: spacing.tapTarget, justifyContent: 'center' },
  processingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl },
  hint: { color: colors.text },
  continueBtn: { marginTop: spacing.xl, width: '100%', minHeight: spacing.tapTarget, justifyContent: 'center' },
});