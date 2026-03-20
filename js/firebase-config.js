import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getDatabase, ref, push, get, set, update, onValue, onDisconnect, remove } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBZQZD6spO4erLwOg0eiEBwdnGQVExCMbE",
  authDomain: "artale-rjpq.firebaseapp.com",
  databaseURL: "https://artale-rjpq-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "artale-rjpq",
  storageBucket: "artale-rjpq.firebasestorage.app",
  messagingSenderId: "336647532035",
  appId: "1:336647532035:web:429351fad2adde3328a836"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

export { db, auth, signInAnonymously, onAuthStateChanged, ref, push, get, set, update, onValue, onDisconnect, remove };
