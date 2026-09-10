// src/types/navigation.ts
import type { NavigatorScreenParams } from '@react-navigation/native';

export type ArtisanStackParamList = {
  SignIn: undefined;
  MyListings: undefined;
  Capture: undefined;
  ImageReview: { draftId: string };
  Speak: { draftId: string };
  ConfirmDetails: { draftId: string; transcriptId: string };
  Price: { draftId: string };
  SubmitApproval: { draftId: string };
};

export type CoordinatorStackParamList = {
  CoordinatorDashboard: undefined;
  PublishExport: { listingId: string };
};

export type RootStackParamList = {
  Auth: undefined;
  ArtisanStack: NavigatorScreenParams<ArtisanStackParamList>;
  CoordinatorStack: NavigatorScreenParams<CoordinatorStackParamList>;
  RoleError: undefined;
};

// Global typing for useNavigation
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}