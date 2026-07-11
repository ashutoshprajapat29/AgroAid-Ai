import { createContext, useContext, useEffect, useState, useRef } from "react";
import { 
  User as FirebaseUser, 
  onAuthStateChanged, 
  signInWithPopup,
  signInWithRedirect,
  GoogleAuthProvider, 
  signOut,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult
} from "firebase/auth";
import { doc, getDoc, setDoc, getDocFromServer, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";
import { handleFirestoreError, OperationType } from "./firebaseUtils";

interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  farmDetails?: string;
  preferredLanguage?: string;
}

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  login: () => Promise<void>;
  sendOTP: (phoneNumber: string) => Promise<void>;
  verifyOTP: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        try {
          const docRef = doc(db, "users", user.uid);
          let docSnap;
          
          try {
            // Try fetching directly from server first to bypass stale local cache
            docSnap = await getDocFromServer(docRef);
          } catch (readErr) {
            console.warn("getDocFromServer failed, falling back to cached getDoc:", readErr);
            try {
              docSnap = await getDoc(docRef);
            } catch (fallbackErr) {
              handleFirestoreError(fallbackErr, OperationType.GET, `users/${user.uid}`);
              throw fallbackErr;
            }
          }
          
          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
          } else {
            // New user defaults
            const savedLang = localStorage.getItem('preferredLanguage') || "Hindi";
            const newProfile: UserProfile = {
              uid: user.uid,
              displayName: user.displayName || "Anonymous",
              email: user.email || "",
              photoURL: user.photoURL || "",
              farmDetails: "",
              preferredLanguage: savedLang
            };
            try {
              await setDoc(docRef, { ...newProfile, createdAt: serverTimestamp() });
              setProfile(newProfile);
            } catch (writeErr) {
              handleFirestoreError(writeErr, OperationType.CREATE, `users/${user.uid}`);
              throw writeErr;
            }
          }
        } catch (error) {
          // Outer error handler - silent fallback
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = async () => {
    if (signingIn) return;
    setSigningIn(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Auth Error:", error.code);
      if (error.code === 'auth/popup-blocked') {
        // Popup blocked — silently fall back to redirect
        try {
          const fallbackProvider = new GoogleAuthProvider();
          fallbackProvider.setCustomParameters({ prompt: 'select_account' });
          await signInWithRedirect(auth, fallbackProvider);
          return; // Page will navigate away
        } catch (redirectErr: any) {
          console.error("Redirect fallback failed:", redirectErr);
          alert('Sign-in failed. Please allow popups for this site and try again.');
        }
      } else if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
        // User closed the popup — not an error
      } else {
        const USER_FRIENDLY_ERRORS: Record<string, string> = {
          'auth/user-disabled': 'Your account has been disabled. Please contact support.',
          'auth/network-request-failed': 'Network error. Please check your connection and try again.',
          'auth/too-many-requests': 'Too many sign-in attempts. Please wait a few minutes and try again.',
          'auth/account-exists-with-different-credential': 'An account already exists with this email using a different sign-in method.',
          'auth/invalid-credential': 'Invalid credentials. Please try again.',
        };
        alert(USER_FRIENDLY_ERRORS[error.code] || 'Sign-in failed. Please try again.');
      }
    } finally {
      setSigningIn(false);
    }
  };

  const logout = () => {
    setConfirmationResult(null);
    clearRecaptcha();
    return signOut(auth);
  };

  const clearRecaptcha = () => {
    if (recaptchaVerifierRef.current) {
      try { recaptchaVerifierRef.current.clear(); } catch (_) { /* ignore */ }
      recaptchaVerifierRef.current = null;
    }
    // Remove the old container completely from the DOM
    const container = document.getElementById('recaptcha-container');
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  };

  const setupRecaptcha = () => {
    // Always clear stale verifier and DOM element first
    clearRecaptcha();

    // Create a brand new container element dynamically
    const container = document.createElement('div');
    container.id = 'recaptcha-container';
    // Style it invisible and place it offscreen
    container.style.position = 'fixed';
    container.style.visibility = 'hidden';
    container.style.pointerEvents = 'none';
    document.body.appendChild(container);

    const verifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
      callback: () => {
        // reCAPTCHA solved
      }
    });
    recaptchaVerifierRef.current = verifier;
    return verifier;
  };

  const sendOTP = async (phoneNumber: string) => {
    try {
      const verifier = setupRecaptcha();
      const result = await signInWithPhoneNumber(auth, phoneNumber, verifier);
      setConfirmationResult(result);
    } catch (error: any) {
      // Clear verifier on ANY failure so the next attempt gets a fresh reCAPTCHA
      clearRecaptcha();
      console.error("SMS Send Error:", error);
      if (error.code === 'auth/invalid-app-credential') {
        throw new Error("auth/invalid-app-credential: reCAPTCHA verification failed. Please try again.");
      }
      if (error.code === 'auth/operation-not-allowed' || error.message?.includes('region enabled')) {
        throw new Error("Phone authentication or your specific region is not enabled in the Firebase Console. Please enable it in Authentication > Settings > SMS Regions.");
      }
      if (error.code === 'auth/billing-not-enabled') {
        throw new Error("Phone Login is temporarily unavailable because the project's SMS quota has been exceeded. Please use 'Continue with Google' instead.");
      }
      if (error.code === 'auth/too-many-requests') {
        throw new Error("Too many requests. Please try again later.");
      }
      throw error;
    }
  };

  const verifyOTP = async (code: string) => {
    if (!confirmationResult) throw new Error("No pending confirmation found");
    try {
      await confirmationResult.confirm(code);
      setConfirmationResult(null);
      // Clean up verifier after successful login
      clearRecaptcha();
    } catch (error: any) {
      console.error("OTP Verification Error:", error);
      throw error;
    }
  };

  const updateProfile = async (data: Partial<UserProfile>) => {
    if (!user) return;
    const path = `users/${user.uid}`;
    try {
      const docRef = doc(db, "users", user.uid);
      // Security rules require specific fields for the user entity validation
      await setDoc(docRef, { 
        ...data, 
        uid: user.uid, 
        email: user.email || profile?.email || "",
        updatedAt: serverTimestamp() 
      }, { merge: true });
      setProfile(prev => prev ? { ...prev, ...data } : null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, sendOTP, verifyOTP, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
