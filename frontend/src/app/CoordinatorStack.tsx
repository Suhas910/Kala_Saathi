// src/app/CoordinatorStack.tsx
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CoordinatorReviewScreen from '../features/coordinator-review/CoordinatorReviewScreen';
import PublishExportScreen from '../features/publish-export/PublishExportScreen';

import { colors } from '../theme';

const Stack = createNativeStackNavigator();

export default function CoordinatorStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerTintColor: colors.text,
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 18,
          color: colors.text,
        },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen 
        name="CoordinatorDashboard" 
        component={CoordinatorReviewScreen} 
        options={{ title: 'Review Queue' }} 
      />
      <Stack.Screen 
        name="PublishExport" 
        component={PublishExportScreen} 
        options={{ title: 'Export Listing' }} 
      />
    </Stack.Navigator>
  );
}