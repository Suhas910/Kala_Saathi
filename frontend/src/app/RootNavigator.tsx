// src/app/RootNavigator

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/authStore';

// Screens & Stacks
import SignInScreen from '../features/onboarding/SignInScreen';
import ArtisanStack from './ArtisanStack';
import CoordinatorStack from './CoordinatorStack';

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { isAuthenticated, role } = useAuthStore();

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          // Unauthenticated Flow
          <Stack.Screen name="Auth" component={SignInScreen} />
        ) : role === 'artisan' ? (
          // Artisan Flow
          <Stack.Screen name="ArtisanStack" component={ArtisanStack} />
        ) : (
          // Coordinator Flow
          <Stack.Screen name="CoordinatorStack" component={CoordinatorStack} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}