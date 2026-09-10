// src/features/speak/SpeakScreen.tsx
import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Button, Menu } from 'react-native-paper';
import { useAudioRecorder, RecordingPresets, AudioModule } from 'expo-audio';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
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

  const currentLang = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0];

  const startRecording = async () => {
    const status = await AudioModule.requestRecordingPermissionsAsync();
    if (!status.granted) return;
    await recorder.prepareToRecordAsync();
    recorder.record();
    setIsRecording(true);
  };

  const stopRecording = async () => {
    await recorder.stop();
    setIsRecording(false);
    setHasRecording(true);

    const res = await service.requestTranscription(draftId, {
      audio_media_id: 'mock_audio_123',
      declared_language: i18n.language,
    });
    setJobId(res.job_id);
  };

  const handleContinue = () => {
    navigation.navigate('ConfirmDetails', { draftId, transcriptId: 'transcript_uuid' });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.instruction}>{t('speak.instruction')}</Text>

      <TouchableOpacity
        style={[styles.micBtn, isRecording && styles.micActive]}
        onPress={isRecording ? stopRecording : startRecording}
      >
        <Text style={styles.micIcon}>{isRecording ? '■' : '🎤'}</Text>
      </TouchableOpacity>

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

      {jobId && (
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
});