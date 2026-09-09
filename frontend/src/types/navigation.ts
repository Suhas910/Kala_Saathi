// src/types/navigation.ts
export type ArtisanStackParamList = {
  MyListings: undefined;
  Capture: { draftId?: string } | undefined;
  ImageReview: { draftId: string };
  Speak: { draftId: string };
  ConfirmDetails: { draftId: string; transcriptId?: string };
  Price: { draftId: string };
  SubmitApproval: { draftId: string };
};