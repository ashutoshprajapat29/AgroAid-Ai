import { useEffect, useRef } from 'react';
import { useAuth } from '../lib/AuthContext';
import { getMessagingInstance, db } from '../lib/firebase';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, setDoc } from 'firebase/firestore';

export default function NotificationManager() {
  const { user } = useAuth();
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!user) return;

    const setupNotifications = async () => {
      try {
        if (!('Notification' in window)) {
          console.log('This browser does not support notifications.');
          return;
        }

        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          const messaging = getMessagingInstance();
          if (messaging) {
            let currentToken = null;
            try {
              // Get FCM Token
              currentToken = await getToken(messaging, {
                vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY || undefined
              });
            } catch (err) {
              console.warn('FCM API Error: Failed to generate token. VAPID key issue or browser blocking.', err);
            }
              
            if (currentToken) {
              try {
                // Save token to Firestore using setDoc with merge so it creates the doc if it doesn't exist
                const userRef = doc(db, 'users', user.uid);
                await setDoc(userRef, {
                  fcmToken: currentToken,
                  notificationsEnabled: true
                }, { merge: true });
                console.log('FCM Token successfully registered and saved.');
              } catch (err) {
                console.error('Firestore Error: Cannot save token. Please check your Firestore Security Rules! Error:', err);
              }
            }

            // Listen for foreground messages — save unsubscribe for cleanup (Fix #11)
            unsubRef.current = onMessage(messaging, (payload) => {
              console.log('FCM Message received in foreground: ', payload);
              // Show a browser notification when app is open
              if (payload.notification) {
                new Notification(payload.notification.title || 'AgroAid Alert', {
                  body: payload.notification.body,
                  icon: '/pwa-192x192.png'
                });
              }
            });
          }
        }
      } catch (error) {
        console.error('Error setting up notifications:', error);
      }
    };

    // Give the messaging instance a short delay to ensure Firebase fully initializes
    const timer = setTimeout(setupNotifications, 3000);
    return () => {
      clearTimeout(timer);
      // Cleanup onMessage listener to prevent duplicates on remount
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, [user]);

  return null; // This is a purely logical component, it renders nothing.
}
