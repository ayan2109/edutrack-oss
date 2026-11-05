import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../firebase';

const AuthContext = createContext(null);
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

async function loadProfile(user, forceRefresh = false) {
  const token = await user.getIdToken(forceRefresh);
  const response = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Unable to load account profile');
  return data.user;
}

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(auth.currentUser);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!active) return;
      setFirebaseUser(user);
      setLoading(true);
      setProfileError('');
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }
      try {
        const nextProfile = await loadProfile(user);
        if (active) setProfile(nextProfile);
      } catch (error) {
        if (active) { setProfile(null); setProfileError(error.message || 'Unable to load profile'); }
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  const value = useMemo(() => ({
    firebaseUser, profile, loading, profileError,
    refreshProfile: async () => {
      if (!auth.currentUser) return null;
      const nextProfile = await loadProfile(auth.currentUser, true);
      setProfile(nextProfile);
      setProfileError('');
      return nextProfile;
    },
    logout: () => signOut(auth)
  }), [firebaseUser, profile, loading, profileError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
