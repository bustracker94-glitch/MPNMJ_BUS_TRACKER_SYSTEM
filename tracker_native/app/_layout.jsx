import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { activateKeepAwakeAsync } from 'expo-keep-awake';
import { useEffect } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';

export default function RootLayout() {
    useEffect(() => {
        activateKeepAwakeAsync();
    }, []);

    return (
        <ErrorBoundary>
            <GestureHandlerRootView style={{ flex: 1 }}>
                <StatusBar style="dark" />
                <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="index" />
                    <Stack.Screen name="home" />
                    <Stack.Screen name="buses" />
                    <Stack.Screen name="tracker" />
                    <Stack.Screen name="bus/[busId]" />
                </Stack>
            </GestureHandlerRootView>
        </ErrorBoundary>
    );
}
