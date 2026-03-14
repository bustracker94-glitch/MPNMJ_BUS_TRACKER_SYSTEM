import { Stack } from 'expo-router';
import { ErrorBoundary } from '../components/ErrorBoundary';

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ title: 'Login' }} />
        <Stack.Screen name="dashboard" options={{ title: 'Dashboard', gestureEnabled: false }} />
      </Stack>
    </ErrorBoundary>
  );
}
