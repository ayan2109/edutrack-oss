import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';

const InstitutionContext = createContext(null);
const STORAGE_KEY = 'edutrack.activeInstitutionId';
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
async function request(path, token, options = {}) {
  const response = await fetch(`${BASE}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(localStorage.getItem(STORAGE_KEY) ? { 'X-Institution-Id': localStorage.getItem(STORAGE_KEY) } : {}), ...(options.headers || {}) } });
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Institution request failed');
  return data;
}
export function InstitutionProvider({ children }) {
  const { firebaseUser, profile } = useAuth();
  const [institutions, setInstitutions] = useState([]);
  const [activeInstitutionId, setActiveInstitutionIdState] = useState(() => localStorage.getItem(STORAGE_KEY) || '');
  const [loadingInstitutions, setLoadingInstitutions] = useState(false);
  const [error, setError] = useState('');
  const refreshInstitutions = useCallback(async () => {
    if (!firebaseUser) { setInstitutions([]); return []; }
    setLoadingInstitutions(true); setError('');
    try {
      const data = await request('/institutions', await firebaseUser.getIdToken(true));
      const list = data.institutions || [];
      setInstitutions(list);
      const saved = localStorage.getItem(STORAGE_KEY);
      const selected = list.some(item => item.id === saved) ? saved : (list[0]?.id || '');
      setActiveInstitutionIdState(selected);
      if (selected) localStorage.setItem(STORAGE_KEY, selected); else localStorage.removeItem(STORAGE_KEY);
      return list;
    } catch (e) { setError(e.message); setInstitutions([]); return []; }
    finally { setLoadingInstitutions(false); }
  }, [firebaseUser]);
  useEffect(() => { refreshInstitutions(); }, [refreshInstitutions, profile?.uid]);
  const setActiveInstitutionId = useCallback((id) => {
    if (!institutions.some(item => item.id === id)) throw new Error('You do not have access to this institution.');
    localStorage.setItem(STORAGE_KEY, id); setActiveInstitutionIdState(id);
  }, [institutions]);
  const createInstitution = useCallback(async (payload) => {
    const data = await request('/institutions', await firebaseUser.getIdToken(true), { method: 'POST', body: JSON.stringify(payload) });
    await refreshInstitutions(); setActiveInstitutionIdState(data.institution.id); localStorage.setItem(STORAGE_KEY, data.institution.id);
    return data.institution;
  }, [firebaseUser, refreshInstitutions]);
  const activeInstitution = institutions.find(item => item.id === activeInstitutionId) || null;
  const value = useMemo(() => ({ institutions, activeInstitution, activeInstitutionId, setActiveInstitutionId, createInstitution, refreshInstitutions, loadingInstitutions, error }), [institutions, activeInstitution, activeInstitutionId, setActiveInstitutionId, createInstitution, refreshInstitutions, loadingInstitutions, error]);
  return <InstitutionContext.Provider value={value}>{children}</InstitutionContext.Provider>;
}
export function useInstitution() { const value = useContext(InstitutionContext); if (!value) throw new Error('useInstitution must be used inside InstitutionProvider'); return value; }
