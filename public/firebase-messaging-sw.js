importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

const firebaseConfig = {
  projectId: "farming-ai-c1f6b",
  appId: "1:213130280726:web:9efbb042ab6c65db6c9a37",
  apiKey: "AIzaSyDyVWdFn69my5eEzTrLXLK5CjLR1Bh2Fm8",
  authDomain: "farming-ai-c1f6b.firebaseapp.com",
  storageBucket: "farming-ai-c1f6b.firebasestorage.app",
  messagingSenderId: "213130280726",
  measurementId: "G-PX6K7V3DS3"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification?.title || 'FarmGuide AI Task';
  const notificationOptions = {
    body: payload.notification?.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
