// src/features/my-listings/MyListingsScreen.tsx
import React, { useCallback, useState } from 'react';
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { Text, Card, Chip, ActivityIndicator, Banner, FAB } from 'react-native-paper';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { service } from '../../services';
import { getDb } from '../../services/database';
import { colors, spacing } from '../../theme';
import type { Listing, ListingState } from '../../types/contracts';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ArtisanStackParamList } from '../../types/navigation';



import { useDraftStore } from '../../store/draftStore';
import { ProcessingIndicator } from '../../components';

// --- State → visual mapping ---
// Colors chosen for quick scanability, not just decoration:
// warm/neutral = in-progress, indigo = needs artisan action, green = done, red = blocked
const STATE_META: Record<ListingState, { label: string; color: string; bg: string }> = {
  draft: { label: 'Draft', color: colors.text, bg: '#EDE7DD' },
  processing: { label: 'Processing', color: colors.accent, bg: '#FCEFD6' },
  awaiting_confirmation: { label: 'Needs your confirmation', color: '#FFFFFF', bg: colors.accent },
  awaiting_approval: { label: 'Awaiting coordinator', color: '#FFFFFF', bg: colors.secondary },
  approved: { label: 'Approved', color: '#FFFFFF', bg: colors.success },
  export_queued: { label: 'Exporting…', color: '#FFFFFF', bg: colors.secondary },
  exported: { label: 'Exported', color: '#FFFFFF', bg: colors.success },
  rejected: { label: 'Rejected — needs revision', color: '#FFFFFF', bg: colors.error },
  failed: { label: 'Failed — retry needed', color: '#FFFFFF', bg: colors.error },
};

export default function MyListingsScreen() {
  const queryClient = useQueryClient();
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const navigation = useNavigation<NativeStackNavigationProp<ArtisanStackParamList>>();

  const {
    data: listings,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['listings'],
    queryFn: () => service.listListings(),
  });

  // Check local outbox for unsynced mutations every time this screen gains focus.
  // This is our offline-sync indicator — no network library needed, we just
  // look at whether anything is still sitting in the local queue.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const db = await getDb();
          const row = await db.getFirstAsync<{ count: number }>(
            `SELECT COUNT(*) as count FROM outbox WHERE status = 'pending'`
          );
          if (!cancelled) setPendingSyncCount(row?.count ?? 0);
        } catch {
          // Table may not exist yet on very first boot — treat as zero, not an error.
          if (!cancelled) setPendingSyncCount(0);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const handleCardPress = (listing: Listing) => {
    switch (listing.state) {
      case 'draft':
      case 'rejected':
      case 'failed':
        useDraftStore.getState().setActiveDraft(listing.id);
        navigation.navigate('Capture');
        break;
      case 'awaiting_confirmation':
        navigation.navigate('ConfirmDetails', {
          draftId: listing.id,
          transcriptId: listing.catalogue?.catalogue.source.transcript_id ?? 'transcript_uuid',
        });
        break;
      case 'awaiting_approval':
      case 'approved':
      case 'export_queued':
      case 'exported':
        navigation.navigate('Price', { draftId: listing.id });
        break;
    }
  };

  if (isLoading) {
    return <ProcessingIndicator />;
  }

  return (
    <View style={styles.container}>
      {pendingSyncCount > 0 && (
        <Banner
          visible
          icon="cloud-upload-outline"
          style={styles.syncBanner}
        >
          {pendingSyncCount} update{pendingSyncCount > 1 ? 's' : ''} waiting to sync when you're back online.
        </Banner>
      )}

      <FlatList
        data={listings}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => {
              refetch();
              queryClient.invalidateQueries({ queryKey: ['listings'] });
            }}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text variant="bodyLarge" style={{ color: colors.text }}>
              No listings yet. Tap + to start your first one.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const meta = STATE_META[item.state];
          return (
            <Card style={styles.card} onPress={() => handleCardPress(item)}>
              <Card.Content>
                <View style={styles.cardHeader}>
                  <Text variant="titleMedium" style={{ color: colors.text, flex: 1 }}>
                    {item.catalogue?.catalogue.title.en ?? 'Untitled draft'}
                  </Text>
                  <Chip
                    style={{ backgroundColor: meta.bg }}
                    textStyle={{ color: meta.color, fontSize: 12 }}
                    compact
                  >
                    {meta.label}
                  </Chip>
                </View>
                <Text variant="bodySmall" style={styles.timestamp}>
                  Updated {new Date(item.updated_at).toLocaleDateString()}
                </Text>
              </Card.Content>
            </Card>
          );
        }}
      />

      <FAB
        icon="plus"
        style={styles.fab}
        color="#FFFFFF"
        customSize={64}
        onPress={() => navigation.navigate('Capture')}
        />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  syncBanner: { backgroundColor: '#FCEFD6' },
  listContent: { padding: spacing.md, paddingBottom: spacing.xxl },
  card: { marginBottom: spacing.sm, backgroundColor: colors.surface },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  timestamp: { color: colors.text, opacity: 0.6, marginTop: spacing.xs },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    backgroundColor: colors.primary,
  },
});