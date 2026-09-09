// src/app/ArtisanStack

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MyListingsScreen from '../features/my-listings/MyListingsScreen';
import CaptureScreen from '../features/capture/CaptureScreen';
import ImageReviewScreen from '../features/image-review/ImageReviewScreen';
import SpeakScreen from '../features/speak/SpeakScreen';
import ConfirmDetailsScreen from '../features/confirm-details/ConfirmDetailsScreen';
import PriceScreen from '../features/price/PriceScreen';
import SubmitApprovalScreen from '../features/submit-approval/SubmitApprovalScreen';

const Stack = createNativeStackNavigator();

export default function ArtisanStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="MyListings"
        component={MyListingsScreen}
        options={{ title: 'My Drafts & Listings' }}
      />
      <Stack.Screen
        name="Capture"
        component={CaptureScreen}
        options={{ title: 'Capture Product', headerShown: false }}
      />
      <Stack.Screen
        name="ImageReview"
        component={ImageReviewScreen}
        options={{ title: 'Review Photo' }}
      />
      <Stack.Screen
        name="Speak" 
        component={SpeakScreen}
        options={{ title: 'Speak' }} />
      <Stack.Screen 
        name="Price"
        component={PriceScreen}
        options={{ title: 'Price' }}/>
      <Stack.Screen 
        name="ConfirmDetails" 
        component={ConfirmDetailsScreen}
        options={{ title: 'Confirm Details'}}
        />
      <Stack.Screen
        name="SubmitApproval"
        component={SubmitApprovalScreen}
        options={{ title: 'Submit for Approval'}}
        />
    </Stack.Navigator>
  );
}