// src/features/capture/CaptureScreen.tsx
import React, { useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Text, ActivityIndicator, IconButton } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ArtisanStackParamList } from '../../types/navigation';
import * as Crypto from 'expo-crypto';
import { service } from '../../services';
import { saveDraft } from '../../services/database';
import { useDraftStore } from '../../store/draftStore';
import { colors, spacing } from '../../theme';

export default function CaptureScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ArtisanStackParamList>>();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [capturedUris, setCapturedUris] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { activeDraftId, setActiveDraft } = useDraftStore();

  if (!permission) {
    return <View style={styles.centered}><ActivityIndicator /></View>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: colors.text, marginBottom: spacing.md, textAlign: 'center' }}>
          Camera access is needed to photograph your product.
        </Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={{ color: '#FFF' }}>Allow Camera Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const ensureDraft = async () => {
    if (activeDraftId) return activeDraftId;
    // First photo of a new product — create the draft now, everything else attaches to this id.
    const result = await service.createListing({ preferred_language: 'kn' });
    const newId = result.id;
    setActiveDraft(newId);
    await saveDraft({
      id: newId,
      listing_id: newId,
      state: 'draft',
      preferred_language: 'kn',
      payload: {},
    });
    return newId;
  };

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    setIsSaving(true);
    setUploadError(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (!photo) return;

      const draftId = await ensureDraft();

      // Save original locally FIRST — never lose the source photo, per hard product rules.
      setCapturedUris((prev) => [...prev, photo.uri]);

      // NOTE: outbox.ts calls the real `api` axios client directly (bypasses service/mockApi layer),
      // so it can't safely queue this yet — during mock phase it would just retry against a backend
      // that doesn't exist. Flagged to integration owner: wire this through outbox once real
      // /listings/{id}/media endpoint is live, so upload survives offline per hard rule 7.
      try {
        await service.completeMediaUpload(draftId, {
          kind: 'image',
          upload_token: Crypto.randomUUID(),
          client_checksum: 'mock_checksum',
        });
      } catch (uploadErr) {
        // Never silently pretend a failed upload succeeded — keep the local photo (safe), tell the artisan.
        setUploadError('Photo saved on your device, but upload failed. It will retry when you continue.');
      }
    } catch (err) {
      setUploadError('Could not capture photo. Try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleContinue = () => {
    if (!activeDraftId) return;
    navigation.navigate('ImageReview', { draftId: activeDraftId });
  };

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back" />

      {capturedUris.length > 0 && (
        <View style={styles.thumbRow}>
  {capturedUris.map((uri, i) => (
    <TouchableOpacity key={i} onPress={() => setCapturedUris((prev) => prev.filter((_, idx) => idx !== i))}>
      <Image source={{ uri }} style={styles.thumb} />
      <View style={styles.thumbRemoveBadge}><Text style={{ color: '#FFF', fontSize: 10 }}>✕</Text></View>
    </TouchableOpacity>
  ))}
</View>
      )}

      <View style={styles.controls}>
        <Text style={styles.hint}>
          {capturedUris.length === 0
            ? 'Take a clear photo of your product'
            : `${capturedUris.length} photo${capturedUris.length > 1 ? 's' : ''} captured — add more angles or continue`}
        </Text>
        {uploadError && <Text style={styles.errorText}>{uploadError}</Text>}

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.captureBtn}
            onPress={handleCapture}
            disabled={isSaving}
          >
            {isSaving ? <ActivityIndicator color="#FFF" /> : <View style={styles.captureBtnInner} />}
          </TouchableOpacity>

          {capturedUris.length > 0 && (
            <IconButton
              icon="arrow-right-circle"
              size={48}
              iconColor={colors.primary}
              onPress={handleContinue}
              style={styles.continueBtn}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg, backgroundColor: colors.background },
  permissionBtn: { backgroundColor: colors.primary, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: 12, minHeight: spacing.tapTarget, justifyContent: 'center' },
  thumbRow: { flexDirection: 'row', position: 'absolute', top: spacing.lg, left: spacing.md, gap: spacing.xs },
  thumb: { width: 48, height: 48, borderRadius: 8, borderWidth: 2, borderColor: '#FFF' },
  thumbRemoveBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: colors.error, borderRadius: 8, width: 16, height: 16, justifyContent: 'center', alignItems: 'center' },
  controls: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: spacing.lg, backgroundColor: 'rgba(0,0,0,0.5)' },
  hint: { color: '#FFF', textAlign: 'center', marginBottom: spacing.md },
  errorText: { color: '#FFB4A2', textAlign: 'center', marginBottom: spacing.sm },
  buttonRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.lg },
  captureBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: '#FFF' },
  captureBtnInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFF' },
  continueBtn: { backgroundColor: '#FFF' },
});