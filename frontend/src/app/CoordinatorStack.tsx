// src/app/CoordinatorStack.tsx
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CoordinatorReviewScreen from '../features/coordinator-review/CoordinatorReviewScreen';
import PublishExportScreen from '../features/publish-export/PublishExportScreen';

const Stack = createNativeStackNavigator();

export default function CoordinatorStack() {
  return (
    <Stack.Navigator>
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