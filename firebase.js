import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyByXUWRfzXHkGAdaugxQtgBfig1_PAEfg0',
  authDomain: 'echovocab-app.firebaseapp.com',
  projectId: 'echovocab-app',
  storageBucket: 'echovocab-app.firebasestorage.app',
  messagingSenderId: '702568142031',
  appId: '1:702568142031:web:bfa640616f2f24275d93ba'
};

try {
  const firebaseApp = initializeApp(firebaseConfig);
  const auth = getAuth(firebaseApp);
  const provider = new GoogleAuthProvider();

  window.firebaseCloud = {
    auth,
    db: getFirestore(firebaseApp),
    onAuthStateChanged: (callback) => onAuthStateChanged(auth, callback),
    signInWithGoogle: () => signInWithPopup(auth, provider),
    signOut: () => signOut(auth)
  };
} catch (error) {
  window.firebaseCloudError = error;
}

window.dispatchEvent(new Event('firebase-cloud-ready'));
