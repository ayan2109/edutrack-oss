import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

// Firebase web configuration is public client configuration. Secure access with Auth and RTDB rules.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyAfNnV39wO1fFzNBU1vII6dyf81nipmDX4',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'edu-track3.firebaseapp.com',
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || 'https://edu-track3-default-rtdb.firebaseio.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'edu-track3',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'edu-track3.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '85392438844',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:85392438844:web:d418a5bccd0cbb544d3539',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-J8SYJF40K3'
};
const app=initializeApp(firebaseConfig);
export const auth=getAuth(app);
export const db=getDatabase(app);
