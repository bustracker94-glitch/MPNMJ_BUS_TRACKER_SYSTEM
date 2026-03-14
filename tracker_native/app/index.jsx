import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

const { width } = Dimensions.get('window');

export default function WelcomeScreen() {
    const router = useRouter();

    const handleStart = () => {
        router.replace('/home');
    };

    return (
        <View style={styles.container}>
            <StatusBar style="light" />
            
            <View style={styles.hero}>
                <View style={styles.logoContainer}>
                    <Ionicons name="bus" size={60} color="#F59E0B" />
                </View>
                <Text style={styles.title}>MPNMJ</Text>
                <Text style={styles.subtitle}>BUS TRACKER</Text>
                <View style={styles.pill}>
                    <Text style={styles.pillText}>STUDENT PASS</Text>
                </View>
            </View>

            <View style={styles.footer}>
                <Text style={styles.welcomeText}>Welcome to the official tracking app.</Text>
                <Text style={styles.descText}>Get real-time updates and live GPS locations for all college buses.</Text>
                
                <TouchableOpacity style={styles.button} onPress={handleStart} activeOpacity={0.8}>
                    <Text style={styles.buttonText}>START TRACKING</Text>
                    <Ionicons name="arrow-forward" size={20} color="#fff" />
                </TouchableOpacity>
                
                <Text style={styles.copy}>Part of MPNMJ Engineering College Transport System</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a' },
    hero: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    logoContainer: {
        width: 120, height: 120, borderRadius: 40,
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 24,
        borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.2)'
    },
    title: { fontSize: 42, fontWeight: '900', color: '#fff', letterSpacing: -1 },
    subtitle: { fontSize: 16, fontWeight: '700', color: '#F59E0B', letterSpacing: 4, marginTop: -5 },
    pill: {
        backgroundColor: '#1e293b', paddingHorizontal: 12, paddingVertical: 4,
        borderRadius: 20, marginTop: 20, borderWidth: 1, borderColor: '#334155'
    },
    pillText: { color: '#94A3B8', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
    footer: { padding: 40, paddingBottom: 60, alignItems: 'center' },
    welcomeText: { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' },
    descText: { color: '#94A3B8', fontSize: 14, textAlign: 'center', marginTop: 12, lineHeight: 22 },
    button: {
        backgroundColor: '#F59E0B', width: '100%', height: 60,
        borderRadius: 20, flexDirection: 'row', alignItems: 'center',
        justifyContent: 'center', gap: 12, marginTop: 40,
        shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3, shadowRadius: 20, elevation: 10
    },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
    copy: { color: '#475569', fontSize: 10, marginTop: 30, fontWeight: '600' }
});
