import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { loginDriver } from '../src/services/api';

export default function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkExistingSession();
  }, []);

  const checkExistingSession = async () => {
    try {
      const busData = await SecureStore.getItemAsync('busData');
      if (busData) {
        // Driver is already logged in, navigate to dashboard
        router.replace('/dashboard');
      }
    } catch (error) {
      console.log('Error checking session:', error);
    } finally {
      setChecking(false);
    }
  };

  const handleLogin = async () => {
    const cleanPhone = phone.trim();
    const cleanPassword = password.trim();

    if (!cleanPhone || !cleanPassword) {
      Alert.alert('Error', 'Please enter both phone and password');
      return;
    }

    setLoading(true);
    try {
      const response = await loginDriver(cleanPhone, cleanPassword);
      if (response && response.success) {
        // Save driver info always
        await SecureStore.setItemAsync('driverData', JSON.stringify(response.driver));
        
        if (response.bus) {
          // Bus is assigned — save and go to dashboard normally
          await SecureStore.setItemAsync('busData', JSON.stringify(response.bus));
        } else {
          // No bus assignment yet — still allow login but clear any stale busData
          await SecureStore.deleteItemAsync('busData');
        }
        router.replace('/dashboard');
      } else {
        Alert.alert('Login Failed', 'The server returned an unexpected response.');
      }
    } catch (error: any) {
      console.error('Login Error:', error);
      const errorMsg = error.response?.data?.error || error.message || error.toString();
      Alert.alert('Login Failed', errorMsg);
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#FFD700" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.brandContainer}>
        <Text style={styles.logo}>🚌 MPNMJ DRIVERS</Text>
      </View>

      <Text style={styles.title}>Welcome Back</Text>
      <Text style={styles.subtitle}>Login to start your shift</Text>

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Phone Number"
          placeholderTextColor="#A0A0A0"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#A0A0A0"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
        />

        <TouchableOpacity 
          style={styles.button}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.buttonText}>LOGIN</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    justifyContent: 'center',
    padding: 24,
  },
  brandContainer: {
    marginBottom: 40,
    alignItems: 'center',
  },
  logo: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFD700',
    letterSpacing: 2,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#A0A0A0',
    marginBottom: 40,
  },
  inputContainer: {
    gap: 16,
  },
  input: {
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#FFFFFF',
  },
  button: {
    backgroundColor: '#FFD700',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});
