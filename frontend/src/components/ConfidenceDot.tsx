// src/components/ConfidenceDot.tsx
import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { colors } from '../theme';

export const getConfidenceColor = (score: number) => {
  if (score >= 0.85) return colors.success;
  if (score >= 0.65) return colors.accent;
  return colors.error;
};

interface ConfidenceDotProps {
  confidence: number;
  style?: StyleProp<ViewStyle>;
}

export default function ConfidenceDot({ confidence, style }: ConfidenceDotProps) {
  return (
    <View
      style={[
        styles.confidenceDot,
        { backgroundColor: getConfidenceColor(confidence) },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  confidenceDot: { width: 12, height: 12, borderRadius: 6 },
});
