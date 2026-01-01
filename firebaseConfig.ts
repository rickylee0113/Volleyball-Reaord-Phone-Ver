import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCJUfhq14RXP4-ikBl2FfrDnTatjugXHg8",
  authDomain: "volleyball-reaord-phone-ver.firebaseapp.com",
  projectId: "volleyball-reaord-phone-ver",
  storageBucket: "volleyball-reaord-phone-ver.firebasestorage.app",
  messagingSenderId: "825010153270",
  appId: "1:825010153270:web:4eba9528bee60440acf597"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);