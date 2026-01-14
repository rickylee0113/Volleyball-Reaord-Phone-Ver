import { signInWithPopup, signOut, User } from 'firebase/auth';
import { collection, addDoc, query, where, getDocs, deleteDoc, doc, orderBy, Timestamp } from 'firebase/firestore';
import { auth, googleProvider, db } from '../firebaseConfig';
import { SavedGame } from '../types';

// --- Authentication ---
export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Login failed", error);
    throw error;
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout failed", error);
    throw error;
  }
};

// --- Firestore Database ---

// Save a match
export const saveMatchToCloud = async (userId: string, saveData: SavedGame, fileName: string) => {
  try {
    // Add metadata for querying
    const docData = {
      userId,
      fileName,
      savedAt: Timestamp.now(),
      // Spread the actual game data
      config: saveData.config,
      state: saveData.state,
    };

    const docRef = await addDoc(collection(db, "matches"), docData);
    return docRef.id;
  } catch (e) {
    console.error("Error adding document: ", e);
    throw e;
  }
};

// Get all matches for a user
export const getMatchesFromCloud = async (userId: string) => {
  try {
    const q = query(
      collection(db, "matches"), 
      where("userId", "==", userId),
      orderBy("savedAt", "desc")
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        key: doc.id, // Firestore Doc ID
        name: data.fileName || '未命名比賽',
        date: data.savedAt?.toDate().toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
        fullData: {
          config: data.config,
          state: data.state,
          savedAt: data.savedAt?.toMillis()
        } as SavedGame
      };
    });
  } catch (e) {
    console.error("Error fetching documents: ", e);
    throw e;
  }
};

// Delete a match
export const deleteMatchFromCloud = async (docId: string) => {
  try {
    await deleteDoc(doc(db, "matches", docId));
  } catch (e) {
    console.error("Error deleting document: ", e);
    throw e;
  }
};
