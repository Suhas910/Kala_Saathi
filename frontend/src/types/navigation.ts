// src/types/navigation.ts
import type { NavigatorScreenParams } from '@react-navigation/native';

export type ArtisanStackParamList = {
  MyListings: undefined;
  Capture: { draftId?: string } | undefined;
  ImageReview: { draftId: string };
  Speak: { draftId: string };
  ConfirmDetails: { draftId: string; transcriptId?: string };
  Price: { draftId: string };
  SubmitApproval: { draftId: string };
};

export type CoordinatorStackParamList = {
  CoordinatorDashboard: { listingId?: string } | undefined;
  PublishExport: { listingId: string };
};

export type RootStackParamList = {
  Auth: undefined;
  ArtisanStack: NavigatorScreenParams<ArtisanStackParamList>;
  CoordinatorStack: NavigatorScreenParams<CoordinatorStackParamList>;
};

// Global typing for useNavigation
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}