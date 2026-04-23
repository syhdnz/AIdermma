import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, sendPasswordResetEmail, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const storage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();

export const resetPassword = async (email: string) => {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    console.error("Error sending password reset email:", error);
    throw error;
  }
};

export const saveUserToFirestore = async (user: any) => {
  if (!user) return;
  const userRef = doc(db, 'users', user.uid);
  
  // Note: Firestore rules will block this if email_verified is false
  // For Google users, it's usually true. For Email users, they must verify first.
  
  try {
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        email: user.email,
        displayName: user.displayName || '',
        photoURL: user.photoURL || '',
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });
    } else {
      await setDoc(userRef, {
        lastLoginAt: serverTimestamp(),
        displayName: user.displayName || userSnap.data().displayName,
        photoURL: user.photoURL || userSnap.data().photoURL,
      }, { merge: true });
    }
  } catch (error) {
    console.warn("User profile sync failed (likely due to verification):", error);
  }
};

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    await saveUserToFirestore(result.user);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google:", error);
    throw error;
  }
};

export const signUpWithEmail = async (email: string, pass: string, name: string) => {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, pass);
    await sendEmailVerification(result.user);
    await saveUserToFirestore({
      ...result.user,
      displayName: name
    });
    return result.user;
  } catch (error) {
    console.error("Error signing up:", error);
    throw error;
  }
};

export const signInWithEmail = async (email: string, pass: string) => {
  try {
    const result = await signInWithEmailAndPassword(auth, email, pass);
    await saveUserToFirestore(result.user);
    return result.user;
  } catch (error) {
    console.error("Error signing in:", error);
    throw error;
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out:", error);
    throw error;
  }
};
