// src/features/coordinator-review/CoordinatorReviewScreen.tsx
import React, { useState, useLayoutEffect, useRef, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Keyboard, type LayoutChangeEvent } from 'react-native';
import { Text, Button, TextInput } from 'react-native-paper';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../../store/authStore';
import type { CoordinatorStackParamList } from '../../types/navigation';
import { colors, spacing } from '../../theme';
import type { Claim } from '../../types/contracts';
import { service } from '../../services';
import { ProcessingIndicator, BottomDock } from '../../components';

export default function CoordinatorReviewScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<CoordinatorStackParamList>>();
  const route = useRoute<RouteProp<CoordinatorStackParamList, 'CoordinatorDashboard'>>();
  const headerHeight = useHeaderHeight();
  const listingId = 'mock_listing_123';

  const scrollViewRef = useRef<ScrollView>(null);
  const inputOffsets = useRef<Record<string, number>>({});
  const activeInputRef = useRef<string | null>(null);
  const [keyboardSpace, setKeyboardSpace] = useState(0);

  const [loading, setLoading] = useState(false);
  const [evidenceNotes, setEvidenceNotes] = useState<Record<string, string>>({});
  const [claimDecisions, setClaimDecisions] = useState<Record<string, 'verified' | 'rejected'>>({});
  const [listingReason, setListingReason] = useState('');
  const [listingDecisionStatus, setListingDecisionStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');

  const scrollToInput = (key: string | null) => {
    if (!key) return;
    const y = inputOffsets.current[key];
    if (typeof y === 'number') {
      scrollViewRef.current?.scrollTo({
        y: Math.max(0, y - 16),
        animated: true,
      });
    }
  };

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        const h = e.endCoordinates?.height || 300;
        setKeyboardSpace(h);
        if (activeInputRef.current) {
          const key = activeInputRef.current;
          setTimeout(() => scrollToInput(key), 50);
          setTimeout(() => scrollToInput(key), 180);
        }
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardSpace(0);
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleInputLayout = (key: string, e: LayoutChangeEvent) => {
    inputOffsets.current[key] = e.nativeEvent.layout.y;
  };

  const handleInputFocus = (key: string) => {
    activeInputRef.current = key;
    scrollToInput(key);
    setTimeout(() => scrollToInput(key), 100);
    setTimeout(() => scrollToInput(key), 250);
    setTimeout(() => scrollToInput(key), 450);
  };

  const handleSwitchRole = async () => {
    try {
      await SecureStore.deleteItemAsync('userToken');
    } catch {}
    useAuthStore.getState().logout();
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={handleSwitchRole}
          style={styles.switchRoleBtn}
          accessibilityRole="button"
          accessibilityLabel="Switch Role"
        >
          <Text style={styles.switchRoleText}>Switch Role</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  // Hard rule (build guide): sensitive claims cannot publish without evidence + verification.
  const mockClaims: Claim[] = [
    { claim: 'handloom_weave', asserted_by_artisan: true, coordinator_verified: false, evidence_note: null },
    { claim: 'natural_dye', asserted_by_artisan: true, coordinator_verified: false, evidence_note: null },
  ];

  const [claimError, setClaimError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);

  const allClaimsDecided = mockClaims.every((c) => claimDecisions[c.claim]);

  const formatClaimLabel = (raw: string) => {
    return raw
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const handleClaimDecision = async (claimId: string, decision: 'verified' | 'rejected') => {
    setClaimError(null);
    const prevDecision = claimDecisions[claimId];
    setClaimDecisions((prev) => ({ ...prev, [claimId]: decision }));
    try {
      await service.reviewClaim(listingId, claimId, {
        decision,
        evidence_note: evidenceNotes[claimId] ?? '',
        reason: decision === 'rejected' ? 'Insufficient evidence' : null,
      });
    } catch (err) {
      // Revert optimistic update on failure
      setClaimDecisions((prev) => {
        const next = { ...prev };
        if (prevDecision) next[claimId] = prevDecision;
        else delete next[claimId];
        return next;
      });
      setClaimError('Could not save claim decision. Check connection and try again.');
    }
  };

  const handleListingDecision = async (decision: 'approved' | 'rejected') => {
    if (decision === 'approved' && !allClaimsDecided) {
      setClaimError('Resolve every claim (Verify or Reject) before approving the listing.');
      return;
    }
    if (decision === 'rejected' && !listingReason.trim()) {
      setReasonError('Reason is required to reject a listing.');
      return;
    }
    setReasonError(null);
    setClaimError(null);
    setLoading(true);
    try {
      await service.decideApproval(listingId, { decision, reason: listingReason });
      setListingDecisionStatus(decision);
    } catch (err) {
      setClaimError('Could not submit decision. Check connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <ProcessingIndicator hint="Submitting coordinator decision..." />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={[
          styles.container,
          { paddingBottom: keyboardSpace > 0 ? keyboardSpace + 160 : 360 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
      {/* Workstation Header */}
      <View style={styles.header}>
        <Text style={styles.kicker}>COMPLIANCE WORKSTATION</Text>
        <Text style={styles.title}>Review Queue</Text>
        <Text style={styles.subtitle}>ID: {listingId} · Artisan submission awaiting coordinator sign-off</Text>
      </View>

      {/* Listing Summary Card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>ITEM</Text>
          <Text style={styles.summaryValue}>Handcrafted Silk Saree</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>CRAFT CLUSTER</Text>
          <Text style={styles.summaryValue}>Varanasi Handloom Guild</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>STATUS</Text>
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>
              {listingDecisionStatus === 'approved'
                ? 'Approved'
                : listingDecisionStatus === 'rejected'
                ? 'Rejected'
                : 'Pending Verification'}
            </Text>
          </View>
        </View>
      </View>

      {/* Approved State Banner */}
      {listingDecisionStatus === 'approved' && (
        <View style={styles.approvedCard}>
          <Text style={styles.approvedTitle}>Listing Approved</Text>
          <Text style={styles.approvedText}>
            All sensitive claims have been verified. The catalog entry is signed and ready for marketplace publication.
          </Text>
        </View>
      )}

      {/* Sensitive Claims Section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Sensitive Claims</Text>
        <Text style={styles.sectionCaption}>
          Statutory certification requires documented verification before marketplace export.
        </Text>
      </View>

      {claimError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{claimError}</Text>
        </View>
      )}

      {mockClaims.map((c) => {
        const decision = claimDecisions[c.claim];
        return (
          <View
            key={c.claim}
            style={styles.claimCard}
            onLayout={(e) => handleInputLayout(c.claim, e)}
          >
            <View style={styles.claimHeader}>
              <View style={styles.claimTag}>
                <Text style={styles.claimTagText}>CLAIM</Text>
              </View>
              <Text style={styles.claimTitle}>{formatClaimLabel(c.claim)}</Text>
              <View
                style={[
                  styles.claimStatusBadge,
                  decision === 'verified' && styles.claimStatusVerified,
                  decision === 'rejected' && styles.claimStatusRejected,
                ]}
              >
                <Text
                  style={[
                    styles.claimStatusText,
                    decision === 'verified' && styles.claimStatusTextVerified,
                    decision === 'rejected' && styles.claimStatusTextRejected,
                  ]}
                >
                  {decision === 'verified' ? 'Verified' : decision === 'rejected' ? 'Rejected' : 'Unreviewed'}
                </Text>
              </View>
            </View>

            <Text style={styles.artisanAssertion}>Asserted by artisan during craft recording.</Text>

            <TextInput
              mode="outlined"
              label="Coordinator Evidence Note"
              placeholder="e.g. Inspected loom mechanism and verified silk mark tag"
              value={evidenceNotes[c.claim] || ''}
              onChangeText={(text) => setEvidenceNotes((prev) => ({ ...prev, [c.claim]: text }))}
              onFocus={() => handleInputFocus(c.claim)}
              outlineColor={colors.border}
              activeOutlineColor={colors.secondary}
              textColor={colors.text}
              style={styles.input}
              theme={{ colors: { background: colors.surface } }}
            />

            <View style={styles.claimActionRow}>
              <Button
                mode={decision === 'verified' ? 'contained' : 'outlined'}
                onPress={() => handleClaimDecision(c.claim, 'verified')}
                buttonColor={decision === 'verified' ? colors.secondary : undefined}
                textColor={decision === 'verified' ? '#FFFFFF' : colors.secondary}
                style={[styles.claimBtn, decision !== 'verified' && styles.claimBtnOutlined]}
              >
                Verify Claim
              </Button>
              <Button
                mode={decision === 'rejected' ? 'contained' : 'outlined'}
                onPress={() => handleClaimDecision(c.claim, 'rejected')}
                buttonColor={decision === 'rejected' ? colors.error : undefined}
                textColor={decision === 'rejected' ? '#FFFFFF' : colors.error}
                style={[styles.claimBtn, decision !== 'rejected' && styles.claimBtnRejectOutlined]}
              >
                Reject Claim
              </Button>
            </View>
          </View>
        );
      })}

      {/* Final Decision Section (visible if not yet approved/rejected) */}
      {listingDecisionStatus === 'pending' && (
        <View
          style={styles.decisionCard}
          onLayout={(e) => handleInputLayout('decision', e)}
        >
          <Text style={styles.sectionTitle}>Final Decision</Text>
          <Text style={styles.sectionCaption}>
            Decision will be permanently logged against coordinator credentials.
          </Text>

          <TextInput
            mode="outlined"
            label="Decision Reason / Auditor Notes"
            placeholder="Required if rejecting listing. Optional otherwise."
            value={listingReason}
            onChangeText={setListingReason}
            onFocus={() => handleInputFocus('decision')}
            outlineColor={colors.border}
            activeOutlineColor={colors.secondary}
            textColor={colors.text}
            style={styles.input}
            multiline
            numberOfLines={3}
            theme={{ colors: { background: colors.surface } }}
          />

          {reasonError && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{reasonError}</Text>
            </View>
          )}

          {!allClaimsDecided && (
            <View style={styles.instructionBanner}>
              <Text style={styles.instructionText}>
                All claims must be individually verified or rejected before approving.
              </Text>
            </View>
          )}

        </View>
      )}

      <View style={styles.bottomSpacer} />
    </ScrollView>

    {/* Docked Action Bar */}
    {listingDecisionStatus === 'pending' && (
      <BottomDock>
        <View style={styles.actionRow}>
          <Button
            mode="contained"
            onPress={() => handleListingDecision('approved')}
            buttonColor={colors.secondary}
            textColor="#FFFFFF"
            disabled={!allClaimsDecided}
            style={styles.decisionBtn}
            contentStyle={{ height: 48 }}
          >
            Approve Listing
          </Button>
          <Button
            mode="outlined"
            onPress={() => handleListingDecision('rejected')}
            textColor={colors.error}
            style={[styles.decisionBtn, styles.rejectBtn]}
            contentStyle={{ height: 48 }}
          >
            Reject Listing
          </Button>
        </View>
      </BottomDock>
    )}

    {listingDecisionStatus === 'approved' && (
      <BottomDock>
        <Button
          mode="contained"
          onPress={() => navigation.navigate('PublishExport', { listingId })}
          buttonColor={colors.secondary}
          textColor="#FFFFFF"
          style={styles.primaryActionBtn}
          contentStyle={{ height: 48 }}
        >
          Proceed to Marketplace Export
        </Button>
      </BottomDock>
    )}
  </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl + 48,
    backgroundColor: colors.background,
    flexGrow: 1,
  },
  header: {
    marginBottom: spacing.lg,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: colors.textMuted,
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: colors.textMuted,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  statusBadge: {
    backgroundColor: colors.badgeNeutral,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  approvedCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.secondary,
    borderRadius: 8,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  approvedTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.secondary,
    marginBottom: 4,
  },
  approvedText: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  primaryActionBtn: {
    borderRadius: 8,
    minHeight: spacing.tapTarget,
    justifyContent: 'center',
  },
  sectionHeader: {
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  sectionCaption: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  claimCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  claimHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  claimTag: {
    backgroundColor: colors.badgeNeutral,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  claimTagText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: colors.textMuted,
  },
  claimTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  claimStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: colors.badgeNeutral,
  },
  claimStatusVerified: {
    backgroundColor: '#E8ECF2',
  },
  claimStatusRejected: {
    backgroundColor: '#F7EBE8',
  },
  claimStatusText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  claimStatusTextVerified: {
    color: colors.secondary,
  },
  claimStatusTextRejected: {
    color: colors.error,
  },
  artisanAssertion: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
    fontSize: 13,
  },
  claimActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 4,
  },
  claimBtn: {
    flex: 1,
    borderRadius: 8,
  },
  claimBtnOutlined: {
    borderColor: colors.border,
  },
  claimBtnRejectOutlined: {
    borderColor: colors.border,
  },
  decisionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  instructionBanner: {
    backgroundColor: colors.badgeNeutral,
    padding: spacing.sm,
    borderRadius: 6,
    marginBottom: spacing.md,
  },
  instructionText: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 16,
  },
  errorBanner: {
    backgroundColor: '#F7EBE8',
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 6,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  errorBannerText: {
    fontSize: 12,
    color: colors.error,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  decisionBtn: {
    flex: 1,
    borderRadius: 8,
    minHeight: spacing.tapTarget,
    justifyContent: 'center',
  },
  rejectBtn: {
    borderColor: colors.error,
  },
  bottomSpacer: {
    height: 40,
  },
  switchRoleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: spacing.sm,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.indigoBorder,
    backgroundColor: colors.indigoLight,
  },
  switchRoleText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.secondary,
  },
});