// src/app/CoordinatorStack

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CoordinatorReviewScreen from '../features/coordinator-review/CoordinatorReviewScreen';

const Stack = createNativeStackNavigator();

export default function CoordinatorStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="CoordinatorDashboard" 
        component={CoordinatorReviewScreen} 
        options={{ title: 'Review Queue' }} 
      />
    </Stack.Navigator>
  );
}