import React, { useEffect, useMemo, useState } from "react";
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import imageCompression from 'browser-image-compression';
import { initializeApp } from "firebase/app";
import { 
  getDatabase, 
  ref, 
  set, 
  onValue, 
  push,
  update,
  remove,
  get
} from "firebase/database";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  signOut
} from "firebase/auth";

// ---------- Firebase Config ----------
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API,
  authDomain: "pin-anon.firebaseapp.com",
  databaseURL: "https://pin-anon-default-rtdb.firebaseio.com",
  projectId: "pin-anon",
  storageBucket: "pin-anon.firebasestorage.app",
  messagingSenderId: "564572635192",
  appId: "1:564572635192:web:98d31c63a22b07383e26cd"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);

// MinIO S3 Client
const s3Client = new S3Client({
  endpoint: 'https://api.pinanonarchive.com',
  region: 'us-east-1',
  credentials: {
    accessKeyId: import.meta.env.VITE_MINIO_ACCESS_KEY,
    secretAccessKey: import.meta.env.VITE_MINIO_SECRET_KEY
  },
  forcePathStyle: true
});

const MINIO_BUCKET = 'uploads';
const MINIO_PUBLIC_URL = 'https://api.pinanonarchive.com';

// ---------- Config & utils ----------
const LS_USER = "carlisle_user";
const DEFAULT_ROOM = "main";
const ADMIN_PASSWORD = "EpicMan101";

// Xbox 360-style username generator
const adjectives = [
  "Big", "Small", "Fast", "Slow", "Dead", "Sad", "Happy", "Angry",
  "Quiet", "Loud", "Cold", "Hot", "Wet", "Dry", "Old", "New",
  "Half", "Full", "Empty", "Broken", "Fixed", "Lost", "Found", "Hidden",
  "Dizzy", "Sleepy", "Grumpy", "Fancy", "Plain", "Shiny", "Dull", "Tiny",
  "Giant", "Mini", "Mega", "Ultra", "Super", "Hyper", "Turbo", "Extreme",
  "Fuzzy", "Smooth", "Rough", "Sharp", "Blunt", "Thick", "Thin", "Wide"
];

const nouns = [
  "Dog", "Cat", "Fish", "Bird", "Mouse", "Frog", "Bear", "Wolf",
  "Fox", "Deer", "Duck", "Goose", "Cow", "Pig", "Sheep", "Goat",
  "Turtle", "Snail", "Crab", "Shrimp", "Clam", "Squid", "Whale", "Shark",
  "Tree", "Rock", "Cloud", "Moon", "Star", "Sun", "Wind", "Rain",
  "Box", "Cup", "Lamp", "Chair", "Table", "Door", "Window", "Wall",
  "Car", "Truck", "Bike", "Boat", "Plane", "Train", "Bus", "Van",
  "Pizza", "Taco", "Bread", "Cheese", "Apple", "Grape", "Melon", "Berry"
];

function generateUsername() {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj}${noun}${num}`;
}

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function now() {
  return Date.now();
}

function saveUser(u) {
  localStorage.setItem(LS_USER, JSON.stringify(u));
}

function loadUser() {
  try {
    return JSON.parse(localStorage.getItem(LS_USER)) || null;
  } catch (e) {
    return null;
  }
}

const EMPTY = {
  rooms: [{ id: DEFAULT_ROOM, name: "main room", invite: DEFAULT_ROOM }],
  posts: [],
  settings: { whisper: false },
  inviteCodes: {},
  users: {},
  usernames: {}
};

// Add CSS for animations
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  
  /* Better font rendering */
  * {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', sans-serif;
  }
`;
if (!document.head.querySelector('style[data-carlisle]')) {
  styleSheet.setAttribute('data-carlisle', 'true');
  document.head.appendChild(styleSheet);
}

// ---------- Main Component ----------
export default function Carlisle() {
  const [state, setState] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [legacyUserId, setLegacyUserId] = useState(null);
  const [user, setUser] = useState(() => {
    const existing = loadUser();
    if (existing?.id && existing?.username) {
      return existing;
    }
    const newUser = { 
      id: null,
      username: null,
      password: null,
      bio: null,
      profileImage: null,
      isAdmin: false,
      hasAccess: false,
      inviteCodesRemaining: 0,
      inviteCodesCreated: [],
      createdRooms: [],
      createdPosts: [],
      joinedRooms: [DEFAULT_ROOM]
    };
    localStorage.setItem(LS_USER, JSON.stringify(newUser));
    return newUser;
  });

  const [layout, setLayout] = useState(() => {
    return localStorage.getItem("carlisle_layout") || "single";
  });

  const [view, setView] = useState(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash.startsWith('profile/')) return 'profile';
    if (hash.startsWith('room/')) return 'room';
    if (hash === 'home') return 'home';
    if (hash === 'sounds') return 'sounds';
    return localStorage.getItem("carlisle_view") || "home";
  });

  const [room, setRoom] = useState(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash.startsWith('room/')) return hash.split('/')[1] || DEFAULT_ROOM;
    return localStorage.getItem("carlisle_room") || DEFAULT_ROOM;
  });

  const [showNew, setShowNew] = useState(false);
  const [profileView, setProfileView] = useState(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash.startsWith('profile/')) return hash.split('/')[1] || null;
    return null;
  });
  const [previousView, setPreviousView] = useState("home");
  const [sort, setSort] = useState("newest");
  const [whisper, setWhisper] = useState(false);
  const [search, setSearch] = useState("");
  const [inviteModal, setInviteModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [dark, setDark] = useState(() => {
    return localStorage.getItem("carlisle_dark") === "1";
  });
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("carlisle_theme") || "default";
  });
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

  // Theme color palettes
  const themes = {
    default: {
      bg: { light: '#fff', dark: '#000' },
      text: { light: '#000', dark: '#fff' },
      textMuted: { light: '#666', dark: '#999' },
      textDim: { light: '#999', dark: '#666' },
      border: { light: '#e5e5e5', dark: '#333' },
      borderDim: { light: '#f5f5f5', dark: '#1a1a1a' },
      bgAlt: { light: '#fafafa', dark: '#0a0a0a' }
    },
    serika: {
      bg: { light: '#e2b714', dark: '#323437' },
      text: { light: '#323437', dark: '#e2b714' },
      textMuted: { light: '#646669', dark: '#d1d0c5' },
      textDim: { light: '#969696', dark: '#646669' },
      border: { light: '#d1d0c5', dark: '#646669' },
      borderDim: { light: '#e8e6d5', dark: '#2c2e31' },
      bgAlt: { light: '#f5f3e8', dark: '#2c2e31' }
    },
    retrocast: {
      bg: { light: '#fefcfd', dark: '#2e2f33' },
      text: { light: '#2e2f33', dark: '#d6d5c9' },
      textMuted: { light: '#66646d', dark: '#a39e95' },
      textDim: { light: '#b3b1ba', dark: '#66646d' },
      border: { light: '#d6d5c9', dark: '#545557' },
      borderDim: { light: '#e8e7e1', dark: '#3d3e42' },
      bgAlt: { light: '#f5f4ed', dark: '#3d3e42' }
    },
    botanical: {
      bg: { light: '#f1f4e8', dark: '#1d2516' },
      text: { light: '#1d2516', dark: '#d0daba' },
      textMuted: { light: '#5a6749', dark: '#a8b491' },
      textDim: { light: '#9ba88a', dark: '#5a6749' },
      border: { light: '#c5d1b0', dark: '#4a5438' },
      borderDim: { light: '#e0e8d4', dark: '#2a3120' },
      bgAlt: { light: '#e8edd9', dark: '#2a3120' }
    },
    ocean: {
      bg: { light: '#e8f4f8', dark: '#16232e' },
      text: { light: '#16232e', dark: '#cad9e0' },
      textMuted: { light: '#4a6b7c', dark: '#96b1bf' },
      textDim: { light: '#8aa6b5', dark: '#4a6b7c' },
      border: { light: '#b3cdd9', dark: '#2d4a5c' },
      borderDim: { light: '#d9e8ef', dark: '#1d3240' },
      bgAlt: { light: '#dceaf2', dark: '#1d3240' }
    },
    rose: {
      bg: { light: '#fef3f4', dark: '#2e1e1f' },
      text: { light: '#2e1e1f', dark: '#f0d4d7' },
      textMuted: { light: '#8a5f64', dark: '#d4a3a8' },
      textDim: { light: '#c4a1a6', dark: '#8a5f64' },
      border: { light: '#e8c4c8', dark: '#5a3b3f' },
      borderDim: { light: '#f5e0e3', dark: '#3d2a2c' },
      bgAlt: { light: '#f9e6e9', dark: '#3d2a2c' }
    }
  };

  const getColor = (colorKey) => {
    const currentTheme = themes[theme] || themes.default;
    const mode = dark ? 'dark' : 'light';
    return currentTheme[colorKey]?.[mode] || '#000';
  };

  // Simple password hashing
  async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Validate username format
  function validateUsername(username) {
    if (!username || username.length < 3 || username.length > 30) {
      return "USERNAME MUST BE 3-30 CHARACTERS";
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return "USERNAME CAN ONLY CONTAIN LETTERS, NUMBERS, HYPHENS, AND UNDERSCORES";
    }
    return null;
  }

  // Create new account with username + password
  async function signUpUser(username, password, inviteCode) {
    try {
      const upperCode = inviteCode.toUpperCase().trim();
      
      // Validate username
      const usernameError = validateUsername(username);
      if (usernameError) {
        alert(usernameError);
        return false;
      }

      if (password.length < 6) {
        alert("PASSWORD MUST BE AT LEAST 6 CHARACTERS");
        return false;
      }
      
      // Check username availability (case-insensitive)
      const usernameLower = username.toLowerCase();
      const usernamesRef = ref(database, `appState/usernames/${usernameLower}`);
      const usernameSnapshot = await get(usernamesRef);
      
      if (usernameSnapshot.exists()) {
        alert("USERNAME ALREADY TAKEN");
        return false;
      }
      
      // Hash password
      const hashedPassword = await hashPassword(password);
      
      // Verify invite code
      const inviteRef = ref(database, `appState/inviteCodes/${upperCode}`);
      const inviteSnapshot = await get(inviteRef);
      
      const inviteData = inviteSnapshot.val();
      if (!inviteData || inviteData.used) {
        alert("INVALID OR USED INVITE CODE");
        return false;
      }
      
      // Sign in anonymously to Firebase to get a UID
      const userCredential = await signInAnonymously(auth);
      const firebaseUID = userCredential.user.uid;
      
      // Create new user
      const newUser = {
        id: firebaseUID,
        username: username,
        password: hashedPassword,
        bio: null,
        profileImage: null,
        isAdmin: false,
        hasAccess: true,
        inviteCodesRemaining: 3,
        inviteCodesCreated: [],
        createdRooms: [],
        createdPosts: [],
        joinedRooms: [DEFAULT_ROOM],
        createdAt: now()
      };
      
      // Save to Firebase
      const updates = {};
      updates[`users/${firebaseUID}`] = newUser;
      updates[`appState/usernames/${usernameLower}`] = firebaseUID;
      updates[`appState/inviteCodes/${upperCode}/used`] = true;
      updates[`appState/inviteCodes/${upperCode}/usedBy`] = firebaseUID;
      updates[`appState/inviteCodes/${upperCode}/usedAt`] = now();
      
      await update(ref(database), updates);
      
      // Set local state
      setUser(newUser);
      saveUser(newUser);
      
      alert(`ACCOUNT CREATED!\n\nUSERNAME: ${username}\n\nREMEMBER YOUR PASSWORD - it's the only way to access your account.`);
      return true;
    } catch (error) {
      console.error("Signup error:", error);
      alert("SIGNUP FAILED");
      return false;
    }
  }

  // Login with username + password
  async function loginUser(username, password) {
    try {
      // Get Firebase UID from username (case-insensitive)
      const usernameLower = username.toLowerCase();
      const usernameRef = ref(database, `appState/usernames/${usernameLower}`);
      const usernameSnapshot = await get(usernameRef);
      
      const firebaseUID = usernameSnapshot.val();
      if (!firebaseUID) {
        alert("USERNAME NOT FOUND");
        return false;
      }

      // Get user data
      const userRef = ref(database, `users/${firebaseUID}`);
      const userSnapshot = await get(userRef);
      
      const userData = userSnapshot.val();
      if (!userData) {
        alert("USER DATA NOT FOUND");
        return false;
      }

      // Verify password
      const hashedPassword = await hashPassword(password);
      if (userData.password !== hashedPassword) {
        alert("INCORRECT PASSWORD");
        return false;
      }
      
      // Ensure hasAccess is set
      const correctedUserData = {
        ...userData,
        hasAccess: true
      };

      // Set local state
      setUser(correctedUserData);
      saveUser(correctedUserData);
      
      // Update Firebase to ensure hasAccess is saved
      await update(ref(database, `users/${firebaseUID}`), { hasAccess: true });
      
      alert("LOGGED IN SUCCESSFULLY!");
      return true;
    } catch (error) {
      console.error("Login error:", error);
      alert("LOGIN FAILED");
      return false;
    }
  }

  // Logout user
  function logoutUser() {
    localStorage.removeItem(LS_USER);
    localStorage.removeItem("carlisle_layout");
    localStorage.removeItem("carlisle_view");
    localStorage.removeItem("carlisle_room");
    localStorage.removeItem("carlisle_dark");
    localStorage.removeItem("carlisle_theme");
    
    const newUser = { 
      id: null,
      username: null,
      password: null,
      bio: null,
      profileImage: null,
      isAdmin: false,
      hasAccess: false,
      inviteCodesRemaining: 0,
      inviteCodesCreated: [],
      createdRooms: [],
      createdPosts: [],
      joinedRooms: [DEFAULT_ROOM]
    };
    
    setUser(newUser);
    localStorage.setItem(LS_USER, JSON.stringify(newUser));
  }

  // Submit a report
  async function submitReport(type, targetId, reason, details) {
    try {
      const reportId = uid('report').slice(7);
      const reportData = {
        id: reportId,
        type,
        targetId,
        reason,
        details,
        reportedBy: user.id,
        reportedAt: now(),
        status: "pending"
      };
      
      const reportRef = ref(database, `appState/reports/${reportId}`);
      await set(reportRef, reportData);
      
      alert("REPORT SUBMITTED");
      return true;
    } catch (error) {
      console.error("Report error:", error);
      alert("REPORT FAILED");
      return false;
    }
  }

  // Clean up old service workers
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          registration.unregister();
          console.log('Unregistered old service worker');
        });
      });
    }
  }, []);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    
    const handleAdminBypass = () => {
      setUser((prev) => {
        const u = { ...prev, isAdmin: true, hasAccess: true, inviteCodesRemaining: 999 };
        saveUser(u);
        return u;
      });
    };
    window.addEventListener('adminBypass', handleAdminBypass);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('adminBypass', handleAdminBypass);
    };
  }, []);

  useEffect(() => {
    const stateRef = ref(database, 'appState');
    const unsubscribe = onValue(stateRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setState({
          ...EMPTY,
          ...data,
          posts: Array.isArray(data.posts) ? data.posts : (data.posts ? Object.values(data.posts) : []),
          rooms: Array.isArray(data.rooms) ? data.rooms : (data.rooms ? Object.values(data.rooms) : EMPTY.rooms),
          inviteCodes: data.inviteCodes || {},
          usernames: data.usernames || {}
        });
        setWhisper(data.settings?.whisper || false);
      } else {
        set(stateRef, EMPTY);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Firebase Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setFirebaseUser(firebaseUser);

        const currentUser = loadUser();
        if (currentUser?.id && currentUser?.password) {
          const userRef = ref(database, `users/${currentUser.id}`);
          onValue(userRef, (snapshot) => {
            const firebaseData = snapshot.val();
            if (firebaseData) {
              setUser(firebaseData);
              saveUser(firebaseData);
            }
          }, { onlyOnce: true });
        } else if (currentUser?.id && !currentUser?.password && currentUser?.hasAccess) {
          const userRef = ref(database, `users/${currentUser.id}`);
          onValue(userRef, (snapshot) => {
            const firebaseData = snapshot.val();
            if (firebaseData) {
              setUser(firebaseData);
              saveUser(firebaseData);
            } else {
              set(userRef, currentUser);
            }
          }, { onlyOnce: true });
        }
      } else {
        signInAnonymously(auth).catch((error) => {
          console.error("Error signing in anonymously:", error);
        });
      }
    });

    return () => unsubscribe();
  }, []);

  // Sync user data to Firebase
  useEffect(() => {
    if (firebaseUser && user.id && user.hasAccess && user.password) {
      const userRef = ref(database, `users/${user.id}`);
      set(userRef, user);
    }
  }, [user, firebaseUser]);

  useEffect(() => {
    saveUser(user);
  }, [user]);

  useEffect(() => {
    localStorage.setItem("carlisle_dark", dark ? "1" : "0");
  }, [dark]);

  useEffect(() => {
    localStorage.setItem("carlisle_theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("carlisle_layout", layout);
  }, [layout]);

  // Sync view/room/profile → URL hash
  useEffect(() => {
    if (!user.hasAccess) return;
    let hash = 'home';
    if (view === 'room') hash = `room/${room}`;
    else if (view === 'profile' && profileView) hash = `profile/${profileView}`;
    else if (view === 'sounds') hash = 'sounds';
    if (window.location.hash !== `#${hash}`) {
      window.history.pushState(null, '', `#${hash}`);
    }
    localStorage.setItem("carlisle_view", view);
    localStorage.setItem("carlisle_room", room);
  }, [view, room, profileView, user.hasAccess]);

  // Handle browser back/forward button
  useEffect(() => {
    const handlePop = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash.startsWith('profile/')) {
        const id = hash.split('/')[1];
        if (id) { setProfileView(id); setView('profile'); }
      } else if (hash.startsWith('room/')) {
        const r = hash.split('/')[1];
        if (r) { setRoom(r); setView('room'); }
      } else if (hash === 'sounds') {
        setView('sounds');
      } else {
        setView('home');
      }
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  useEffect(() => {
    localStorage.setItem("carlisle_view", view);
  }, [view]);

  useEffect(() => {
    localStorage.setItem("carlisle_room", room);
  }, [room]);

  const postsInRoom = useMemo(
    () => (state.posts || []).filter((p) => p.room === room),
    [state.posts, room]
  );

  function createRoom(name = "room", isPrivate = true, creatorOnly = false) {
    const invite = uid('room').slice(5, 11);
    const r = { 
      id: invite, 
      name: name || `room-${invite}`, 
      invite,
      creator: user.id,
      isPrivate: isPrivate,
      creatorOnly: creatorOnly
    };
    const newRooms = [r, ...(state.rooms || [])];
    const updates = {};
    updates['appState/rooms'] = newRooms;
    update(ref(database), updates);
    
    setUser((prev) => {
      const u = { 
        ...prev, 
        createdRooms: [...(prev.createdRooms || []), invite],
        joinedRooms: [...new Set([...(prev.joinedRooms || [DEFAULT_ROOM]), invite])]
      };
      saveUser(u);
      return u;
    });
    
    return r;
  }

  function joinRoom(code) {
    const found = (state.rooms || []).find((r) => r.id === code || r.invite === code);
    if (found) {
      setRoom(found.id);
      setView("room");
      
      setUser((prev) => {
        const u = { 
          ...prev, 
          joinedRooms: [...new Set([...(prev.joinedRooms || [DEFAULT_ROOM]), found.id])]
        };
        saveUser(u);
        return u;
      });
      
      return true;
    }
    return false;
  }

  function vote(postId, delta) {
    const postIndex = (state.posts || []).findIndex(p => p.id === postId);
    if (postIndex === -1) return;
    const post = state.posts[postIndex];
    const vmap = { ...(post.voters || {}) };
    const prevVote = vmap[user.id] || 0;
    const newVote = prevVote === delta ? 0 : delta;
    vmap[user.id] = newVote;
    const votes = Object.values(vmap).reduce((s, x) => s + x, 0);
    const updates = {};
    updates[`appState/posts/${postIndex}/voters`] = vmap;
    updates[`appState/posts/${postIndex}/votes`] = votes;
    update(ref(database), updates);
  }

  function addComment(postId, text, parentId = null) {
    if (!text) return;
    const postIndex = (state.posts || []).findIndex(p => p.id === postId);
    if (postIndex === -1) return;
    const post = state.posts[postIndex];
    const newComment = {
      id: uid("c"),
      author: user.id,
      authorId: user.id,
      authorDisplayName: user.username,
      text,
      created: now(),
      parentId,
      replies: [],
    };
    const newComments = [...(post.comments || []), newComment];
    const updates = {};
    updates[`appState/posts/${postIndex}/comments`] = newComments;
    update(ref(database), updates);
  }
  
  function removeComment(postId, commentId) {
    const postIndex = (state.posts || []).findIndex(p => p.id === postId);
    if (postIndex === -1) return;
    
    const post = state.posts[postIndex];
    const comment = (post.comments || []).find(c => c.id === commentId);
    
    if (!comment) return;
    
    const isCreator = comment.author === user.id 
      || (firebaseUser && comment.authorId === firebaseUser.uid)
      || (legacyUserId && comment.author === legacyUserId);
    const isRoomModerator = isRoomMod(post.room);
    
    if (!user.isAdmin && !isCreator && !isRoomModerator) {
      alert("YOU CAN ONLY DELETE YOUR OWN COMMENTS");
      return;
    }
    
    if (!confirm("DELETE THIS COMMENT?")) return;
    
    const removeCommentAndReplies = (comments, idToRemove) => {
      return comments.filter(c => {
        if (c.id === idToRemove) return false;
        if (c.parentId === idToRemove) return false;
        return true;
      });
    };
    
    const newComments = removeCommentAndReplies(post.comments || [], commentId);
    const updates = {};
    updates[`appState/posts/${postIndex}/comments`] = newComments;
    update(ref(database), updates);
  }

  function removePost(postId) {
    const post = (state.posts || []).find(p => p.id === postId);
    if (!post) return;
    
    const isCreator = post.author === user.id 
      || (firebaseUser && post.authorId === firebaseUser.uid)
      || (legacyUserId && post.author === legacyUserId);
    const isRoomModerator = isRoomMod(post.room);
    
    if (!user.isAdmin && !isCreator && !isRoomModerator) {
      alert("YOU CAN ONLY DELETE YOUR OWN POSTS");
      return;
    }
    
    if (!confirm("DELETE THIS POST?")) return;
    
    const newPosts = (state.posts || []).filter((p) => p.id !== postId);
    const updates = {};
    updates['appState/posts'] = newPosts;
    update(ref(database), updates);
  }
  
  function isRoomMod(roomId) {
    const room = (state.rooms || []).find(r => r.id === roomId);
    return room?.creator === user.id;
  }

  function enterRoom(roomId) {
    setRoom(roomId);
    setView("room");
  }

  function enterProfile(authorId) {
    setPreviousView(view);
    setProfileView(authorId);
    setView("profile");
  }

  function removeRoom(roomId) {
    const roomToDelete = (state.rooms || []).find(r => r.id === roomId);
    if (!roomToDelete) return;
    
    const isCreator = roomToDelete.creator === user.id;
    
    if (!user.isAdmin && !isCreator) {
      alert("ONLY ROOM CREATORS CAN DELETE THEIR ROOMS");
      return;
    }
    if (roomId === DEFAULT_ROOM) {
      alert("CANNOT DELETE THE MAIN ROOM");
      return;
    }
    if (!confirm("DELETE THIS ROOM?")) return;
    if (room === roomId) {
      setRoom(DEFAULT_ROOM);
      setView("home");
    }
    const newRooms = (state.rooms || []).filter((r) => r.id !== roomId);
    const updates = {};
    updates['appState/rooms'] = newRooms;
    update(ref(database), updates);
  }

  function handleAdminLogin() {
    const password = prompt("ENTER ADMIN PASSWORD:");
    if (password === ADMIN_PASSWORD) {
      setUser((prev) => {
        const u = { ...prev, isAdmin: true, hasAccess: true, inviteCodesRemaining: 999 };
        saveUser(u);
        return u;
      });
      alert("ADMIN ACCESS GRANTED");
    } else if (password) {
      alert("INCORRECT PASSWORD");
    }
  }

  function handleLogout() {
    setShowLogoutConfirm(true);
  }

  function saveProfile(updatedUser) {
    setUser(updatedUser);
    saveUser(updatedUser);
    
    if (updatedUser.id) {
      const userRef = ref(database, `users/${updatedUser.id}`);
      set(userRef, updatedUser).catch((error) => {
        console.error('❌ Failed to save profile to Firebase:', error);
      });
    }
  }

  function generateInviteCode() {
    if (user.inviteCodesRemaining <= 0 && !user.isAdmin) {
      alert("NO INVITE CODES REMAINING");
      return null;
    }

    const code = uid('invite').slice(7).toUpperCase();
    const inviteData = {
      used: false,
      createdBy: user.id,
      usedBy: null,
      created: now()
    };

    const updates = {};
    updates[`appState/inviteCodes/${code}`] = inviteData;
    update(ref(database), updates);

    setUser((prev) => {
      const u = {
        ...prev,
        inviteCodesRemaining: user.isAdmin ? 999 : Math.max(0, prev.inviteCodesRemaining - 1),
        inviteCodesCreated: [...(prev.inviteCodesCreated || []), code]
      };
      saveUser(u);
      return u;
    });

    return code;
  }

  const visible = (postsInRoom || [])
    .filter((p) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !(p.text || "").toLowerCase().includes(q) &&
          !(p.author || "").toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => {
      if (sort === "newest") return b.created - a.created;
      if (sort === "top") {
        return (
          (b.votes || 0) - (a.votes || 0) ||
          (b.comments?.length || 0) - (a.comments?.length || 0) ||
          b.created - a.created
        );
      }
      return b.created - a.created;
    });

  function postNew({ text, image, videoUrl, audioUrl }) {
    const currentRoom = (state.rooms || []).find(r => r.id === room);
    
    if (currentRoom?.creatorOnly && currentRoom.creator !== user.id && !user.isAdmin) {
      alert("ONLY THE ROOM CREATOR CAN POST IN THIS ROOM");
      return;
    }
    
    const postId = crypto.randomUUID();
    const post = {
      id: postId,
      author: user.id,
      authorId: user.id,
      authorDisplayName: user.username,
      text,
      image,
      videoUrl: videoUrl || null,
      audioUrl: audioUrl || null,
      room,
      created: Date.now(),
      votes: 0,
      voters: {},
      comments: [],
    };
    
    const newPosts = [post, ...(state.posts || [])];
    const updates = {};
    updates['appState/posts'] = newPosts;
    update(ref(database), updates);
    
    setUser((prev) => {
      const u = { 
        ...prev, 
        createdPosts: [...(prev.createdPosts || []), postId]
      };
      saveUser(u);
      return u;
    });
  }

  const currentRoomName = useMemo(() => {
    const r = (state.rooms || []).find(r => r.id === room);
    return r?.name || "MAIN ROOM";
  }, [room, state.rooms]);

  const cycleLayout = () => {
    const layouts = ["single", "double", "triple"];
    const currentIndex = layouts.indexOf(layout);
    const nextIndex = (currentIndex + 1) % layouts.length;
    setLayout(layouts[nextIndex]);
  };

  const getGridIcon = () => {
    if (layout === "single") return "▢";
    if (layout === "double") return "▢▢";
    return "▢▢▢";
  };

  const getGridColumns = () => {
    if (layout === 'single') return '1fr';
    if (layout === 'double') return 'repeat(2, 1fr)';
    return 'repeat(3, 1fr)';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ 
        backgroundColor: getColor('bg'),
        color: getColor('text'),
        fontFamily: 'Helvetica Neue, Arial, sans-serif'
      }}>
        <div className="text-center">
          <div className="text-xl font-light tracking-widest">CARLISLE</div>
          <div className="text-xs tracking-widest mt-2" style={{ color: getColor('textMuted') }}>
            LOADING...
          </div>
        </div>
      </div>
    );
  }

  if (!user.hasAccess && !user.isAdmin) {
    return <InviteGate onSignUp={signUpUser} onLogin={loginUser} getColor={getColor} />;
  }

  return (
    <div style={{ 
      minHeight: '100vh',
      backgroundColor: getColor('bg'),
      color: getColor('text'),
      fontFamily: 'Helvetica Neue, Arial, sans-serif',
      transition: 'background-color 0.3s, color 0.3s',
      overflowX: 'hidden'
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: windowWidth < 768 ? '20px 10px' : '40px 20px' }}>
        {/* Header */}
        <header style={{ 
          marginBottom: '60px', 
          paddingBottom: '30px', 
          borderBottom: `1px solid ${getColor('border')}` 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '30px', flexWrap: 'wrap', gap: '20px' }}>
            <button
              onClick={() => setView("home")}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                textAlign: 'left'
              }}
            >
              <div style={{ 
                fontSize: '24px', 
                fontWeight: '300', 
                letterSpacing: '0.15em',
                marginBottom: '8px',
                color: dark ? '#fff' : '#000',
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.opacity = '0.5'}
              onMouseLeave={(e) => e.target.style.opacity = '1'}
              >
                CARLISLE
              </div>
              <div style={{ 
                fontSize: '10px', 
                letterSpacing: '0.2em',
                color: dark ? '#999' : '#666'
              }}>
                ANONYMOUS ARCHIVE
              </div>
            </button>

            <div style={{ display: 'flex', gap: '30px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => enterProfile(user.id)}
                style={{
                  fontSize: '10px',
                  letterSpacing: '0.15em',
                  color: dark ? '#999' : '#666',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0',
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.opacity = '0.5'}
                onMouseLeave={(e) => e.target.style.opacity = '1'}
              >
                {user.username}
              </button>
              <button
                onClick={() => setView('sounds')}
                style={{
                  fontSize: '10px',
                  letterSpacing: '0.15em',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: dark ? '#fff' : '#000',
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.opacity = '0.5'}
                onMouseLeave={(e) => e.target.style.opacity = '1'}
              >
                SOUNDS
              </button>
              <button
                onClick={() => setShowSettings(true)}
                style={{
                  fontSize: '10px',
                  letterSpacing: '0.15em',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: dark ? '#fff' : '#000',
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.opacity = '0.5'}
                onMouseLeave={(e) => e.target.style.opacity = '1'}
              >
                SETTINGS
              </button>
              {user.isAdmin && (
                <button
                  onClick={() => setShowAdminPanel(true)}
                  style={{
                    fontSize: '10px',
                    letterSpacing: '0.15em',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: dark ? '#ff4444' : '#ff0000',
                    transition: 'opacity 0.2s',
                    fontWeight: '500'
                  }}
                  onMouseEnter={(e) => e.target.style.opacity = '0.5'}
                  onMouseLeave={(e) => e.target.style.opacity = '1'}
                >
                  🛡️ ADMIN
                </button>
              )}
            </div>
          </div>

          {view === "room" && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setView("home")}
                style={{
                  fontSize: '10px',
                  letterSpacing: '0.15em',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: dark ? '#999' : '#666',
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.opacity = '0.5'}
                onMouseLeave={(e) => e.target.style.opacity = '1'}
              >
                ← BACK TO HOME
              </button>

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="SEARCH"
                style={{
                  fontSize: '16px',
                  letterSpacing: '0.15em',
                  padding: '8px 0',
                  background: 'none',
                  border: 'none',
                  borderBottom: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                  outline: 'none',
                  width: '180px',
                  color: dark ? '#fff' : '#000',
                  transition: 'width 0.3s, border-color 0.2s'
                }}
                onFocus={(e) => {
                  e.target.style.width = '240px';
                  e.target.style.borderColor = dark ? '#666' : '#999';
                }}
                onBlur={(e) => {
                  e.target.style.width = '180px';
                  e.target.style.borderColor = dark ? '#333' : '#e5e5e5';
                }}
              />
              
              <RoomsDropdown 
                rooms={state.rooms || []}
                currentRoom={room}
                currentRoomName={currentRoomName}
                onSelectRoom={enterRoom}
                onCreateRoom={() => setInviteModal(true)}
                onJoinRoom={() => {
                  const code = prompt("PASTE INVITE CODE");
                  if (code) joinRoom(code);
                }}
                onDeleteRoom={removeRoom}
                dark={dark}
                isAdmin={user.isAdmin}
                userJoinedRooms={user.joinedRooms}
                userCreatedRooms={user.createdRooms}
              />

              <button
                onClick={cycleLayout}
                style={{
                  fontSize: '14px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: dark ? '#fff' : '#000',
                  transition: 'opacity 0.2s',
                  padding: '0',
                  lineHeight: '1'
                }}
                onMouseEnter={(e) => e.target.style.opacity = '0.5'}
                onMouseLeave={(e) => e.target.style.opacity = '1'}
                title={`Layout: ${layout}`}
              >
                {getGridIcon()}
              </button>
            </div>
          )}
        </header>

        {/* New Post Button */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '40px',
          marginTop: '-30px'
        }}>
          <button
            onClick={() => {
              if (view !== "room") {
                setRoom(DEFAULT_ROOM);
              }
              setShowNew(true);
            }}
            style={{
              fontSize: '32px',
              background: 'none',
              border: 'none',
              width: '56px',
              height: '56px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: dark ? '#fff' : '#000',
              transition: 'all 0.2s',
              fontWeight: '300',
              padding: '0',
              lineHeight: '1'
            }}
            onMouseEnter={(e) => {
              e.target.style.opacity = '0.7';
              e.target.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.target.style.opacity = '1';
              e.target.style.transform = 'scale(1)';
            }}
            title="New Post"
          >
            +
          </button>
        </div>

        {view === "profile" && profileView ? (
          <ProfilePage
            authorId={profileView}
            posts={(state.posts || []).filter((p) => p.author === profileView)}
            allPosts={state.posts || []}
            user={user}
            firebaseUser={firebaseUser}
            onBack={() => {
              setProfileView(null);
              setView(previousView);
            }}
            onEditProfile={() => setShowProfileEdit(true)}
            onDeletePost={removePost}
            dark={dark}
          />
        ) : view === "sounds" ? (
          <SoundsStudio
            onBack={() => setView("home")}
            dark={dark}
          />
        ) : view === "home" ? (
          <HomePage
            rooms={state.rooms || []}
            posts={state.posts || []}
            onEnterRoom={enterRoom}
            onCreateRoom={() => setInviteModal(true)}
            onJoinRoom={() => {
              const code = prompt("PASTE INVITE CODE");
              if (code) joinRoom(code);
            }}
            dark={dark}
            userJoinedRooms={user.joinedRooms}
          />
        ) : (
          <div style={{ display: 'flex', gap: '0' }}>
            {/* User List Sidebar */}
            <UserListSidebar
              posts={state.posts || []}
              currentRoom={room}
              dark={dark}
              windowWidth={windowWidth}
              onProfileClick={enterProfile}
            />
            
            {/* Main Content */}
            <div style={{ 
              flex: 1, 
              minWidth: 0,
              paddingLeft: windowWidth < 1024 ? '20px' : '0',
              paddingRight: '20px'
            }}>
              <div style={{ 
                marginBottom: '40px', 
                fontSize: '10px', 
                letterSpacing: '0.15em',
                color: dark ? '#999' : '#666'
              }}>
                {visible.length} POST{visible.length !== 1 ? 'S' : ''} IN {currentRoomName.toUpperCase()}
              </div>

              <main>
              <section style={{ 
                display: 'grid',
                gridTemplateColumns: getGridColumns(),
                gap: layout === 'single' ? '60px' : windowWidth < 768 ? '20px' : '30px'
              }}>
                {visible.length === 0 && (
                  <div style={{ 
                    padding: '60px 0', 
                    textAlign: 'center',
                    fontSize: '11px',
                    letterSpacing: '0.1em',
                    color: dark ? '#666' : '#999',
                    gridColumn: '1 / -1'
                  }}>
                    NO POSTS YET IN THIS ROOM
                  </div>
                )}

                {visible.map((post) => (
                  <article key={post.id} style={{ 
                    paddingBottom: layout === 'single' ? '60px' : '20px',
                    borderBottom: layout === 'single' ? `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}` : 'none',
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word',
                    minWidth: 0,
                    border: layout !== 'single' ? `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}` : 'none',
                    padding: layout !== 'single' ? '15px' : '0'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <ProfilePicture 
                          authorId={post.authorId}
                          author={post.author}
                          size={32}
                          dark={dark}
                        />
                        <div style={{ display: 'flex', gap: '15px', alignItems: 'baseline', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => enterProfile(post.author)}
                            style={{
                              fontSize: '11px',
                              letterSpacing: '0.05em',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: dark ? '#fff' : '#000',
                              textDecoration: 'underline',
                              padding: 0,
                              wordBreak: 'break-all'
                            }}
                          >
                            {post.authorDisplayName || post.author?.toUpperCase() || 'UNKNOWN'}
                          </button>
                        </div>
                        {!whisper && (
                          <div style={{ 
                            fontSize: '10px',
                            letterSpacing: '0.1em',
                            color: dark ? '#666' : '#999'
                          }}>
                            {new Date(post.created).toLocaleDateString('en-US', { 
                              year: 'numeric', 
                              month: '2-digit', 
                              day: '2-digit' 
                            }).toUpperCase()}
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        {(user.isAdmin || post.author === user.id || (firebaseUser && post.authorId === firebaseUser.uid) || (legacyUserId && post.author === legacyUserId) || isRoomMod(post.room)) && (
                          <button
                            onClick={() => removePost(post.id)}
                            style={{
                              fontSize: '10px',
                              letterSpacing: '0.1em',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: dark ? '#666' : '#999',
                              transition: 'opacity 0.2s',
                              whiteSpace: 'nowrap'
                            }}
                            onMouseEnter={(e) => e.target.style.opacity = '0.5'}
                            onMouseLeave={(e) => e.target.style.opacity = '1'}
                          >
                            DELETE
                          </button>
                        )}
                        <button
                          onClick={() => vote(post.id, 1)}
                          style={{
                            fontSize: '11px',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: post.voters && post.voters[user.id] === 1 
                              ? (dark ? '#fff' : '#000')
                              : (dark ? '#666' : '#ccc'),
                            transition: 'opacity 0.2s'
                          }}
                          onMouseEnter={(e) => e.target.style.opacity = '0.5'}
                          onMouseLeave={(e) => e.target.style.opacity = '1'}
                        >
                          ▲
                        </button>
                        <div style={{ 
                          fontSize: '10px',
                          letterSpacing: '0.05em',
                          minWidth: '20px',
                          textAlign: 'center',
                          color: post.votes > 0 
                            ? (dark ? '#fff' : '#000')
                            : post.votes < 0
                            ? (dark ? '#666' : '#999')
                            : (dark ? '#666' : '#999')
                        }}>
                          {post.votes}
                        </div>
                        <button
                          onClick={() => vote(post.id, -1)}
                          style={{
                            fontSize: '11px',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: post.voters && post.voters[user.id] === -1 
                              ? (dark ? '#fff' : '#000')
                              : (dark ? '#666' : '#ccc'),
                            transition: 'opacity 0.2s'
                          }}
                          onMouseEnter={(e) => e.target.style.opacity = '0.5'}
                          onMouseLeave={(e) => e.target.style.opacity = '1'}
                        >
                          ▼
                        </button>
                      </div>
                    </div>

                    <div style={{ marginTop: '20px' }}>
                      {post.image && (
                        <img
                          src={post.image}
                          style={{ 
                            width: '100%',
                            maxHeight: layout === 'single' ? '600px' : '300px',
                            objectFit: 'contain',
                            marginBottom: '20px'
                          }}
                          alt="post"
                        />
                      )}
                      {post.videoUrl && (
                        <div style={{ marginBottom: '20px' }}>
                          {post.videoUrl.includes('youtube.com') || post.videoUrl.includes('youtu.be') ? (
                            <iframe
                              width="100%"
                              height={layout === 'single' ? '400' : '250'}
                              src={post.videoUrl.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/')}
                              frameBorder="0"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                              style={{ maxWidth: '100%' }}
                            />
                          ) : (
                            <video
                              controls
                              style={{ width: '100%', maxHeight: layout === 'single' ? '600px' : '300px' }}
                            >
                              <source src={post.videoUrl} type={post.videoUrl.endsWith('.webm') ? 'video/webm' : post.videoUrl.endsWith('.ogg') ? 'video/ogg' : 'video/mp4'} />
                              Your browser does not support video.
                            </video>
                          )}
                        </div>
                      )}
                      {post.audioUrl && (
                        <audio
                          controls
                          style={{ width: '100%', marginBottom: '20px' }}
                        >
                          <source src={post.audioUrl} />
                          Your browser does not support audio.
                        </audio>
                      )}
                      <div style={{ 
                        fontSize: layout === 'single' ? '13px' : '12px', 
                        lineHeight: '1.8',
                        letterSpacing: '0.02em',
                        fontWeight: '300',
                        wordWrap: 'break-word',
                        overflowWrap: 'break-word'
                      }}>
                        {post.text}
                      </div>
                    </div>

                    <div style={{ marginTop: '30px' }}>
                      <CommentBlock
                        post={post}
                        addComment={addComment}
                        removeComment={removeComment}
                        whisper={whisper}
                        dark={dark}
                        user={user}
                        firebaseUser={firebaseUser}
                        legacyUserId={legacyUserId}
                        isRoomMod={isRoomMod(post.room)}
                        enterProfile={enterProfile}
                      />
                    </div>
                  </article>
                ))}
              </section>
            </main>
            </div>
          </div>
        )}
      </div>

      {showNew && (
        <NewPostModal
          onClose={() => setShowNew(false)}
          onPost={postNew}
          dark={dark}
        />
      )}

      {inviteModal && (
        <RoomModal
          onClose={() => setInviteModal(false)}
          onCreate={(n, isPrivate, creatorOnly) => {
            const r = createRoom(n, isPrivate, creatorOnly);
            setRoom(r.id);
            setView("room");
            setInviteModal(false);
            alert(`ROOM CREATED: ${r.invite}`);
          }}
          onJoin={(code) => {
            if (joinRoom(code)) {
              setInviteModal(false);
              alert("JOINED");
            } else alert("INVALID CODE");
          }}
          dark={dark}
        />
      )}
      {showSettings && (
        <SettingsModal
          dark={dark}
          setDark={setDark}
          theme={theme}
          setTheme={setTheme}
          user={user}
          onGenerateInvite={generateInviteCode}
          onLogout={handleLogout}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showProfileEdit && (
        <ProfileEditModal
          user={user}
          onSave={saveProfile}
          onClose={() => setShowProfileEdit(false)}
          dark={dark}
        />
      )}
      {showLogoutConfirm && (
        <LogoutConfirmModal
          onConfirm={logoutUser}
          onCancel={() => setShowLogoutConfirm(false)}
          dark={dark}
        />
      )}
      {showAdminPanel && user.isAdmin && (
        <AdminPanel
          onClose={() => setShowAdminPanel(false)}
          dark={dark}
          user={user}
        />
      )}
    </div>
  );
}

// ========== HELPER COMPONENTS ==========

function ProfilePicture({ authorId, author, size = 32, dark }) {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52B788'];
  const id = authorId || author;
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const color = colors[hash % colors.length];
  
  return (
    <div style={{
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '50%',
      backgroundColor: color,
      flexShrink: 0
    }} />
  );
}

function UserListSidebar({ posts, currentRoom, dark, windowWidth, onProfileClick }) {
  if (windowWidth < 1024) return null;

  const postsInRoom = posts.filter(p => p.room === currentRoom);
  const userCounts = {};
  
  postsInRoom.forEach(post => {
    const id = post.author;
    if (!userCounts[id]) {
      userCounts[id] = { 
        count: 0, 
        username: post.authorDisplayName || post.author,
        authorId: post.authorId || post.author
      };
    }
    userCounts[id].count++;
    
    (post.comments || []).forEach(comment => {
      const commentAuthor = comment.author;
      if (!userCounts[commentAuthor]) {
        userCounts[commentAuthor] = { 
          count: 0, 
          username: comment.authorDisplayName || comment.author,
          authorId: comment.authorId || comment.author
        };
      }
    });
  });

  const sortedUsers = Object.entries(userCounts)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 10);

  if (sortedUsers.length === 0) return null;

  return (
    <div style={{
      width: '200px',
      paddingRight: '30px',
      borderRight: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
      flexShrink: 0
    }}>
      <div style={{
        fontSize: '10px',
        letterSpacing: '0.15em',
        color: dark ? '#666' : '#999',
        marginBottom: '20px'
      }}>
        ACTIVE USERS
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {sortedUsers.map(([userId, data]) => (
          <button
            key={userId}
            onClick={() => onProfileClick(userId)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0',
              textAlign: 'left',
              width: '100%'
            }}
          >
            <ProfilePicture authorId={data.authorId} author={userId} size={24} dark={dark} />
            <div style={{
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: '11px',
              letterSpacing: '0.05em',
              color: dark ? '#fff' : '#000',
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.5'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
            >
              {data.username}
            </div>
            <div style={{
              fontSize: '9px',
              color: dark ? '#666' : '#999'
            }}>
              {data.count}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function HomePage({ rooms, posts, onEnterRoom, onCreateRoom, onJoinRoom, dark, userJoinedRooms = [] }) {
  const joinedRooms = rooms.filter(r => userJoinedRooms.includes(r.id));
  const otherRooms = rooms.filter(r => !userJoinedRooms.includes(r.id) && !r.isPrivate);

  return (
    <div>
      <div style={{ 
        marginBottom: '60px',
        display: 'flex',
        gap: '20px',
        flexWrap: 'wrap'
      }}>
        <button
          onClick={onCreateRoom}
          style={{
            fontSize: '11px',
            letterSpacing: '0.1em',
            padding: '12px 24px',
            background: 'none',
            border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
            cursor: 'pointer',
            color: dark ? '#fff' : '#000',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.target.style.borderColor = dark ? '#666' : '#999';
          }}
          onMouseLeave={(e) => {
            e.target.style.borderColor = dark ? '#333' : '#e5e5e5';
          }}
        >
          CREATE ROOM
        </button>
        <button
          onClick={onJoinRoom}
          style={{
            fontSize: '11px',
            letterSpacing: '0.1em',
            padding: '12px 24px',
            background: 'none',
            border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
            cursor: 'pointer',
            color: dark ? '#fff' : '#000',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.target.style.borderColor = dark ? '#666' : '#999';
          }}
          onMouseLeave={(e) => {
            e.target.style.borderColor = dark ? '#333' : '#e5e5e5';
          }}
        >
          JOIN ROOM
        </button>
      </div>

      {joinedRooms.length > 0 && (
        <div style={{ marginBottom: '60px' }}>
          <div style={{ 
            fontSize: '10px', 
            letterSpacing: '0.15em',
            color: dark ? '#999' : '#666',
            marginBottom: '20px'
          }}>
            YOUR ROOMS
          </div>
          <div style={{ 
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '20px'
          }}>
            {joinedRooms.map((r) => {
              const roomPosts = posts.filter(p => p.room === r.id);
              return (
                <button
                  key={r.id}
                  onClick={() => onEnterRoom(r.id)}
                  style={{
                    padding: '24px',
                    background: 'none',
                    border: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.borderColor = dark ? '#333' : '#e5e5e5';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.borderColor = dark ? '#1a1a1a' : '#f5f5f5';
                  }}
                >
                  <div style={{
                    fontSize: '14px',
                    letterSpacing: '0.1em',
                    color: dark ? '#fff' : '#000',
                    marginBottom: '12px',
                    fontWeight: '300'
                  }}>
                    {r.name.toUpperCase()}
                  </div>
                  <div style={{
                    fontSize: '10px',
                    letterSpacing: '0.05em',
                    color: dark ? '#666' : '#999'
                  }}>
                    {roomPosts.length} POST{roomPosts.length !== 1 ? 'S' : ''}
                    {r.isPrivate && ' • PRIVATE'}
                    {r.creatorOnly && ' • CREATOR ONLY'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {otherRooms.length > 0 && (
        <div>
          <div style={{ 
            fontSize: '10px', 
            letterSpacing: '0.15em',
            color: dark ? '#999' : '#666',
            marginBottom: '20px'
          }}>
            PUBLIC ROOMS
          </div>
          <div style={{ 
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '20px'
          }}>
            {otherRooms.map((r) => {
              const roomPosts = posts.filter(p => p.room === r.id);
              return (
                <button
                  key={r.id}
                  onClick={() => onEnterRoom(r.id)}
                  style={{
                    padding: '24px',
                    background: 'none',
                    border: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.borderColor = dark ? '#333' : '#e5e5e5';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.borderColor = dark ? '#1a1a1a' : '#f5f5f5';
                  }}
                >
                  <div style={{
                    fontSize: '14px',
                    letterSpacing: '0.1em',
                    color: dark ? '#fff' : '#000',
                    marginBottom: '12px',
                    fontWeight: '300'
                  }}>
                    {r.name.toUpperCase()}
                  </div>
                  <div style={{
                    fontSize: '10px',
                    letterSpacing: '0.05em',
                    color: dark ? '#666' : '#999'
                  }}>
                    {roomPosts.length} POST{roomPosts.length !== 1 ? 'S' : ''}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function RoomsDropdown({ rooms, currentRoom, currentRoomName, onSelectRoom, onCreateRoom, onJoinRoom, onDeleteRoom, dark, isAdmin, userJoinedRooms = [], userCreatedRooms = [] }) {
  const [open, setOpen] = useState(false);

  const joinedRooms = rooms.filter(r => userJoinedRooms.includes(r.id));
  const otherPublicRooms = rooms.filter(r => !userJoinedRooms.includes(r.id) && !r.isPrivate);

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          fontSize: '10px',
          letterSpacing: '0.15em',
          padding: '8px 0',
          background: 'none',
          border: 'none',
          borderBottom: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
          cursor: 'pointer',
          color: dark ? '#fff' : '#000',
          transition: 'border-color 0.2s',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
        onMouseEnter={(e) => e.target.style.borderColor = dark ? '#666' : '#999'}
        onMouseLeave={(e) => e.target.style.borderColor = dark ? '#333' : '#e5e5e5'}
      >
        {currentRoomName.toUpperCase()}
        <span style={{ fontSize: '8px' }}>▼</span>
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 999
            }}
          />
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '8px',
            backgroundColor: dark ? '#000' : '#fff',
            border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
            minWidth: '250px',
            maxHeight: '400px',
            overflowY: 'auto',
            zIndex: 1000,
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}>
            {joinedRooms.length > 0 && (
              <div>
                <div style={{
                  fontSize: '9px',
                  letterSpacing: '0.1em',
                  color: dark ? '#666' : '#999',
                  padding: '12px 16px 8px',
                  borderBottom: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`
                }}>
                  YOUR ROOMS
                </div>
                {joinedRooms.map(r => (
                  <div
                    key={r.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      borderBottom: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
                      cursor: 'pointer',
                      backgroundColor: r.id === currentRoom ? (dark ? '#0a0a0a' : '#fafafa') : 'transparent',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (r.id !== currentRoom) {
                        e.currentTarget.style.backgroundColor = dark ? '#0a0a0a' : '#fafafa';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (r.id !== currentRoom) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    <button
                      onClick={() => {
                        onSelectRoom(r.id);
                        setOpen(false);
                      }}
                      style={{
                        flex: 1,
                        fontSize: '11px',
                        letterSpacing: '0.05em',
                        color: dark ? '#fff' : '#000',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        padding: 0
                      }}
                    >
                      {r.name}
                      {r.isPrivate && <span style={{ color: dark ? '#666' : '#999', marginLeft: '8px' }}>🔒</span>}
                      {r.creatorOnly && <span style={{ color: dark ? '#666' : '#999', marginLeft: '8px' }}>👤</span>}
                    </button>
                    {(isAdmin || userCreatedRooms.includes(r.id)) && r.id !== 'main' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteRoom(r.id);
                          setOpen(false);
                        }}
                        style={{
                          fontSize: '9px',
                          color: dark ? '#666' : '#999',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '4px 8px',
                          transition: 'opacity 0.2s'
                        }}
                        onMouseEnter={(e) => e.target.style.opacity = '0.5'}
                        onMouseLeave={(e) => e.target.style.opacity = '1'}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {otherPublicRooms.length > 0 && (
              <div>
                <div style={{
                  fontSize: '9px',
                  letterSpacing: '0.1em',
                  color: dark ? '#666' : '#999',
                  padding: '12px 16px 8px',
                  borderBottom: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`
                }}>
                  PUBLIC ROOMS
                </div>
                {otherPublicRooms.map(r => (
                  <button
                    key={r.id}
                    onClick={() => {
                      onSelectRoom(r.id);
                      setOpen(false);
                    }}
                    style={{
                      width: '100%',
                      fontSize: '11px',
                      letterSpacing: '0.05em',
                      color: dark ? '#fff' : '#000',
                      background: 'none',
                      border: 'none',
                      borderBottom: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
                      cursor: 'pointer',
                      textAlign: 'left',
                      padding: '12px 16px',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = dark ? '#0a0a0a' : '#fafafa'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            )}

            <div style={{
              padding: '12px 16px',
              display: 'flex',
              gap: '8px',
              borderTop: `1px solid ${dark ? '#333' : '#e5e5e5'}`
            }}>
              <button
                onClick={() => {
                  onCreateRoom();
                  setOpen(false);
                }}
                style={{
                  flex: 1,
                  fontSize: '9px',
                  letterSpacing: '0.1em',
                  padding: '8px',
                  background: 'none',
                  border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                  cursor: 'pointer',
                  color: dark ? '#fff' : '#000',
                  transition: 'border-color 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.borderColor = dark ? '#666' : '#999'}
                onMouseLeave={(e) => e.target.style.borderColor = dark ? '#333' : '#e5e5e5'}
              >
                CREATE
              </button>
              <button
                onClick={() => {
                  onJoinRoom();
                  setOpen(false);
                }}
                style={{
                  flex: 1,
                  fontSize: '9px',
                  letterSpacing: '0.1em',
                  padding: '8px',
                  background: 'none',
                  border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                  cursor: 'pointer',
                  color: dark ? '#fff' : '#000',
                  transition: 'border-color 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.borderColor = dark ? '#666' : '#999'}
                onMouseLeave={(e) => e.target.style.borderColor = dark ? '#333' : '#e5e5e5'}
              >
                JOIN
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ProfilePage({ authorId, posts, allPosts, user, firebaseUser, onBack, onEditProfile, onDeletePost, dark }) {
  const profileUser = allPosts.find(p => p.author === authorId);
  const userData = profileUser ? {
    username: profileUser.authorDisplayName || profileUser.author,
    bio: null,
    profileImage: null
  } : { username: authorId, bio: null, profileImage: null };

  const isOwnProfile = authorId === user.id || (firebaseUser && authorId === firebaseUser.uid);

  return (
    <div>
      <button
        onClick={onBack}
        style={{
          fontSize: '10px',
          letterSpacing: '0.15em',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: dark ? '#999' : '#666',
          marginBottom: '40px',
          transition: 'opacity 0.2s'
        }}
        onMouseEnter={(e) => e.target.style.opacity = '0.5'}
        onMouseLeave={(e) => e.target.style.opacity = '1'}
      >
        ← BACK
      </button>

      <div style={{ marginBottom: '60px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px', marginBottom: '30px' }}>
          <ProfilePicture authorId={authorId} author={authorId} size={80} dark={dark} />
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: '24px',
              letterSpacing: '0.1em',
              fontWeight: '300',
              marginBottom: '12px',
              color: dark ? '#fff' : '#000'
            }}>
              {userData.username}
            </div>
            {userData.bio && (
              <div style={{
                fontSize: '12px',
                letterSpacing: '0.02em',
                lineHeight: '1.6',
                color: dark ? '#999' : '#666',
                marginBottom: '20px'
              }}>
                {userData.bio}
              </div>
            )}
            <div style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              color: dark ? '#666' : '#999'
            }}>
              {posts.length} POST{posts.length !== 1 ? 'S' : ''}
            </div>
          </div>
          {isOwnProfile && (
            <button
              onClick={onEditProfile}
              style={{
                fontSize: '10px',
                letterSpacing: '0.1em',
                padding: '8px 16px',
                background: 'none',
                border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                cursor: 'pointer',
                color: dark ? '#fff' : '#000',
                transition: 'border-color 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.borderColor = dark ? '#666' : '#999'}
              onMouseLeave={(e) => e.target.style.borderColor = dark ? '#333' : '#e5e5e5'}
            >
              EDIT
            </button>
          )}
        </div>
      </div>

      <div>
        {posts.length === 0 ? (
          <div style={{
            padding: '60px 0',
            textAlign: 'center',
            fontSize: '11px',
            letterSpacing: '0.1em',
            color: dark ? '#666' : '#999'
          }}>
            NO POSTS YET
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '20px'
          }}>
            {posts.sort((a, b) => b.created - a.created).map(post => (
              <div
                key={post.id}
                style={{
                  padding: '20px',
                  border: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word'
                }}
              >
                {post.image && (
                  <img
                    src={post.image}
                    style={{
                      width: '100%',
                      maxHeight: '200px',
                      objectFit: 'cover',
                      marginBottom: '12px'
                    }}
                    alt="post"
                  />
                )}
                <div style={{
                  fontSize: '12px',
                  lineHeight: '1.6',
                  letterSpacing: '0.02em',
                  color: dark ? '#fff' : '#000',
                  marginBottom: '12px'
                }}>
                  {post.text.length > 150 ? `${post.text.slice(0, 150)}...` : post.text}
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '10px',
                  color: dark ? '#666' : '#999'
                }}>
                  <span>{new Date(post.created).toLocaleDateString()}</span>
                  {isOwnProfile && (
                    <button
                      onClick={() => onDeletePost(post.id)}
                      style={{
                        fontSize: '10px',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: dark ? '#666' : '#999',
                        transition: 'opacity 0.2s'
                      }}
                      onMouseEnter={(e) => e.target.style.opacity = '0.5'}
                      onMouseLeave={(e) => e.target.style.opacity = '1'}
                    >
                      DELETE
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CommentBlock({ post, addComment, removeComment, whisper, dark, user, firebaseUser, legacyUserId, isRoomMod, enterProfile }) {
  const [commentText, setCommentText] = useState("");
  const [showComments, setShowComments] = useState(false);

  const topLevelComments = (post.comments || []).filter(c => !c.parentId);

  return (
    <div>
      <div style={{ marginBottom: '15px' }}>
        <textarea
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder="ADD A COMMENT..."
          style={{
            width: '100%',
            minHeight: '60px',
            fontSize: '12px',
            letterSpacing: '0.02em',
            padding: '12px',
            background: 'none',
            border: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
            outline: 'none',
            resize: 'vertical',
            color: dark ? '#fff' : '#000',
            fontFamily: 'Helvetica Neue, Arial, sans-serif'
          }}
        />
        <button
          onClick={() => {
            if (commentText.trim()) {
              addComment(post.id, commentText.trim());
              setCommentText("");
              setShowComments(true);
            }
          }}
          style={{
            fontSize: '10px',
            letterSpacing: '0.1em',
            padding: '8px 16px',
            marginTop: '8px',
            background: 'none',
            border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
            cursor: 'pointer',
            color: dark ? '#fff' : '#000',
            transition: 'border-color 0.2s'
          }}
          onMouseEnter={(e) => e.target.style.borderColor = dark ? '#666' : '#999'}
          onMouseLeave={(e) => e.target.style.borderColor = dark ? '#333' : '#e5e5e5'}
        >
          POST
        </button>
      </div>

      {topLevelComments.length > 0 && (
        <div>
          <button
            onClick={() => setShowComments(!showComments)}
            style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: dark ? '#999' : '#666',
              marginBottom: '15px',
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.5'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
          >
            {showComments ? '▼' : '▶'} {topLevelComments.length} COMMENT{topLevelComments.length !== 1 ? 'S' : ''}
          </button>

          {showComments && (
            <div style={{ 
              borderLeft: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
              paddingLeft: '20px',
              marginTop: '15px'
            }}>
              {topLevelComments.map(comment => (
                <CommentThread
                  key={comment.id}
                  comment={comment}
                  allComments={post.comments || []}
                  postId={post.id}
                  addComment={addComment}
                  removeComment={removeComment}
                  whisper={whisper}
                  dark={dark}
                  user={user}
                  firebaseUser={firebaseUser}
                  legacyUserId={legacyUserId}
                  isRoomMod={isRoomMod}
                  enterProfile={enterProfile}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CommentThread({ comment, allComments, postId, addComment, removeComment, whisper, dark, user, firebaseUser, legacyUserId, isRoomMod, enterProfile, depth = 0 }) {
  const [replyText, setReplyText] = useState("");
  const [showReply, setShowReply] = useState(false);
  const [showReplies, setShowReplies] = useState(true);

  const replies = allComments.filter(c => c.parentId === comment.id);
  
  const isCreator = comment.author === user.id 
    || (firebaseUser && comment.authorId === firebaseUser.uid)
    || (legacyUserId && comment.author === legacyUserId);

  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ marginBottom: '10px' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
          <ProfilePicture authorId={comment.authorId} author={comment.author} size={24} dark={dark} />
          <button
            onClick={() => enterProfile(comment.author)}
            style={{
              fontSize: '10px',
              letterSpacing: '0.05em',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: dark ? '#fff' : '#000',
              textDecoration: 'underline',
              padding: 0
            }}
          >
            {comment.authorDisplayName || comment.author?.toUpperCase() || 'UNKNOWN'}
          </button>
          {!whisper && (
            <span style={{
              fontSize: '9px',
              color: dark ? '#666' : '#999'
            }}>
              {new Date(comment.created).toLocaleDateString('en-US', {
                month: '2-digit',
                day: '2-digit',
                year: 'numeric'
              })}
            </span>
          )}
        </div>
        <div style={{
          fontSize: '12px',
          lineHeight: '1.6',
          letterSpacing: '0.02em',
          color: dark ? '#fff' : '#000',
          wordWrap: 'break-word',
          overflowWrap: 'break-word'
        }}>
          {comment.text}
        </div>
        <div style={{ display: 'flex', gap: '15px', marginTop: '8px' }}>
          <button
            onClick={() => setShowReply(!showReply)}
            style={{
              fontSize: '9px',
              letterSpacing: '0.1em',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: dark ? '#666' : '#999',
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.5'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
          >
            REPLY
          </button>
          {(user.isAdmin || isCreator || isRoomMod) && (
            <button
              onClick={() => removeComment(postId, comment.id)}
              style={{
                fontSize: '9px',
                letterSpacing: '0.1em',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: dark ? '#666' : '#999',
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.opacity = '0.5'}
              onMouseLeave={(e) => e.target.style.opacity = '1'}
            >
              DELETE
            </button>
          )}
        </div>
      </div>

      {showReply && (
        <div style={{ marginLeft: '34px', marginTop: '10px', marginBottom: '15px' }}>
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="WRITE A REPLY..."
            style={{
              width: '100%',
              minHeight: '50px',
              fontSize: '11px',
              letterSpacing: '0.02em',
              padding: '10px',
              background: 'none',
              border: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
              outline: 'none',
              resize: 'vertical',
              color: dark ? '#fff' : '#000',
              fontFamily: 'Helvetica Neue, Arial, sans-serif'
            }}
          />
          <button
            onClick={() => {
              if (replyText.trim()) {
                addComment(postId, replyText.trim(), comment.id);
                setReplyText("");
                setShowReply(false);
                setShowReplies(true);
              }
            }}
            style={{
              fontSize: '9px',
              letterSpacing: '0.1em',
              padding: '6px 12px',
              marginTop: '6px',
              background: 'none',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              cursor: 'pointer',
              color: dark ? '#fff' : '#000',
              transition: 'border-color 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.borderColor = dark ? '#666' : '#999'}
            onMouseLeave={(e) => e.target.style.borderColor = dark ? '#333' : '#e5e5e5'}
          >
            POST
          </button>
        </div>
      )}

      {replies.length > 0 && (
        <div style={{ marginLeft: '34px', marginTop: '15px' }}>
          <button
            onClick={() => setShowReplies(!showReplies)}
            style={{
              fontSize: '9px',
              letterSpacing: '0.1em',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: dark ? '#666' : '#999',
              marginBottom: '10px',
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.5'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
          >
            {showReplies ? '▼' : '▶'} {replies.length} REPL{replies.length !== 1 ? 'IES' : 'Y'}
          </button>
          {showReplies && (
            <div style={{
              borderLeft: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
              paddingLeft: '15px'
            }}>
              {replies.map(reply => (
                <CommentThread
                  key={reply.id}
                  comment={reply}
                  allComments={allComments}
                  postId={postId}
                  addComment={addComment}
                  removeComment={removeComment}
                  whisper={whisper}
                  dark={dark}
                  user={user}
                  firebaseUser={firebaseUser}
                  legacyUserId={legacyUserId}
                  isRoomMod={isRoomMod}
                  enterProfile={enterProfile}
                  depth={depth + 1}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ========== MODAL COMPONENTS ==========

function NewPostModal({ onClose, onPost, dark }) {
  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadImageToMinIO = async (file) => {
    try {
      const filename = `${Date.now()}_${file.name}`;
      const command = new PutObjectCommand({
        Bucket: MINIO_BUCKET,
        Key: filename,
        Body: file,
        ContentType: file.type
      });
      
      await s3Client.send(command);
      return `${MINIO_PUBLIC_URL}/${MINIO_BUCKET}/${filename}`;
    } catch (error) {
      console.error('MinIO upload error:', error);
      throw error;
    }
  };

  const handleSubmit = async () => {
    if (!text.trim() && !imageFile && !videoUrl && !audioUrl) {
      alert("PLEASE ADD SOME CONTENT");
      return;
    }

    setUploading(true);
    try {
      let imageUrl = null;
      if (imageFile) {
        imageUrl = await uploadImageToMinIO(imageFile);
      }

      onPost({
        text: text.trim(),
        image: imageUrl,
        videoUrl: videoUrl.trim() || null,
        audioUrl: audioUrl.trim() || null
      });

      onClose();
    } catch (error) {
      alert("UPLOAD FAILED");
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: dark ? '#000' : '#fff',
          border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
          maxWidth: '600px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '40px'
        }}
      >
        <div style={{
          fontSize: '16px',
          letterSpacing: '0.15em',
          marginBottom: '30px',
          color: dark ? '#fff' : '#000'
        }}>
          NEW POST
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="WHAT'S ON YOUR MIND?"
          disabled={uploading}
          style={{
            width: '100%',
            minHeight: '120px',
            fontSize: '13px',
            letterSpacing: '0.02em',
            padding: '16px',
            marginBottom: '20px',
            background: 'none',
            border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
            outline: 'none',
            resize: 'vertical',
            color: dark ? '#fff' : '#000',
            fontFamily: 'Helvetica Neue, Arial, sans-serif'
          }}
        />

        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            fontSize: '10px',
            letterSpacing: '0.1em',
            color: dark ? '#999' : '#666',
            marginBottom: '8px'
          }}>
            IMAGE
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            disabled={uploading}
            style={{
              fontSize: '11px',
              color: dark ? '#fff' : '#000'
            }}
          />
          {imagePreview && (
            <img
              src={imagePreview}
              style={{
                width: '100%',
                maxHeight: '300px',
                objectFit: 'contain',
                marginTop: '12px'
              }}
              alt="preview"
            />
          )}
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            fontSize: '10px',
            letterSpacing: '0.1em',
            color: dark ? '#999' : '#666',
            marginBottom: '8px'
          }}>
            VIDEO URL (YOUTUBE OR DIRECT LINK)
          </label>
          <input
            type="text"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://..."
            disabled={uploading}
            style={{
              width: '100%',
              fontSize: '12px',
              padding: '12px',
              background: 'none',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              outline: 'none',
              color: dark ? '#fff' : '#000',
              fontFamily: 'Helvetica Neue, Arial, sans-serif'
            }}
          />
        </div>

        <div style={{ marginBottom: '30px' }}>
          <label style={{
            display: 'block',
            fontSize: '10px',
            letterSpacing: '0.1em',
            color: dark ? '#999' : '#666',
            marginBottom: '8px'
          }}>
            AUDIO URL
          </label>
          <input
            type="text"
            value={audioUrl}
            onChange={(e) => setAudioUrl(e.target.value)}
            placeholder="https://..."
            disabled={uploading}
            style={{
              width: '100%',
              fontSize: '12px',
              padding: '12px',
              background: 'none',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              outline: 'none',
              color: dark ? '#fff' : '#000',
              fontFamily: 'Helvetica Neue, Arial, sans-serif'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={uploading}
            style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              padding: '12px 24px',
              background: 'none',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              cursor: uploading ? 'not-allowed' : 'pointer',
              color: dark ? '#fff' : '#000',
              opacity: uploading ? 0.5 : 1,
              transition: 'border-color 0.2s'
            }}
            onMouseEnter={(e) => !uploading && (e.target.style.borderColor = dark ? '#666' : '#999')}
            onMouseLeave={(e) => !uploading && (e.target.style.borderColor = dark ? '#333' : '#e5e5e5')}
          >
            CANCEL
          </button>
          <button
            onClick={handleSubmit}
            disabled={uploading}
            style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              padding: '12px 24px',
              backgroundColor: dark ? '#fff' : '#000',
              border: 'none',
              cursor: uploading ? 'not-allowed' : 'pointer',
              color: dark ? '#000' : '#fff',
              opacity: uploading ? 0.5 : 1,
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => !uploading && (e.target.style.opacity = '0.8')}
            onMouseLeave={(e) => !uploading && (e.target.style.opacity = '1')}
          >
            {uploading ? 'UPLOADING...' : 'POST'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RoomModal({ onClose, onCreate, onJoin, dark }) {
  const [mode, setMode] = useState("create");
  const [roomName, setRoomName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [creatorOnly, setCreatorOnly] = useState(false);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: dark ? '#000' : '#fff',
          border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
          maxWidth: '500px',
          width: '100%',
          padding: '40px'
        }}
      >
        <div style={{ marginBottom: '30px' }}>
          <button
            onClick={() => setMode("create")}
            style={{
              fontSize: '12px',
              letterSpacing: '0.1em',
              padding: '12px 24px',
              marginRight: '12px',
              background: mode === "create" ? (dark ? '#fff' : '#000') : 'none',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              cursor: 'pointer',
              color: mode === "create" ? (dark ? '#000' : '#fff') : (dark ? '#fff' : '#000'),
              transition: 'all 0.2s'
            }}
          >
            CREATE
          </button>
          <button
            onClick={() => setMode("join")}
            style={{
              fontSize: '12px',
              letterSpacing: '0.1em',
              padding: '12px 24px',
              background: mode === "join" ? (dark ? '#fff' : '#000') : 'none',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              cursor: 'pointer',
              color: mode === "join" ? (dark ? '#000' : '#fff') : (dark ? '#fff' : '#000'),
              transition: 'all 0.2s'
            }}
          >
            JOIN
          </button>
        </div>

        {mode === "create" ? (
          <>
            <input
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="ROOM NAME"
              style={{
                width: '100%',
                fontSize: '13px',
                letterSpacing: '0.05em',
                padding: '16px',
                marginBottom: '20px',
                background: 'none',
                border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                outline: 'none',
                color: dark ? '#fff' : '#000',
                fontFamily: 'Helvetica Neue, Arial, sans-serif'
              }}
            />
            
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '12px',
              fontSize: '11px',
              letterSpacing: '0.05em',
              color: dark ? '#fff' : '#000',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
              />
              PRIVATE (INVITE ONLY)
            </label>

            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '30px',
              fontSize: '11px',
              letterSpacing: '0.05em',
              color: dark ? '#fff' : '#000',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={creatorOnly}
                onChange={(e) => setCreatorOnly(e.target.checked)}
              />
              CREATOR ONLY POSTING
            </label>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={onClose}
                style={{
                  fontSize: '10px',
                  letterSpacing: '0.1em',
                  padding: '12px 24px',
                  background: 'none',
                  border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                  cursor: 'pointer',
                  color: dark ? '#fff' : '#000',
                  transition: 'border-color 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.borderColor = dark ? '#666' : '#999'}
                onMouseLeave={(e) => e.target.style.borderColor = dark ? '#333' : '#e5e5e5'}
              >
                CANCEL
              </button>
              <button
                onClick={() => onCreate(roomName || "ROOM", isPrivate, creatorOnly)}
                style={{
                  fontSize: '10px',
                  letterSpacing: '0.1em',
                  padding: '12px 24px',
                  backgroundColor: dark ? '#fff' : '#000',
                  border: 'none',
                  cursor: 'pointer',
                  color: dark ? '#000' : '#fff',
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.opacity = '0.8'}
                onMouseLeave={(e) => e.target.style.opacity = '1'}
              >
                CREATE
              </button>
            </div>
          </>
        ) : (
          <>
            <input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="PASTE INVITE CODE"
              style={{
                width: '100%',
                fontSize: '13px',
                letterSpacing: '0.1em',
                padding: '16px',
                marginBottom: '30px',
                background: 'none',
                border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                outline: 'none',
                color: dark ? '#fff' : '#000',
                fontFamily: 'Helvetica Neue, Arial, sans-serif',
                textTransform: 'uppercase'
              }}
            />

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={onClose}
                style={{
                  fontSize: '10px',
                  letterSpacing: '0.1em',
                  padding: '12px 24px',
                  background: 'none',
                  border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                  cursor: 'pointer',
                  color: dark ? '#fff' : '#000',
                  transition: 'border-color 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.borderColor = dark ? '#666' : '#999'}
                onMouseLeave={(e) => e.target.style.borderColor = dark ? '#333' : '#e5e5e5'}
              >
                CANCEL
              </button>
              <button
                onClick={() => onJoin(inviteCode)}
                style={{
                  fontSize: '10px',
                  letterSpacing: '0.1em',
                  padding: '12px 24px',
                  backgroundColor: dark ? '#fff' : '#000',
                  border: 'none',
                  cursor: 'pointer',
                  color: dark ? '#000' : '#fff',
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.opacity = '0.8'}
                onMouseLeave={(e) => e.target.style.opacity = '1'}
              >
                JOIN
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SettingsModal({ dark, setDark, theme, setTheme, user, onGenerateInvite, onLogout, onClose }) {
  const [newCode, setNewCode] = useState(null);

  const themes = ['default', 'serika', 'retrocast', 'botanical', 'ocean', 'rose'];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: dark ? '#000' : '#fff',
          border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
          maxWidth: '500px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '40px'
        }}
      >
        <div style={{
          fontSize: '16px',
          letterSpacing: '0.15em',
          marginBottom: '40px',
          color: dark ? '#fff' : '#000'
        }}>
          SETTINGS
        </div>

        <div style={{ marginBottom: '30px' }}>
          <div style={{
            fontSize: '10px',
            letterSpacing: '0.1em',
            color: dark ? '#999' : '#666',
            marginBottom: '12px'
          }}>
            APPEARANCE
          </div>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '11px',
            letterSpacing: '0.05em',
            color: dark ? '#fff' : '#000',
            cursor: 'pointer'
          }}>
            <input
              type="checkbox"
              checked={dark}
              onChange={(e) => setDark(e.target.checked)}
            />
            DARK MODE
          </label>
        </div>

        <div style={{ marginBottom: '30px' }}>
          <div style={{
            fontSize: '10px',
            letterSpacing: '0.1em',
            color: dark ? '#999' : '#666',
            marginBottom: '12px'
          }}>
            THEME
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {themes.map(t => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                style={{
                  fontSize: '9px',
                  letterSpacing: '0.1em',
                  padding: '8px 16px',
                  background: theme === t ? (dark ? '#fff' : '#000') : 'none',
                  border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                  cursor: 'pointer',
                  color: theme === t ? (dark ? '#000' : '#fff') : (dark ? '#fff' : '#000'),
                  transition: 'all 0.2s',
                  textTransform: 'uppercase'
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '30px' }}>
          <div style={{
            fontSize: '10px',
            letterSpacing: '0.1em',
            color: dark ? '#999' : '#666',
            marginBottom: '12px'
          }}>
            INVITE CODES
          </div>
          <div style={{
            fontSize: '11px',
            letterSpacing: '0.05em',
            color: dark ? '#fff' : '#000',
            marginBottom: '12px'
          }}>
            REMAINING: {user.inviteCodesRemaining}
          </div>
          <button
            onClick={() => {
              const code = onGenerateInvite();
              if (code) setNewCode(code);
            }}
            disabled={user.inviteCodesRemaining <= 0 && !user.isAdmin}
            style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              padding: '10px 20px',
              background: 'none',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              cursor: user.inviteCodesRemaining <= 0 && !user.isAdmin ? 'not-allowed' : 'pointer',
              color: dark ? '#fff' : '#000',
              opacity: user.inviteCodesRemaining <= 0 && !user.isAdmin ? 0.5 : 1,
              transition: 'border-color 0.2s'
            }}
            onMouseEnter={(e) => {
              if (user.inviteCodesRemaining > 0 || user.isAdmin) {
                e.target.style.borderColor = dark ? '#666' : '#999';
              }
            }}
            onMouseLeave={(e) => {
              if (user.inviteCodesRemaining > 0 || user.isAdmin) {
                e.target.style.borderColor = dark ? '#333' : '#e5e5e5';
              }
            }}
          >
            GENERATE CODE
          </button>
          {newCode && (
            <div style={{
              marginTop: '12px',
              padding: '12px',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              fontSize: '14px',
              letterSpacing: '0.2em',
              color: dark ? '#fff' : '#000',
              fontFamily: 'monospace'
            }}>
              {newCode}
            </div>
          )}
        </div>

        <div style={{ 
          borderTop: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
          paddingTop: '30px',
          marginTop: '40px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <button
            onClick={onLogout}
            style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              padding: '12px 24px',
              background: 'none',
              border: `1px solid ${dark ? '#ff4444' : '#ff0000'}`,
              cursor: 'pointer',
              color: dark ? '#ff4444' : '#ff0000',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = dark ? '#ff4444' : '#ff0000';
              e.target.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = 'transparent';
              e.target.style.color = dark ? '#ff4444' : '#ff0000';
            }}
          >
            LOGOUT
          </button>

          <button
            onClick={onClose}
            style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              padding: '12px 24px',
              backgroundColor: dark ? '#fff' : '#000',
              border: 'none',
              cursor: 'pointer',
              color: dark ? '#000' : '#fff',
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.8'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileEditModal({ user, onSave, onClose, dark }) {
  const [bio, setBio] = useState(user.bio || "");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(user.profileImage || null);
  const [uploading, setUploading] = useState(false);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadImageToMinIO = async (file) => {
    try {
      const filename = `profile_${Date.now()}_${file.name}`;
      const command = new PutObjectCommand({
        Bucket: MINIO_BUCKET,
        Key: filename,
        Body: file,
        ContentType: file.type
      });
      
      await s3Client.send(command);
      return `${MINIO_PUBLIC_URL}/${MINIO_BUCKET}/${filename}`;
    } catch (error) {
      console.error('MinIO upload error:', error);
      throw error;
    }
  };

  const handleSave = async () => {
    setUploading(true);
    try {
      let profileImageUrl = user.profileImage;
      
      if (imageFile) {
        profileImageUrl = await uploadImageToMinIO(imageFile);
      }

      onSave({
        ...user,
        bio: bio.trim() || null,
        profileImage: profileImageUrl
      });

      onClose();
    } catch (error) {
      alert("UPLOAD FAILED");
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: dark ? '#000' : '#fff',
          border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
          maxWidth: '500px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '40px'
        }}
      >
        <div style={{
          fontSize: '16px',
          letterSpacing: '0.15em',
          marginBottom: '30px',
          color: dark ? '#fff' : '#000'
        }}>
          EDIT PROFILE
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            fontSize: '10px',
            letterSpacing: '0.1em',
            color: dark ? '#999' : '#666',
            marginBottom: '8px'
          }}>
            USERNAME
          </label>
          <div style={{
            fontSize: '13px',
            padding: '16px',
            border: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
            color: dark ? '#666' : '#999'
          }}>
            {user.username}
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            fontSize: '10px',
            letterSpacing: '0.1em',
            color: dark ? '#999' : '#666',
            marginBottom: '8px'
          }}>
            BIO
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="TELL US ABOUT YOURSELF..."
            disabled={uploading}
            style={{
              width: '100%',
              minHeight: '100px',
              fontSize: '12px',
              letterSpacing: '0.02em',
              padding: '16px',
              background: 'none',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              outline: 'none',
              resize: 'vertical',
              color: dark ? '#fff' : '#000',
              fontFamily: 'Helvetica Neue, Arial, sans-serif'
            }}
          />
        </div>

        <div style={{ marginBottom: '30px' }}>
          <label style={{
            display: 'block',
            fontSize: '10px',
            letterSpacing: '0.1em',
            color: dark ? '#999' : '#666',
            marginBottom: '8px'
          }}>
            PROFILE PICTURE
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            disabled={uploading}
            style={{
              fontSize: '11px',
              color: dark ? '#fff' : '#000',
              marginBottom: '12px'
            }}
          />
          {imagePreview && (
            <img
              src={imagePreview}
              style={{
                width: '120px',
                height: '120px',
                objectFit: 'cover',
                border: `1px solid ${dark ? '#333' : '#e5e5e5'}`
              }}
              alt="preview"
            />
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={uploading}
            style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              padding: '12px 24px',
              background: 'none',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              cursor: uploading ? 'not-allowed' : 'pointer',
              color: dark ? '#fff' : '#000',
              opacity: uploading ? 0.5 : 1,
              transition: 'border-color 0.2s'
            }}
            onMouseEnter={(e) => !uploading && (e.target.style.borderColor = dark ? '#666' : '#999')}
            onMouseLeave={(e) => !uploading && (e.target.style.borderColor = dark ? '#333' : '#e5e5e5')}
          >
            CANCEL
          </button>
          <button
            onClick={handleSave}
            disabled={uploading}
            style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              padding: '12px 24px',
              backgroundColor: dark ? '#fff' : '#000',
              border: 'none',
              cursor: uploading ? 'not-allowed' : 'pointer',
              color: dark ? '#000' : '#fff',
              opacity: uploading ? 0.5 : 1,
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => !uploading && (e.target.style.opacity = '0.8')}
            onMouseLeave={(e) => !uploading && (e.target.style.opacity = '1')}
          >
            {uploading ? 'SAVING...' : 'SAVE'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LogoutConfirmModal({ onConfirm, onCancel, dark }) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: dark ? '#000' : '#fff',
          border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
          maxWidth: '400px',
          width: '100%',
          padding: '40px'
        }}
      >
        <div style={{
          fontSize: '16px',
          letterSpacing: '0.15em',
          marginBottom: '20px',
          color: dark ? '#fff' : '#000'
        }}>
          LOGOUT
        </div>

        <div style={{
          fontSize: '12px',
          lineHeight: '1.6',
          letterSpacing: '0.02em',
          color: dark ? '#999' : '#666',
          marginBottom: '30px'
        }}>
          Are you sure you want to logout? You'll need your username and password to log back in.
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              padding: '12px 24px',
              background: 'none',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              cursor: 'pointer',
              color: dark ? '#fff' : '#000',
              transition: 'border-color 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.borderColor = dark ? '#666' : '#999'}
            onMouseLeave={(e) => e.target.style.borderColor = dark ? '#333' : '#e5e5e5'}
          >
            CANCEL
          </button>
          <button
            onClick={onConfirm}
            style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              padding: '12px 24px',
              background: 'none',
              border: `1px solid ${dark ? '#ff4444' : '#ff0000'}`,
              cursor: 'pointer',
              color: dark ? '#ff4444' : '#ff0000',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = dark ? '#ff4444' : '#ff0000';
              e.target.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = 'transparent';
              e.target.style.color = dark ? '#ff4444' : '#ff0000';
            }}
          >
            LOGOUT
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminPanel({ onClose, dark, user }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: dark ? '#000' : '#fff',
          border: `1px solid ${dark ? '#ff4444' : '#ff0000'}`,
          maxWidth: '500px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '40px'
        }}
      >
        <div style={{
          fontSize: '16px',
          letterSpacing: '0.15em',
          marginBottom: '30px',
          color: dark ? '#ff4444' : '#ff0000'
        }}>
          🛡️ ADMIN PANEL
        </div>

        <div style={{
          fontSize: '11px',
          letterSpacing: '0.05em',
          lineHeight: '1.8',
          color: dark ? '#fff' : '#000',
          marginBottom: '30px'
        }}>
          <div>USERNAME: {user.username}</div>
          <div>ADMIN STATUS: ACTIVE</div>
          <div>INVITE CODES: UNLIMITED</div>
        </div>

        <div style={{
          padding: '20px',
          border: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
          marginBottom: '20px'
        }}>
          <div style={{
            fontSize: '10px',
            letterSpacing: '0.1em',
            color: dark ? '#999' : '#666',
            marginBottom: '12px'
          }}>
            ADMIN PRIVILEGES
          </div>
          <div style={{
            fontSize: '11px',
            letterSpacing: '0.05em',
            lineHeight: '1.8',
            color: dark ? '#fff' : '#000'
          }}>
            • DELETE ANY POST OR COMMENT<br />
            • DELETE ANY ROOM<br />
            • UNLIMITED INVITE CODES<br />
            • BYPASS ALL RESTRICTIONS
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            width: '100%',
            fontSize: '10px',
            letterSpacing: '0.1em',
            padding: '12px',
            backgroundColor: dark ? '#ff4444' : '#ff0000',
            border: 'none',
            cursor: 'pointer',
            color: '#fff',
            transition: 'opacity 0.2s'
          }}
          onMouseEnter={(e) => e.target.style.opacity = '0.8'}
          onMouseLeave={(e) => e.target.style.opacity = '1'}
        >
          CLOSE
        </button>
      </div>
    </div>
  );
}

// Pattern Library Component - Save/load/export/import patterns
function PatternLibrary({ dark, onLoadPattern }) {
  const [savedPatterns, setSavedPatterns] = useState(() => {
    const saved = localStorage.getItem('carlisle_pattern_library');
    return saved ? JSON.parse(saved) : [];
  });
  const [patternName, setPatternName] = useState('');
  const [selectedPattern, setSelectedPattern] = useState(null);

  // Auto-save to localStorage
  React.useEffect(() => {
    localStorage.setItem('carlisle_pattern_library', JSON.stringify(savedPatterns));
  }, [savedPatterns]);

  const saveCurrentPattern = () => {
    if (!patternName.trim() || !selectedPattern) return;
    
    const newPattern = {
      id: Date.now(),
      name: patternName.trim(),
      pattern: selectedPattern,
      date: new Date().toISOString()
    };
    
    setSavedPatterns([...savedPatterns, newPattern]);
    setPatternName('');
    setSelectedPattern(null);
  };

  const deletePattern = (id) => {
    setSavedPatterns(savedPatterns.filter(p => p.id !== id));
  };

  const exportPattern = (pattern) => {
    const dataStr = JSON.stringify(pattern, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pattern.name.replace(/[^a-z0-9]/gi, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAll = () => {
    const dataStr = JSON.stringify(savedPatterns, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `carlisle_patterns_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importPatterns = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const imported = JSON.parse(event.target.result);
          if (Array.isArray(imported)) {
            setSavedPatterns([...savedPatterns, ...imported]);
          } else if (imported.pattern) {
            setSavedPatterns([...savedPatterns, imported]);
          }
        } catch (err) {
          console.error('Failed to import:', err);
          alert('Invalid pattern file');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div style={{ width: '480px', padding: '12px' }}>
      {/* Header */}
      <div style={{
        marginBottom: '12px',
        padding: '8px',
        background: dark ? '#0a0a0a' : '#fafafa',
        border: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
        textAlign: 'center'
      }}>
        <div style={{
          fontSize: '10px',
          fontWeight: '500',
          letterSpacing: '0.15em',
          color: dark ? '#fff' : '#000'
        }}>
          PATTERN LIBRARY
        </div>
        <div style={{
          fontSize: '7px',
          fontWeight: '500',
          letterSpacing: '0.1em',
          color: dark ? '#666' : '#999',
          marginTop: '4px'
        }}>
          {savedPatterns.length} SAVED PATTERNS
        </div>
      </div>

      {/* Import/Export All */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <button
          onClick={importPatterns}
          style={{
            flex: 1,
            fontSize: '8px',
            fontWeight: '500',
            letterSpacing: '0.1em',
            padding: '8px',
            background: dark ? '#fff' : '#000',
            border: 'none',
            cursor: 'pointer',
            color: dark ? '#000' : '#fff'
          }}
        >
          IMPORT
        </button>
        <button
          onClick={exportAll}
          disabled={savedPatterns.length === 0}
          style={{
            flex: 1,
            fontSize: '8px',
            fontWeight: '500',
            letterSpacing: '0.1em',
            padding: '8px',
            background: savedPatterns.length > 0 ? (dark ? '#fff' : '#000') : 'none',
            border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
            cursor: savedPatterns.length > 0 ? 'pointer' : 'not-allowed',
            color: savedPatterns.length > 0 ? (dark ? '#000' : '#fff') : (dark ? '#666' : '#999')
          }}
        >
          EXPORT ALL
        </button>
      </div>

      {/* Pattern List */}
      <div style={{
        maxHeight: '400px',
        overflowY: 'auto',
        border: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
        background: dark ? '#0a0a0a' : '#fafafa'
      }}>
        {savedPatterns.length === 0 ? (
          <div style={{
            padding: '20px',
            textAlign: 'center',
            fontSize: '8px',
            fontWeight: '500',
            color: dark ? '#666' : '#999'
          }}>
            NO PATTERNS SAVED YET
            <div style={{ fontSize: '7px', fontWeight: '500', marginTop: '4px' }}>
              COPY A PATTERN FROM GRIDSEQ, THEN NAME & SAVE IT HERE
            </div>
          </div>
        ) : (
          savedPatterns.map(pattern => (
            <div
              key={pattern.id}
              style={{
                padding: '10px',
                borderBottom: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: '9px',
                  fontWeight: '600',
                  color: dark ? '#fff' : '#000',
                  marginBottom: '4px'
                }}>
                  {pattern.name}
                </div>
                <div style={{
                  fontSize: '7px',
                  fontWeight: '500',
                  color: dark ? '#666' : '#999'
                }}>
                  {new Date(pattern.date).toLocaleDateString()}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={() => onLoadPattern?.(pattern.pattern)}
                  style={{
                    fontSize: '7px',
                    fontWeight: '500',
                    padding: '6px 10px',
                    background: dark ? '#4ade80' : '#22c55e',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#000'
                  }}
                  title="Load into focused GridSeq"
                >
                  LOAD
                </button>
                <button
                  onClick={() => exportPattern(pattern)}
                  style={{
                    fontSize: '7px',
                    fontWeight: '500',
                    padding: '6px 10px',
                    background: 'none',
                    border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                    cursor: 'pointer',
                    color: dark ? '#fff' : '#000'
                  }}
                >
                  DL
                </button>
                <button
                  onClick={() => deletePattern(pattern.id)}
                  style={{
                    fontSize: '7px',
                    fontWeight: '500',
                    padding: '6px 10px',
                    background: '#ef4444',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#fff'
                  }}
                >
                  DEL
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Help Text */}
      <div style={{
        marginTop: '10px',
        fontSize: '7px',
        fontWeight: '500',
        letterSpacing: '0.05em',
        color: dark ? '#666' : '#999',
        textAlign: 'center'
      }}>
        IMPORT/EXPORT JSON FILES • LOAD PATTERNS INTO GRIDSEQ • DL = DOWNLOAD SINGLE PATTERN
      </div>
    </div>
  );
}

function Sandbox({ onBack, dark }) {
  const [windows, setWindows] = useState(() => {
    const saved = localStorage.getItem('carlisle_sandbox_windows');
    return saved ? JSON.parse(saved) : [];
  });
  const [nextId, setNextId] = useState(() => {
    const saved = localStorage.getItem('carlisle_sandbox_nextId');
    return saved ? parseInt(saved) : 1;
  });
  const [dragging, setDragging] = useState(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [focusedInstrument, setFocusedInstrument] = useState(() => {
    const saved = localStorage.getItem('carlisle_sandbox_focused');
    return saved ? parseInt(saved) : null;
  });
  const [instrumentParams, setInstrumentParams] = useState(() => {
    const saved = localStorage.getItem('carlisle_sandbox_params');
    if (saved) {
      const parsed = JSON.parse(saved);
      return new Map(Object.entries(parsed).map(([k, v]) => [parseInt(k), v]));
    }
    return new Map();
  });
  const audioContextRef = React.useRef(null);
  const masterGainRef = React.useRef(null);
  const analyserRef = React.useRef(null);
  const mediaRecorderRef = React.useRef(null);
  const recordedChunksRef = React.useRef([]);
  const tapTempoRef = React.useRef([]);
  
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [isRecording, setIsRecording] = useState(false);
  const [vuLevel, setVuLevel] = useState(0);
  const [tapBPM, setTapBPM] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showRecordingsLibrary, setShowRecordingsLibrary] = useState(false);
  const [recordings, setRecordings] = useState(() => {
    const saved = localStorage.getItem('carlisle_recordings');
    return saved ? JSON.parse(saved) : [];
  });
  const sandboxRef = React.useRef(null);

  // Auto-save windows
  React.useEffect(() => {
    localStorage.setItem('carlisle_sandbox_windows', JSON.stringify(windows));
  }, [windows]);

  // Auto-save nextId
  React.useEffect(() => {
    localStorage.setItem('carlisle_sandbox_nextId', nextId.toString());
  }, [nextId]);

  // Auto-save focused instrument
  React.useEffect(() => {
    if (focusedInstrument !== null) {
      localStorage.setItem('carlisle_sandbox_focused', focusedInstrument.toString());
    } else {
      localStorage.removeItem('carlisle_sandbox_focused');
    }
  }, [focusedInstrument]);

  // Auto-save instrument params
  React.useEffect(() => {
    const obj = Object.fromEntries(instrumentParams);
    localStorage.setItem('carlisle_sandbox_params', JSON.stringify(obj));
  }, [instrumentParams]);

  React.useEffect(() => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioContextRef.current = ctx;
    
    // Create master gain node (all sounds route through this)
    const masterGain = ctx.createGain();
    masterGain.gain.value = 1.0;
    masterGainRef.current = masterGain;
    
    // Create analyser for oscilloscope
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;
    analyserRef.current = analyser;
    
    // Route: all sounds -> masterGain -> analyser -> destination
    masterGain.connect(analyser);
    analyser.connect(ctx.destination);
    
    // VU meter update loop
    const updateVU = () => {
      if (analyserRef.current) {
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteTimeDomainData(dataArray);
        
        // Calculate RMS level
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const normalized = (dataArray[i] - 128) / 128;
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        setVuLevel(rms);
      }
      requestAnimationFrame(updateVU);
    };
    updateVU();
    
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Update master volume
  React.useEffect(() => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = masterVolume;
    }
  }, [masterVolume]);

  const availableModules = [
    { category: 'INSTRUMENTS', items: [
      { type: 'pulsewave', name: 'PULSEWAVE', description: 'KEYBOARD SYNTH' },
      { type: 'gridseq', name: 'GRIDSEQ', description: 'DRUM SEQUENCER' }
    ]},
    { category: 'CONTROL', items: [
      { type: 'control', name: 'CONTROL', description: 'UNIFIED CONTROL BOARD' }
    ]},
    { category: 'VISUALS', items: [
      { type: 'oscilloscope', name: 'OSCILLOSCOPE', description: 'WAVEFORM DISPLAY' }
    ]},
    { category: 'UTILITY', items: [
      { type: 'patternlibrary', name: 'PATTERN LIBRARY', description: 'SAVE & LOAD PATTERNS' }
    ]}
  ];

  const addWindow = (type) => {
    // Calculate position that stays within viewport
    const baseX = 100;
    const baseY = 100;
    const offsetX = (nextId * 30) % 500; // Wrap after 500px
    const offsetY = (nextId * 30) % 400; // Wrap after 400px
    
    const newWindow = {
      id: nextId,
      type,
      x: baseX + offsetX,
      y: baseY + offsetY,
      minimized: false,
      zIndex: nextId
    };

    // If adding an instrument, initialize its parameters
    if (type === 'gridseq') {
      const defaultParams = {
        bpm: 120,
        isPlaying: false,
        swing: 0, // 0-100% swing
        pattern: Array(5).fill(null).map(() => Array(16).fill(false)),
        stepProbabilities: Array(5).fill(null).map(() => Array(16).fill(100)), // 100% chance per step
        patternSlots: Array(16).fill(null), // 16 saved patterns
        clipboard: null, // Copy/paste
        selectedTrack: 0,
        kickPreset: 0,
        snarePreset: 0,
        hatPreset: 0,
        percPreset: 0,
        fxPreset: 0,
        tracks: [
          { 
            name: 'KICK',
            muted: false,
            soloed: false,
            // Dynamics
            gain: 1.0, compression: 0.5, volume: 0.8,
            // Synthesis
            decay: 0.5, sweep: 0, contour: 0.5, shape: 0,
            // EQ
            highpass: 0, eqLow: 0, eqMid: 0, eqHigh: 0,
            // FX
            reverbDecay: 0.2, delayTime: 0, delayFeedback: 0, delaySend: 0,
            // Modulation
            pan: 0, chorusDepth: 0, drive: 0,
            lfoRate: 2, lfoDepth: 0.3, lfoWave: 'sine'
          },
          { 
            name: 'SNARE',
            muted: false,
            soloed: false,
            gain: 1.0, compression: 0.5, volume: 0.8,
            decay: 0.2, sweep: 0, contour: 0.5, shape: 0,
            highpass: 0, eqLow: 0, eqMid: 0, eqHigh: 0,
            reverbDecay: 0.2, delayTime: 0, delayFeedback: 0, delaySend: 0,
            pan: 0, chorusDepth: 0, drive: 0,
            lfoRate: 4, lfoDepth: 0.2, lfoWave: 'triangle'
          },
          { 
            name: 'HAT',
            muted: false,
            soloed: false,
            gain: 1.0, compression: 0.5, volume: 0.8,
            decay: 0.05, sweep: 0, contour: 0.5, shape: 0,
            highpass: 0, eqLow: 0, eqMid: 0, eqHigh: 0,
            reverbDecay: 0.2, delayTime: 0, delayFeedback: 0, delaySend: 0,
            pan: 0, chorusDepth: 0, drive: 0,
            lfoRate: 6, lfoDepth: 0.1, lfoWave: 'square'
          },
          { 
            name: 'PERC',
            muted: false,
            soloed: false,
            gain: 1.0, compression: 0.5, volume: 0.8,
            decay: 0.3, sweep: 0, contour: 0.5, shape: 0,
            highpass: 0, eqLow: 0, eqMid: 0, eqHigh: 0,
            reverbDecay: 0.2, delayTime: 0, delayFeedback: 0, delaySend: 0,
            pan: 0, chorusDepth: 0, drive: 0,
            lfoRate: 3, lfoDepth: 0.25, lfoWave: 'sawtooth'
          },
          { 
            name: 'FX',
            muted: false,
            soloed: false,
            gain: 1.0, compression: 0.5, volume: 0.8,
            decay: 0.4, sweep: 0, contour: 0.5, shape: 0,
            highpass: 0, eqLow: 0, eqMid: 0, eqHigh: 0,
            reverbDecay: 0.2, delayTime: 0, delayFeedback: 0, delaySend: 0,
            pan: 0, chorusDepth: 0, drive: 0,
            lfoRate: 5, lfoDepth: 0.4, lfoWave: 'sine'
          }
        ]
      };
      
      setInstrumentParams(new Map(instrumentParams.set(nextId, defaultParams)));
      setFocusedInstrument(nextId);
    } else if (type === 'pulsewave') {
      const defaultParams = {
        oscType: 'sine',
        attack: 0.01,
        decay: 0.1,
        sustain: 0.7,
        release: 0.3,
        filterType: 'lowpass',
        filterFreq: 2000,
        filterQ: 1,
        volume: 0.3,
        octave: 4,
        // LFO
        lfoRate: 4,
        lfoDepth: 0.3,
        lfoWave: 'sine',
        // Advanced
        sweep: 0,
        contour: 0.5,
        shape: 0,
        pan: 0,
        drive: 0,
        // Routing
        routingEnabled: false,
        routingTarget: null, // GridSeq window ID
        routingTrack: 0, // Which track (0=kick, 1=snare, etc)
        // Arpeggiator
        arpEnabled: false,
        arpMode: 'up', // up, down, updown, random, chord
        arpRate: 8, // Note division (4=quarter, 8=eighth, 16=sixteenth)
        arpOctaves: 1, // 1-3 octaves
        arpGate: 0.8, // Note length 0-1
        bpm: 120 // BPM for arpeggiator timing
      };
      
      setInstrumentParams(new Map(instrumentParams.set(nextId, defaultParams)));
      setFocusedInstrument(nextId);
    }
    
    setWindows([...windows, newWindow]);
    setNextId(nextId + 1);
    setShowAddMenu(false);
  };

  // Audio recording functions
  const startRecording = () => {
    if (!audioContextRef.current) return;
    
    const dest = audioContextRef.current.createMediaStreamDestination();
    analyserRef.current.connect(dest);
    
    const mediaRecorder = new MediaRecorder(dest.stream);
    recordedChunksRef.current = [];
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        recordedChunksRef.current.push(e.data);
      }
    };
    
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      
      // Save to library
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result;
        const newRecording = {
          id: Date.now(),
          name: `Recording ${new Date().toLocaleString()}`,
          data: base64,
          timestamp: Date.now()
        };
        const updatedRecordings = [newRecording, ...recordings];
        setRecordings(updatedRecordings);
        
        // Try to save to localStorage with error handling
        try {
          localStorage.setItem('carlisle_recordings', JSON.stringify(updatedRecordings));
        } catch (e) {
          console.error('Failed to save recording to localStorage:', e);
          
          // Check if it's a quota exceeded error
          if (e.name === 'QuotaExceededError' || e.code === 22) {
            alert('Storage quota exceeded! Your recording was saved for this session but won\'t persist after refresh. Delete old recordings to free up space.');
          } else {
            alert('Failed to save recording. It will be lost on refresh.');
          }
        }
      };
      reader.readAsDataURL(blob);
      
      // Don't auto-download - user can download from recordings library
      // Clean up the blob URL
      URL.revokeObjectURL(url);
    };
    
    mediaRecorder.start();
    mediaRecorderRef.current = mediaRecorder;
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Tap tempo function
  const handleTapTempo = () => {
    const now = Date.now();
    tapTempoRef.current.push(now);
    
    // Keep only last 4 taps
    if (tapTempoRef.current.length > 4) {
      tapTempoRef.current.shift();
    }
    
    // Calculate BPM from taps
    if (tapTempoRef.current.length >= 2) {
      const intervals = [];
      for (let i = 1; i < tapTempoRef.current.length; i++) {
        intervals.push(tapTempoRef.current[i] - tapTempoRef.current[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
      const bpm = Math.round(60000 / avgInterval);
      setTapBPM(bpm);
      
      // Apply to all GridSeqs
      const newParams = new Map(instrumentParams);
      windows.forEach(w => {
        if (w.type === 'gridseq') {
          const params = newParams.get(w.id);
          if (params) {
            newParams.set(w.id, { ...params, bpm });
          }
        }
      });
      setInstrumentParams(newParams);
    }
    
    // Reset after 2 seconds of no taps
    setTimeout(() => {
      if (Date.now() - now > 1900) {
        tapTempoRef.current = [];
        setTapBPM(null);
      }
    }, 2000);
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      sandboxRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  // Listen for fullscreen changes
  React.useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const removeWindow = (id) => {
    setWindows(windows.filter(w => w.id !== id));
    if (focusedInstrument === id) {
      setFocusedInstrument(null);
    }
    instrumentParams.delete(id);
    setInstrumentParams(new Map(instrumentParams));
  };

  const toggleMinimize = (id) => {
    setWindows(windows.map(w => 
      w.id === id ? { ...w, minimized: !w.minimized } : w
    ));
  };

  const bringToFront = (id) => {
    const maxZ = Math.max(...windows.map(w => w.zIndex), 0);
    setWindows(windows.map(w =>
      w.id === id ? { ...w, zIndex: maxZ + 1 } : w
    ));
  };

  const focusInstrument = (id) => {
    const window = windows.find(w => w.id === id);
    if (window && (window.type === 'pulsewave' || window.type === 'gridseq')) {
      setFocusedInstrument(id);
      bringToFront(id);
    }
  };

  const updateInstrumentParam = (param, value) => {
    if (!focusedInstrument) return;
    
    const params = instrumentParams.get(focusedInstrument);
    if (params) {
      setInstrumentParams(new Map(instrumentParams.set(focusedInstrument, {
        ...params,
        [param]: value
      })));
    }
  };

  const handleDragStart = (e, id) => {
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.tagName === 'CANVAS') return;
    
    const window = windows.find(w => w.id === id);
    setDragging({
      id,
      offsetX: e.clientX - window.x,
      offsetY: e.clientY - window.y
    });
    bringToFront(id);
  };

  const handleDrag = (e) => {
    if (!dragging) return;
    
    setWindows(windows.map(w =>
      w.id === dragging.id
        ? { ...w, x: e.clientX - dragging.offsetX, y: e.clientY - dragging.offsetY }
        : w
    ));
  };

  const handleDragEnd = () => {
    setDragging(null);
  };

  React.useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleDrag);
      window.addEventListener('mouseup', handleDragEnd);
      return () => {
        window.removeEventListener('mousemove', handleDrag);
        window.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [dragging]);

  return (
    <div 
      ref={sandboxRef}
      style={{
        margin: '0 -20px',
        padding: '0 20px',
        width: 'calc(100vw - 40px)',
        maxWidth: '100%',
        ...(isFullscreen ? {
          margin: 0,
          padding: '20px',
          width: '100vw',
          height: '100vh',
          background: dark ? '#000' : '#fff',
          overflow: 'auto'
        } : {})
      }}>
      
      {/* TAB BAR - Browser Style */}
      {windows.length > 0 && (
        <div style={{
          display: 'flex',
          gap: '4px',
          marginBottom: '16px',
          borderBottom: `1px solid ${dark ? '#222' : '#e5e5e5'}`,
          paddingBottom: '8px',
          overflowX: 'auto',
          overflowY: 'hidden'
        }}>
          {windows.map(window => {
            const isFocused = focusedInstrument === window.id;
            const typeNames = {
              gridseq: 'GRIDSEQ',
              pulsewave: 'PULSEWAVE',
              control: 'CONTROL',
              oscilloscope: 'SCOPE',
              patternlibrary: 'LIBRARY'
            };
            
            return (
              <div
                key={window.id}
                onClick={() => focusInstrument(window.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 12px',
                  fontSize: '8px',
                  fontWeight: '600',
                  letterSpacing: '0.05em',
                  background: isFocused 
                    ? (dark ? '#1a1a1a' : '#f5f5f5')
                    : (dark ? '#0a0a0a' : '#fafafa'),
                  border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                  borderBottom: isFocused ? 'none' : `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                  cursor: 'pointer',
                  color: isFocused ? (dark ? '#fff' : '#000') : (dark ? '#888' : '#666'),
                  transition: 'all 0.2s',
                  borderRadius: '3px 3px 0 0',
                  whiteSpace: 'nowrap',
                  userSelect: 'none'
                }}
                onMouseEnter={(e) => {
                  if (!isFocused) {
                    e.currentTarget.style.background = dark ? '#111' : '#f0f0f0';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isFocused) {
                    e.currentTarget.style.background = dark ? '#0a0a0a' : '#fafafa';
                  }
                }}
              >
                <span>{typeNames[window.type] || window.type.toUpperCase()} #{window.id}</span>
                {window.minimized && <span style={{ fontSize: '6px', opacity: 0.5 }}>MIN</span>}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeWindow(window.id);
                  }}
                  style={{
                    fontSize: '12px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: dark ? '#666' : '#999',
                    padding: '0 4px',
                    lineHeight: '1'
                  }}
                  onMouseEnter={(e) => e.target.style.color = '#ef4444'}
                  onMouseLeave={(e) => e.target.style.color = dark ? '#666' : '#999'}
                  title="Close window"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
      
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '20px'
      }}>
        <button
          onClick={onBack}
          style={{
            fontSize: '10px',
            letterSpacing: '0.15em',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: dark ? '#999' : '#666',
            transition: 'opacity 0.2s'
          }}
          onMouseEnter={(e) => e.target.style.opacity = '0.5'}
          onMouseLeave={(e) => e.target.style.opacity = '1'}
        >
          ← BACK TO SOUNDS
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            fontSize: '24px',
            fontWeight: '300',
            letterSpacing: '0.15em',
            color: dark ? '#fff' : '#000'
          }}>
            SANDBOX
          </div>
          <button
            onClick={toggleFullscreen}
            style={{
              fontSize: '9px',
              letterSpacing: '0.1em',
              padding: '8px 12px',
              background: isFullscreen ? (dark ? '#4ade80' : '#22c55e') : 'none',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              cursor: 'pointer',
              color: isFullscreen ? '#000' : (dark ? '#fff' : '#000')
            }}
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? '⊗ EXIT' : '⛶ FULL'}
          </button>
        </div>

        {/* Global Transport Controls */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            onClick={() => {
              // Find GridSeq window and toggle its play state
              const gridSeqWindow = windows.find(w => w.type === 'gridseq');
              if (gridSeqWindow) {
                const params = instrumentParams.get(gridSeqWindow.id);
                if (params) {
                  const newParams = { ...params, isPlaying: !params.isPlaying };
                  setInstrumentParams(new Map(instrumentParams.set(gridSeqWindow.id, newParams)));
                }
              }
            }}
            style={{
              fontSize: '9px',
              letterSpacing: '0.1em',
              padding: '8px 14px',
              background: (() => {
                const gridSeqWindow = windows.find(w => w.type === 'gridseq');
                const isPlaying = gridSeqWindow ? instrumentParams.get(gridSeqWindow.id)?.isPlaying : false;
                return isPlaying ? (dark ? '#fff' : '#000') : 'none';
              })(),
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              cursor: 'pointer',
              color: (() => {
                const gridSeqWindow = windows.find(w => w.type === 'gridseq');
                const isPlaying = gridSeqWindow ? instrumentParams.get(gridSeqWindow.id)?.isPlaying : false;
                return isPlaying ? (dark ? '#000' : '#fff') : (dark ? '#fff' : '#000');
              })()
            }}
          >
            {(() => {
              const gridSeqWindow = windows.find(w => w.type === 'gridseq');
              const isPlaying = gridSeqWindow ? instrumentParams.get(gridSeqWindow.id)?.isPlaying : false;
              return isPlaying ? 'STOP' : 'PLAY';
            })()}
          </button>

          <div style={{ fontSize: '8px', letterSpacing: '0.1em', color: dark ? '#999' : '#666' }}>
            BPM
          </div>
          <input
            type="number"
            value={(() => {
              const gridSeqWindow = windows.find(w => w.type === 'gridseq');
              return gridSeqWindow ? instrumentParams.get(gridSeqWindow.id)?.bpm || 120 : 120;
            })()}
            onChange={(e) => {
              const gridSeqWindow = windows.find(w => w.type === 'gridseq');
              if (gridSeqWindow) {
                const params = instrumentParams.get(gridSeqWindow.id);
                if (params) {
                  const newParams = { ...params, bpm: parseInt(e.target.value) || 120 };
                  setInstrumentParams(new Map(instrumentParams.set(gridSeqWindow.id, newParams)));
                }
              }
            }}
            style={{
              width: '55px',
              fontSize: '9px',
              padding: '6px',
              background: 'none',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              color: dark ? '#fff' : '#000'
            }}
          />
        </div>

        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            style={{
              fontSize: '11px',
              letterSpacing: '0.1em',
              padding: '12px 24px',
              background: dark ? '#fff' : '#000',
              border: 'none',
              cursor: 'pointer',
              color: dark ? '#000' : '#fff',
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.8'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
          >
            + ADD MODULE
          </button>

          {showAddMenu && (
            <>
              <div
                onClick={() => setShowAddMenu(false)}
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 9998
                }}
              />
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '8px',
                backgroundColor: dark ? '#000' : '#fff',
                border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                minWidth: '250px',
                zIndex: 9999,
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
              }}>
                {availableModules.map(category => (
                  <div key={category.category}>
                    <div style={{
                      fontSize: '8px',
                      letterSpacing: '0.1em',
                      color: dark ? '#666' : '#999',
                      padding: '12px 16px 8px',
                      borderBottom: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`
                    }}>
                      {category.category}
                    </div>
                    {category.items.map(module => (
                      <button
                        key={module.type}
                        onClick={() => addWindow(module.type)}
                        style={{
                          width: '100%',
                          fontSize: '11px',
                          letterSpacing: '0.05em',
                          color: dark ? '#fff' : '#000',
                          background: 'none',
                          border: 'none',
                          borderBottom: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
                          cursor: 'pointer',
                          textAlign: 'left',
                          padding: '16px',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = dark ? '#0a0a0a' : '#fafafa'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                      >
                        <div style={{ marginBottom: '4px' }}>{module.name}</div>
                        <div style={{
                          fontSize: '9px',
                          color: dark ? '#666' : '#999'
                        }}>
                          {module.description}
                        </div>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Master Controls Strip */}
      <div style={{
        display: 'flex',
        gap: '20px',
        alignItems: 'center',
        marginBottom: '20px',
        padding: '16px',
        background: dark ? '#0a0a0a' : '#fafafa',
        border: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
        flexWrap: 'wrap'
      }}>
        {/* Master Volume */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '200px' }}>
          <div style={{
            fontSize: '8px',
            letterSpacing: '0.1em',
            color: dark ? '#999' : '#666',
            width: '60px'
          }}>
            MASTER
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={masterVolume}
            onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
            style={{ flex: 1 }}
          />
          <div style={{
            fontSize: '8px',
            fontFamily: 'monospace',
            color: dark ? '#999' : '#666',
            width: '35px'
          }}>
            {Math.round(masterVolume * 100)}%
          </div>
        </div>

        {/* VU Meter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '150px' }}>
          <div style={{
            fontSize: '8px',
            letterSpacing: '0.1em',
            color: dark ? '#999' : '#666'
          }}>
            VU
          </div>
          <div style={{
            flex: 1,
            height: '20px',
            background: dark ? '#1a1a1a' : '#f5f5f5',
            border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${Math.min(vuLevel * 200, 100)}%`,
              height: '100%',
              background: vuLevel > 0.8 ? '#ef4444' : vuLevel > 0.6 ? '#f59e0b' : '#22c55e',
              transition: 'width 0.05s, background-color 0.1s'
            }} />
          </div>
        </div>

        {/* Recording */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {!isRecording ? (
            <button
              onClick={startRecording}
              style={{
                fontSize: '9px',
                letterSpacing: '0.1em',
                padding: '8px 16px',
                background: '#ef4444',
                border: 'none',
                cursor: 'pointer',
                color: '#fff',
                borderRadius: '3px'
              }}
            >
              ● REC
            </button>
          ) : (
            <button
              onClick={stopRecording}
              style={{
                fontSize: '9px',
                letterSpacing: '0.1em',
                padding: '8px 16px',
                background: dark ? '#333' : '#ddd',
                border: 'none',
                cursor: 'pointer',
                color: dark ? '#fff' : '#000',
                borderRadius: '3px',
                animation: 'pulse 1s infinite'
              }}
            >
              ■ STOP
            </button>
          )}
          <button
            onClick={() => setShowRecordingsLibrary(!showRecordingsLibrary)}
            style={{
              fontSize: '9px',
              letterSpacing: '0.1em',
              padding: '8px 16px',
              background: showRecordingsLibrary ? (dark ? '#4ade80' : '#22c55e') : (dark ? '#fff' : '#000'),
              border: 'none',
              cursor: 'pointer',
              color: showRecordingsLibrary ? '#000' : (dark ? '#000' : '#fff'),
              borderRadius: '3px'
            }}
          >
            📼 RECORDINGS {recordings.length > 0 ? `(${recordings.length})` : ''}
          </button>
        </div>

        {/* Tap Tempo */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={handleTapTempo}
            style={{
              fontSize: '9px',
              letterSpacing: '0.1em',
              padding: '8px 16px',
              background: dark ? '#fff' : '#000',
              border: 'none',
              cursor: 'pointer',
              color: dark ? '#000' : '#fff',
              borderRadius: '3px'
            }}
          >
            TAP TEMPO
          </button>
          {tapBPM && (
            <div style={{
              fontSize: '8px',
              fontFamily: 'monospace',
              color: dark ? '#4ade80' : '#22c55e'
            }}>
              {tapBPM} BPM
            </div>
          )}
        </div>
      </div>

      {/* Workspace Canvas */}
      <div style={{
        position: 'relative',
        width: '100%',
        height: '70vh',
        backgroundColor: dark ? '#0a0a0a' : '#fafafa',
        border: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
        overflow: 'hidden'
      }}>
        {windows.length === 0 && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: '11px',
            letterSpacing: '0.1em',
            color: dark ? '#333' : '#ccc',
            textAlign: 'center'
          }}>
            CLICK "+ ADD MODULE" TO BEGIN
            <div style={{ fontSize: '9px', marginTop: '12px', color: dark ? '#222' : '#ddd' }}>
              ADD INSTRUMENTS • CONTROL BOARDS • VISUALS
            </div>
          </div>
        )}

        {/* Module Windows */}
        {windows.map(window => {
          // Control board and visuals use focused instrument's params
          const isControlBoard = ['control', 'oscilloscope'].includes(window.type);
          const windowParams = isControlBoard 
            ? instrumentParams.get(focusedInstrument)
            : instrumentParams.get(window.id);
          
          return (
            <SandboxWindow
              key={window.id}
              window={window}
              dark={dark}
              isFocused={focusedInstrument === window.id}
              params={windowParams}
              focusedInstrumentType={windows.find(w => w.id === focusedInstrument)?.type}
              audioContext={audioContextRef.current}
              masterGain={masterGainRef.current}
              analyser={analyserRef.current}
              windows={windows}
              instrumentParams={instrumentParams}
              onDragStart={(e) => handleDragStart(e, window.id)}
              onClose={() => removeWindow(window.id)}
              onToggleMinimize={() => toggleMinimize(window.id)}
              onFocus={() => focusInstrument(window.id)}
              onParamChange={updateInstrumentParam}
            />
          );
        })}
      </div>

      {/* RECORDINGS LIBRARY MODAL */}
      {showRecordingsLibrary && (
        <div
          onClick={() => setShowRecordingsLibrary(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: dark ? '#000' : '#fff',
              border: `2px solid ${dark ? '#333' : '#e5e5e5'}`,
              maxWidth: '800px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'auto',
              borderRadius: '4px'
            }}
          >
            {/* Header */}
            <div style={{
              padding: '20px',
              borderBottom: `1px solid ${dark ? '#222' : '#f0f0f0'}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div>
                <div style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  letterSpacing: '0.1em',
                  color: dark ? '#fff' : '#000'
                }}>
                  📼 RECORDINGS LIBRARY ({recordings.length})
                </div>
                <div style={{
                  fontSize: '9px',
                  color: dark ? '#666' : '#999',
                  marginTop: '4px'
                }}>
                  {(() => {
                    const storageSize = new Blob([JSON.stringify(recordings)]).size;
                    const sizeMB = (storageSize / 1024 / 1024).toFixed(2);
                    const quota = 10; // Approximate localStorage quota in MB
                    const percent = Math.min(100, (storageSize / (quota * 1024 * 1024)) * 100).toFixed(0);
                    return `${sizeMB} MB used (~${percent}% of storage)`;
                  })()}
                </div>
              </div>
              <button
                onClick={() => setShowRecordingsLibrary(false)}
                style={{
                  fontSize: '20px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: dark ? '#666' : '#999',
                  padding: '0 8px'
                }}
              >
                ×
              </button>
            </div>

            {/* Recordings List */}
            <div style={{ padding: '20px' }}>
              {recordings.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  color: dark ? '#666' : '#999',
                  fontSize: '12px'
                }}>
                  No recordings yet. Click REC to start recording!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {recordings.map((recording) => (
                    <div
                      key={recording.id}
                      style={{
                        background: dark ? '#0a0a0a' : '#fafafa',
                        border: `1px solid ${dark ? '#222' : '#e5e5e5'}`,
                        borderRadius: '3px',
                        padding: '16px'
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '12px'
                      }}>
                        <div>
                          <div style={{
                            fontSize: '11px',
                            fontWeight: '600',
                            color: dark ? '#fff' : '#000',
                            marginBottom: '4px'
                          }}>
                            {recording.name}
                          </div>
                          <div style={{
                            fontSize: '9px',
                            color: dark ? '#666' : '#999'
                          }}>
                            {new Date(recording.timestamp).toLocaleString()}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => {
                              const a = document.createElement('a');
                              a.href = recording.data;
                              a.download = `${recording.name.replace(/[^a-z0-9]/gi, '_')}.webm`;
                              a.click();
                            }}
                            style={{
                              fontSize: '9px',
                              padding: '6px 12px',
                              background: dark ? '#333' : '#e5e5e5',
                              border: 'none',
                              cursor: 'pointer',
                              color: dark ? '#fff' : '#000',
                              borderRadius: '3px'
                            }}
                          >
                            ⬇ DL
                          </button>
                          <button
                            onClick={() => {
                              const newName = prompt('Rename recording:', recording.name);
                              if (newName && newName.trim()) {
                                const updated = recordings.map(r =>
                                  r.id === recording.id ? { ...r, name: newName.trim() } : r
                                );
                                setRecordings(updated);
                                try {
                                  localStorage.setItem('carlisle_recordings', JSON.stringify(updated));
                                } catch (e) {
                                  console.error('Failed to save renamed recording:', e);
                                }
                              }
                            }}
                            style={{
                              fontSize: '9px',
                              padding: '6px 12px',
                              background: dark ? '#333' : '#e5e5e5',
                              border: 'none',
                              cursor: 'pointer',
                              color: dark ? '#fff' : '#000',
                              borderRadius: '3px'
                            }}
                          >
                            ✏ RENAME
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Delete this recording?')) {
                                const updated = recordings.filter(r => r.id !== recording.id);
                                setRecordings(updated);
                                try {
                                  localStorage.setItem('carlisle_recordings', JSON.stringify(updated));
                                } catch (e) {
                                  console.error('Failed to update recordings after delete:', e);
                                }
                              }
                            }}
                            style={{
                              fontSize: '9px',
                              padding: '6px 12px',
                              background: '#ef4444',
                              border: 'none',
                              cursor: 'pointer',
                              color: '#fff',
                              borderRadius: '3px'
                            }}
                          >
                            ✕ DEL
                          </button>
                        </div>
                      </div>
                      
                      {/* Audio Player */}
                      <audio
                        controls
                        src={recording.data}
                        style={{
                          width: '100%',
                          height: '32px'
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
              
              {recordings.length > 0 && (
                <div style={{
                  marginTop: '20px',
                  display: 'flex',
                  justifyContent: 'flex-end'
                }}>
                  <button
                    onClick={() => {
                      if (confirm(`Delete all ${recordings.length} recordings?`)) {
                        setRecordings([]);
                        localStorage.removeItem('carlisle_recordings');
                      }
                    }}
                    style={{
                      fontSize: '9px',
                      padding: '8px 16px',
                      background: dark ? '#333' : '#e5e5e5',
                      border: 'none',
                      cursor: 'pointer',
                      color: dark ? '#fff' : '#000',
                      borderRadius: '3px'
                    }}
                  >
                    CLEAR ALL
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{
        marginTop: '20px',
        fontSize: '10px',
        letterSpacing: '0.05em',
        color: dark ? '#666' : '#999',
        lineHeight: '1.6'
      }}>
        🎛️ MODULAR PATCHBAY • CLICK INSTRUMENTS TO FOCUS • CONTROL BOARDS AFFECT FOCUSED INSTRUMENT • ADD VISUALS
      </div>
    </div>
  );
}

function SandboxWindow({ window, dark, isFocused, params, focusedInstrumentType, audioContext, masterGain, analyser, windows, instrumentParams, onDragStart, onClose, onToggleMinimize, onFocus, onParamChange }) {
  const isInstrument = window.type === 'pulsewave' || window.type === 'gridseq';
  
  return (
    <div
      onMouseDown={onFocus}
      style={{
        position: 'absolute',
        left: `${window.x}px`,
        top: `${window.y}px`,
        backgroundColor: dark ? '#000' : '#fff',
        border: `2px solid ${isFocused ? (dark ? '#fff' : '#000') : (dark ? '#333' : '#e5e5e5')}`,
        boxShadow: isFocused ? '0 4px 12px rgba(0,0,0,0.3)' : '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: window.zIndex,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'border-color 0.2s'
      }}
    >
      {/* Window Header */}
      <div
        onMouseDown={onDragStart}
        style={{
          padding: '12px 16px',
          borderBottom: window.minimized ? 'none' : `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
          cursor: 'move',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: dark ? '#0a0a0a' : '#fafafa',
          userSelect: 'none'
        }}
      >
        <div style={{
          fontSize: '10px',
          letterSpacing: '0.1em',
          color: isFocused ? (dark ? '#fff' : '#000') : (dark ? '#666' : '#999'),
          fontWeight: isFocused ? '500' : '400',
          transition: 'color 0.2s'
        }}>
          {window.type.toUpperCase()}
        </div>
        
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={onToggleMinimize}
            style={{
              fontSize: '11px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: dark ? '#999' : '#666',
              padding: '0',
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.5'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
          >
            {window.minimized ? '▢' : '−'}
          </button>
          <button
            onClick={onClose}
            style={{
              fontSize: '11px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: dark ? '#999' : '#666',
              padding: '0',
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.5'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
          >
            ×
          </button>
        </div>
      </div>

      {/* Window Content */}
      {!window.minimized && (
        <div style={{ padding: '20px' }}>
          {window.type === 'pulsewave' && (
            <PulseWaveMinimal 
              dark={dark} 
              params={params} 
              audioContext={audioContext}
              masterGain={masterGain}
              windows={windows}
              instrumentParams={instrumentParams}
              onParamChange={onParamChange}
            />
          )}
          {window.type === 'gridseq' && (
            <GridSeqMinimal 
              dark={dark} 
              params={params}
              audioContext={audioContext}
              masterGain={masterGain}
              onParamChange={onParamChange}
            />
          )}
          {window.type === 'control' && (
            <UnifiedControlBoard 
              dark={dark} 
              params={params}
              instrumentType={focusedInstrumentType}
              onParamChange={onParamChange}
            />
          )}
          {window.type === 'oscilloscope' && (
            <OscilloscopeVisual 
              dark={dark}
              analyser={analyser}
            />
          )}
          {window.type === 'patternlibrary' && (
            <PatternLibrary 
              dark={dark}
              onLoadPattern={(pattern) => {
                // Load pattern into focused GridSeq
                if (focusedInstrument && params) {
                  onParamChange('pattern', pattern);
                }
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

// Minimal PulseWave - just keyboard + octave
function PulseWaveMinimal({ dark, params, audioContext, masterGain, windows, instrumentParams, onParamChange }) {
  const [activeNotes, setActiveNotes] = useState(new Set());
  const voicesRef = React.useRef(new Map());
  
  // Arpeggiator state
  const [heldNotes, setHeldNotes] = useState(new Set());
  const [arpStepIndex, setArpStepIndex] = useState(0);
  const arpIntervalRef = React.useRef(null);
  const lastArpNoteRef = React.useRef(null);
  const heldNotesRef = React.useRef(new Set()); // Ref for interval access
  
  // Keep ref in sync with state
  React.useEffect(() => {
    heldNotesRef.current = heldNotes;
  }, [heldNotes]);

  const notes = [
    { name: 'C', offset: 0, isBlack: false, key: 'a' },
    { name: 'C#', offset: 1, isBlack: true, key: 'w' },
    { name: 'D', offset: 2, isBlack: false, key: 's' },
    { name: 'D#', offset: 3, isBlack: true, key: 'e' },
    { name: 'E', offset: 4, isBlack: false, key: 'd' },
    { name: 'F', offset: 5, isBlack: false, key: 'f' },
    { name: 'F#', offset: 6, isBlack: true, key: 't' },
    { name: 'G', offset: 7, isBlack: false, key: 'g' },
    { name: 'G#', offset: 8, isBlack: true, key: 'y' },
    { name: 'A', offset: 9, isBlack: false, key: 'h' },
    { name: 'A#', offset: 10, isBlack: true, key: 'u' },
    { name: 'B', offset: 11, isBlack: false, key: 'j' },
    { name: 'C', offset: 12, isBlack: false, key: 'k' }
  ];

  const getFrequency = (offset, octave) => {
    return 440 * Math.pow(2, (octave - 4) + (offset - 9) / 12);
  };

  const playNote = (noteName, offset) => {
    if (!audioContext || !params) return;

    // Stop any existing note with this name first
    if (voicesRef.current.has(noteName)) {
      stopNote(noteName);
    }

    const freq = getFrequency(offset, params.octave);
    const now = audioContext.currentTime;

    // ROUTING MODE: Play drum sound at keyboard pitch (Salem "Trapdoor" style!)
    if (params.routingEnabled && params.routingTarget && instrumentParams) {
      const targetParams = instrumentParams.get(params.routingTarget);
      if (targetParams && targetParams.tracks) {
        const trackIndex = params.routingTrack || 0;
        const mixerTrack = targetParams.tracks[trackIndex];
        
        // Create full drum synthesis chain at keyboard frequency
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const driveGain = audioContext.createGain();
        const volumeGain = audioContext.createGain();
        const panner = audioContext.createStereoPanner();
        
        // Use mixer settings
        const decay = mixerTrack?.decay || 0.5;
        const volume = (mixerTrack?.volume || 0.8) * (mixerTrack?.gain || 1.0) * 0.3;
        const oscType = mixerTrack?.shape > 0.66 ? 'square' : mixerTrack?.shape > 0.33 ? 'sawtooth' : 'sine';
        const sweepAmount = (mixerTrack?.sweep || 0) * 2000;
        const driveAmount = 1 + ((mixerTrack?.drive || 0) * 2);
        const contour = mixerTrack?.contour || 0.5;
        
        osc.type = oscType;
        
        // Apply EQ chain
        let currentNode = gain;
        
        // High-pass filter
        if (mixerTrack?.highpass > 0) {
          const hpf = audioContext.createBiquadFilter();
          hpf.type = 'highpass';
          hpf.frequency.value = mixerTrack.highpass;
          gain.connect(hpf);
          currentNode = hpf;
        }
        
        // 3-band EQ
        if (mixerTrack?.eqLow !== 0) {
          const lowShelf = audioContext.createBiquadFilter();
          lowShelf.type = 'lowshelf';
          lowShelf.frequency.value = 200;
          lowShelf.gain.value = mixerTrack.eqLow;
          currentNode.connect(lowShelf);
          currentNode = lowShelf;
        }
        
        if (mixerTrack?.eqMid !== 0) {
          const midPeak = audioContext.createBiquadFilter();
          midPeak.type = 'peaking';
          midPeak.frequency.value = 1000;
          midPeak.Q.value = 1;
          midPeak.gain.value = mixerTrack.eqMid;
          currentNode.connect(midPeak);
          currentNode = midPeak;
        }
        
        if (mixerTrack?.eqHigh !== 0) {
          const highShelf = audioContext.createBiquadFilter();
          highShelf.type = 'highshelf';
          highShelf.frequency.value = 4000;
          highShelf.gain.value = mixerTrack.eqHigh;
          currentNode.connect(highShelf);
          currentNode = highShelf;
        }
        
        currentNode.connect(driveGain);
        driveGain.connect(volumeGain);
        volumeGain.connect(panner);
        
        // Frequency with pitch envelope (kick-style)
        if (trackIndex === 0) { // KICK - pitch envelope down
          osc.frequency.setValueAtTime(freq + sweepAmount, now);
          osc.frequency.exponentialRampToValueAtTime(Math.max(50, freq * 0.3), now + 0.1);
        } else { // OTHER DRUMS - optional sweep
          osc.frequency.setValueAtTime(freq + sweepAmount, now);
          if (sweepAmount !== 0) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(50, freq), now + decay * 0.5);
          }
        }
        
        // Gain envelope with contour
        if (contour > 0.5) {
          gain.gain.setValueAtTime(volume, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + decay);
        } else {
          gain.gain.setValueAtTime(volume, now);
          gain.gain.linearRampToValueAtTime(0, now + decay);
        }
        
        driveGain.gain.value = driveAmount;
        volumeGain.gain.value = 1;
        panner.pan.value = mixerTrack?.pan || 0;
        
        osc.connect(gain);
        const finalDestination = masterGain || audioContext.destination;
        panner.connect(finalDestination);
        
        osc.start(now);
        osc.stop(now + decay);
        
        // Store for cleanup
        voicesRef.current.set(noteName, { osc, gainNode: gain, panner });
        setActiveNotes(new Set([...voicesRef.current.keys()]));
        
        return; // Exit early - we played drum sound
      }
    }

    // NORMAL MODE: Play synth sound
    const osc = audioContext.createOscillator();
    osc.type = params.oscType;
    osc.frequency.setValueAtTime(freq, now);

    const gainNode = audioContext.createGain();
    
    // Check if this is an arp note (needs smoother envelope to prevent clicks)
    const isArpNote = noteName.startsWith('arp_');
    let timeoutId; // Define in outer scope
    
    if (isArpNote) {
      // ARP MODE: Ultra-smooth envelope to prevent clicks/pops
      const arpAttack = 0.003; // 3ms attack to prevent clicks
      
      gainNode.gain.setValueAtTime(0.001, now); // Start just above 0 for exponential
      // Use exponentialRampToValueAtTime for smoother attack (no clicks)
      gainNode.gain.exponentialRampToValueAtTime(params.volume * 0.01, now + 0.001);
      gainNode.gain.exponentialRampToValueAtTime(params.volume, now + arpAttack);
      
      // NO safety timeout for arp notes - arp engine handles stopping via gate time
      // This prevents accumulated timeouts from killing the arp after a few measures
      timeoutId = undefined;
    } else {
      // NORMAL MODE: Full ADSR envelope with smooth exponential ramps
      gainNode.gain.setValueAtTime(0.001, now); // Start just above 0 for exponential
      
      // Attack - exponential ramp for smooth start (no click)
      gainNode.gain.exponentialRampToValueAtTime(params.volume, now + params.attack);
      
      // Decay to sustain level
      const sustainLevel = Math.max(0.001, params.volume * params.sustain); // Keep above 0 for exponential
      gainNode.gain.exponentialRampToValueAtTime(sustainLevel, now + params.attack + params.decay);
      
      // Safety auto-release - much shorter to prevent stuck notes
      // Maximum 3 seconds for any note (prevents infinite notes if keyup missed)
      const maxNoteTime = Math.min(3, params.attack + params.decay + 2);
      
      // Schedule auto-release with exponential ramp (smooth fadeout, no click)
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + maxNoteTime);
      
      // Timeout to stop oscillator and cleanup
      timeoutId = setTimeout(() => {
        try {
          if (voicesRef.current.has(noteName)) {
            const voice = voicesRef.current.get(noteName);
            if (voice.osc && voice.osc.context.state === 'running') {
              voice.osc.stop();
            }
            voicesRef.current.delete(noteName);
            setActiveNotes(new Set([...voicesRef.current.keys()]));
          }
        } catch (e) {
          console.log('Auto-release cleanup error:', e);
        }
      }, maxNoteTime * 1000 + 100);
    }
    
    // Rest of code is same for both modes

    const filter = audioContext.createBiquadFilter();
    filter.type = params.filterType;
    filter.frequency.setValueAtTime(params.filterFreq, now);
    filter.Q.setValueAtTime(params.filterQ, now);

    osc.connect(filter);
    filter.connect(gainNode);
    
    // Route through masterGain for oscilloscope, or directly to destination
    const finalDestination = masterGain || audioContext.destination;
    gainNode.connect(finalDestination);

    osc.start(now);

    // Store params with voice for proper release
    const voiceData = { 
      osc, 
      gainNode, 
      filter, 
      params: { ...params }, // Store snapshot of params
      timeoutId // Store timeout for all notes (normal and arp now have safety timeouts)
    };
    
    voicesRef.current.set(noteName, voiceData);
    setActiveNotes(new Set([...voicesRef.current.keys()]));
  };

  const stopNote = (noteName) => {
    const voice = voicesRef.current.get(noteName);
    if (!voice || !audioContext) return;

    const now = audioContext.currentTime;
    const isArpNote = noteName.startsWith('arp_');
    
    // Arp notes use shorter release, normal notes use user-set release
    const releaseTime = isArpNote ? 0.02 : (voice.params?.release || 0.3);

    // Clear the auto-release timeout
    if (voice.timeoutId) {
      clearTimeout(voice.timeoutId);
    }

    try {
      voice.gainNode.gain.cancelScheduledValues(now);
      const currentGain = voice.gainNode.gain.value;
      voice.gainNode.gain.setValueAtTime(currentGain, now);
      
      // ALWAYS use exponential ramp for smooth release (no clicks/pops)
      if (currentGain > 0.001) {
        voice.gainNode.gain.exponentialRampToValueAtTime(0.001, now + releaseTime);
      } else {
        voice.gainNode.gain.setValueAtTime(0.001, now);
      }
    } catch (e) {
      console.log('Stop note error:', e);
    }

    setTimeout(() => {
      try {
        if (voicesRef.current.has(noteName)) {
          // Check oscillator state before stopping
          if (voice.osc && voice.osc.context.state === 'running') {
            voice.osc.stop();
          }
          voicesRef.current.delete(noteName);
          setActiveNotes(new Set([...voicesRef.current.keys()]));
        }
      } catch (e) {
        console.log('Cleanup error:', e);
      }
    }, releaseTime * 1000 + 100);
  };

  // Arpeggiator pattern generation
  const getArpPattern = (noteOffsets, mode, octaves) => {
    if (!noteOffsets || noteOffsets.length === 0) return [];
    
    let pattern = [];
    const sortedNotes = [...noteOffsets].sort((a, b) => a - b);
    
    // Build pattern across octaves
    for (let oct = 0; oct < octaves; oct++) {
      const octaveShift = oct * 12;
      if (mode === 'up') {
        pattern.push(...sortedNotes.map(n => n + octaveShift));
      } else if (mode === 'down') {
        pattern.push(...[...sortedNotes].reverse().map(n => n + octaveShift));
      } else if (mode === 'random') {
        pattern.push(...sortedNotes.map(n => n + octaveShift));
      }
    }
    
    // Handle up-down mode
    if (mode === 'updown') {
      for (let oct = 0; oct < octaves; oct++) {
        const octaveShift = oct * 12;
        pattern.push(...sortedNotes.map(n => n + octaveShift));
      }
      for (let oct = octaves - 1; oct >= 0; oct--) {
        const octaveShift = oct * 12;
        pattern.push(...[...sortedNotes].reverse().slice(1).map(n => n + octaveShift));
      }
    }
    
    // Chord mode - all notes at once
    if (mode === 'chord') {
      pattern = sortedNotes;
    }
    
    return pattern;
  };

  // Clear held notes when arp is disabled
  React.useEffect(() => {
    if (!params?.arpEnabled) {
      setHeldNotes(new Set());
    }
  }, [params?.arpEnabled]);

  // Separate effect to stop arp when no notes held (without restarting the interval)
  React.useEffect(() => {
    // Only stop if arp is enabled and we go from notes to no notes
    if (params?.arpEnabled && heldNotes.size === 0 && arpIntervalRef.current) {
      clearInterval(arpIntervalRef.current);
      arpIntervalRef.current = null;
      
      // Stop ALL arp notes
      voicesRef.current.forEach((voice, noteName) => {
        if (noteName.startsWith('arp_')) {
          stopNote(noteName);
        }
      });
      lastArpNoteRef.current = null;
    }
  }, [heldNotes.size, params?.arpEnabled]);

  // Arpeggiator effect - ONLY depends on settings, NOT on heldNotes
  // Starts interval when enabled, stops when disabled
  // Interval reads fresh notes from ref every tick
  React.useEffect(() => {
    if (!params?.arpEnabled || !audioContext) {
      // Disabled - cleanup
      if (arpIntervalRef.current) {
        clearInterval(arpIntervalRef.current);
        arpIntervalRef.current = null;
      }
      voicesRef.current.forEach((voice, noteName) => {
        if (noteName.startsWith('arp_')) {
          stopNote(noteName);
        }
      });
      lastArpNoteRef.current = null;
      return;
    }

    // If we have no notes held, don't start interval yet
    // (will be triggered when notes are added via dependency below)
    if (heldNotesRef.current.size === 0) {
      return;
    }

    // If interval already running and settings haven't changed, don't restart
    // (This preserves timing when notes are added/removed)
    // We'll restart only when this effect runs due to settings change
    const hasIntervalRunning = arpIntervalRef.current !== null;
    
    // Calculate timing from params
    const rawBpm = params.bpm || 120;
    const bpm = rawBpm * 1.005;
    const beatDuration = 60000 / bpm;
    const arpRate = params.arpRate || 8;
    const arpMode = params.arpMode || 'up';
    const arpOctaves = params.arpOctaves || 1;
    const arpGate = params.arpGate !== undefined ? params.arpGate : 0.8;
    
    const noteDuration = beatDuration / (arpRate / 4);
    const gateTime = noteDuration * arpGate;

    // Only clear interval if we actually need to restart (settings changed)
    // If interval exists and we're just responding to hasNotes changing, skip
    if (hasIntervalRunning) {
      return; // Keep existing interval, it will read fresh notes from ref
    }

    // No interval running, start one
    // Stop all previous arp notes
    voicesRef.current.forEach((voice, noteName) => {
      if (noteName.startsWith('arp_')) {
        stopNote(noteName);
      }
    });

    // Chord mode setup
    if (arpMode === 'chord') {
      let isFirstTick = true;
      
      arpIntervalRef.current = setInterval(() => {
        const currentOffsets = Array.from(heldNotesRef.current);
        if (currentOffsets.length === 0) return;
        
        const currentPattern = getArpPattern(currentOffsets, arpMode, arpOctaves);
        
        currentPattern.forEach((offset, i) => {
          const noteName = `arp_chord_${i}`;
          if (!isFirstTick) stopNote(noteName);
          setTimeout(() => playNote(noteName, offset), isFirstTick ? 0 : 10);
        });
        
        isFirstTick = false;
      }, noteDuration);
      
      // Trigger first chord immediately
      const initialOffsets = Array.from(heldNotesRef.current);
      if (initialOffsets.length > 0) {
        const initialPattern = getArpPattern(initialOffsets, arpMode, arpOctaves);
        initialPattern.forEach((offset, i) => {
          playNote(`arp_chord_${i}`, offset);
        });
      }
      
      return;
    }

    // Sequential modes
    let currentIndex = 0;
    let hasPlayedFirst = false;
    
    arpIntervalRef.current = setInterval(() => {
      const currentOffsets = Array.from(heldNotesRef.current);
      if (currentOffsets.length === 0) return;
      
      const currentPattern = getArpPattern(currentOffsets, arpMode, arpOctaves);
      if (currentPattern.length === 0) return;
      
      // Play first note on first tick
      if (!hasPlayedFirst) {
        const firstOffset = currentPattern[0];
        const firstName = `arp_0`;
        playNote(firstName, firstOffset);
        lastArpNoteRef.current = firstName;
        hasPlayedFirst = true;
        
        setTimeout(() => stopNote(firstName), gateTime);
        return;
      }
      
      // Move to next step
      currentIndex = (currentIndex + 1) % currentPattern.length;
      
      if (arpMode === 'random') {
        currentIndex = Math.floor(Math.random() * currentPattern.length);
      }
      
      const offset = currentPattern[currentIndex];
      const noteName = `arp_${currentIndex}_${Date.now()}`;
      
      playNote(noteName, offset);
      
      const prevNote = lastArpNoteRef.current;
      if (prevNote) {
        setTimeout(() => stopNote(prevNote), 10);
      }
      
      lastArpNoteRef.current = noteName;
      
      setTimeout(() => stopNote(noteName), gateTime);
    }, noteDuration);

    // Cleanup
    return () => {
      if (arpIntervalRef.current) {
        clearInterval(arpIntervalRef.current);
        arpIntervalRef.current = null;
      }
      voicesRef.current.forEach((voice, noteName) => {
        if (noteName.startsWith('arp_')) {
          stopNote(noteName);
        }
      });
      lastArpNoteRef.current = null;
    };
  }, [params?.arpEnabled, params?.arpMode, params?.arpRate, params?.arpOctaves, params?.arpGate, params?.bpm, heldNotes.size > 0, audioContext]);

  // Add keyboard support
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.repeat) return;
      
      const note = notes.find(n => n.key === e.key.toLowerCase());
      if (note) {
        e.preventDefault();
        
        if (params?.arpEnabled) {
          // Arp mode: add to held notes
          setHeldNotes(prev => new Set([...prev, note.offset]));
        } else {
          // Normal mode: play directly
          playNote(note.name + note.offset, note.offset);
        }
      }
    };

    const handleKeyUp = (e) => {
      const note = notes.find(n => n.key === e.key.toLowerCase());
      if (note) {
        e.preventDefault();
        
        if (params?.arpEnabled) {
          // Arp mode: remove from held notes
          setHeldNotes(prev => {
            const newSet = new Set(prev);
            newSet.delete(note.offset);
            return newSet;
          });
        } else {
          // Normal mode: stop directly
          stopNote(note.name + note.offset);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [params, audioContext]);

  // Cleanup all voices on unmount
  React.useEffect(() => {
    return () => {
      // Stop all playing notes when component unmounts
      voicesRef.current.forEach((voice, noteName) => {
        try {
          if (voice.timeoutId) {
            clearTimeout(voice.timeoutId);
          }
          voice.osc.stop();
        } catch (e) {
          console.log('Unmount cleanup error:', e);
        }
      });
      voicesRef.current.clear();
    };
  }, []);

  return (
    <div style={{ width: '400px' }}>
      {/* Octave selector */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '20px',
        alignItems: 'center'
      }}>
        <div style={{
          fontSize: '9px',
          letterSpacing: '0.1em',
          color: dark ? '#999' : '#666'
        }}>
          OCTAVE:
        </div>
        {[2, 3, 4, 5, 6].map(oct => (
          <button
            key={oct}
            onClick={() => onParamChange('octave', oct)}
            style={{
              fontSize: '9px',
              letterSpacing: '0.1em',
              padding: '6px 12px',
              background: params?.octave === oct ? (dark ? '#fff' : '#000') : 'none',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              cursor: 'pointer',
              color: params?.octave === oct ? (dark ? '#000' : '#fff') : (dark ? '#fff' : '#000')
            }}
          >
            {oct}
          </button>
        ))}
        
        {/* PANIC button - stops all notes */}
        <button
          onClick={() => {
            if (!audioContext) return;
            
            // Clear arp interval
            if (arpIntervalRef.current) {
              clearInterval(arpIntervalRef.current);
              arpIntervalRef.current = null;
            }
            
            // Clear held notes (stops arp from restarting)
            setHeldNotes(new Set());
            
            // Stop all playing notes IMMEDIATELY - no fade
            voicesRef.current.forEach((voice, noteName) => {
              try {
                // Clear any pending timeouts
                if (voice.timeoutId) {
                  clearTimeout(voice.timeoutId);
                }
                
                const now = audioContext.currentTime;
                
                // Immediate gain cut - no fade for PANIC
                try {
                  voice.gainNode.gain.cancelScheduledValues(now);
                  voice.gainNode.gain.setValueAtTime(0, now);
                } catch (e) {
                  // Gain node might be in bad state
                }
                
                // Stop oscillator immediately
                try {
                  if (voice.osc) {
                    // Try to stop gracefully first
                    if (voice.osc.context.state === 'running') {
                      voice.osc.stop(now + 0.001); // Stop almost immediately
                    }
                  }
                } catch (e) {
                  // Oscillator might already be stopped - that's fine
                }
                
                // Disconnect everything
                try {
                  voice.osc.disconnect();
                  voice.filter.disconnect();
                  voice.gainNode.disconnect();
                } catch (e) {
                  // Already disconnected
                }
              } catch (e) {
                console.log('Panic error for note:', noteName, e);
              }
            });
            
            // Clear everything
            voicesRef.current.clear();
            setActiveNotes(new Set());
            lastArpNoteRef.current = null;
          }}
          style={{
            fontSize: '8px',
            letterSpacing: '0.1em',
            padding: '6px 12px',
            background: '#ef4444',
            border: 'none',
            cursor: 'pointer',
            color: '#fff',
            marginLeft: 'auto'
          }}
          title="Stop all notes immediately"
        >
          PANIC
        </button>
      </div>

      {/* COMPACT ROUTING & ARP CONTROLS */}
      <div style={{
        marginBottom: '12px',
        padding: '8px',
        background: dark ? '#0a0a0a' : '#fafafa',
        border: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`
      }}>
        {/* Row 1: Routing */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '6px' }}>
          <div style={{ fontSize: '7px', fontWeight: '600', color: dark ? '#888' : '#666', minWidth: '35px' }}>ROUTE:</div>
          <button
            onClick={() => onParamChange('routingEnabled', !params.routingEnabled)}
            style={{
              fontSize: '7px',
              fontWeight: '600',
              padding: '4px 8px',
              background: params.routingEnabled ? (dark ? '#4ade80' : '#22c55e') : 'none',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              cursor: 'pointer',
              color: params.routingEnabled ? '#000' : (dark ? '#fff' : '#000')
            }}
          >
            {params.routingEnabled ? 'ON' : 'OFF'}
          </button>
          {windows && Array.isArray(windows) && windows.some(w => w.type === 'gridseq') && (
            <>
              <select
                value={params.routingTarget || ''}
                onChange={(e) => onParamChange('routingTarget', parseInt(e.target.value))}
                style={{
                  fontSize: '7px',
                  padding: '4px 6px',
                  background: dark ? '#1a1a1a' : '#fff',
                  border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                  color: dark ? '#fff' : '#000',
                  cursor: 'pointer'
                }}
                disabled={!params.routingEnabled}
              >
                <option value="">GridSeq...</option>
                {windows.filter(w => w.type === 'gridseq').map(w => (
                  <option key={w.id} value={w.id}>#{w.id}</option>
                ))}
              </select>
              <select
                value={params.routingTrack || 0}
                onChange={(e) => onParamChange('routingTrack', parseInt(e.target.value))}
                style={{
                  fontSize: '7px',
                  padding: '4px 6px',
                  background: dark ? '#1a1a1a' : '#fff',
                  border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                  color: dark ? '#fff' : '#000',
                  cursor: 'pointer'
                }}
                disabled={!params.routingEnabled}
              >
                <option value={0}>KICK</option>
                <option value={1}>SNR</option>
                <option value={2}>HAT</option>
                <option value={3}>PRC</option>
                <option value={4}>FX</option>
              </select>
            </>
          )}
          {params.routingEnabled && params.routingTarget && (
            <div style={{ fontSize: '6px', color: dark ? '#4ade80' : '#22c55e', marginLeft: 'auto' }}>
              🎹 {['KICK', 'SNR', 'HAT', 'PRC', 'FX'][params.routingTrack || 0]}
            </div>
          )}
        </div>
        
        {/* Row 2: Arp */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ fontSize: '7px', fontWeight: '600', color: dark ? '#888' : '#666', minWidth: '35px' }}>ARP:</div>
          <button
            onClick={() => onParamChange('arpEnabled', !params.arpEnabled)}
            style={{
              fontSize: '7px',
              fontWeight: '600',
              padding: '4px 8px',
              background: params.arpEnabled ? (dark ? '#4ade80' : '#22c55e') : 'none',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              cursor: 'pointer',
              color: params.arpEnabled ? '#000' : (dark ? '#fff' : '#000')
            }}
          >
            {params.arpEnabled ? 'ON' : 'OFF'}
          </button>
          <select
            value={params.arpMode || 'up'}
            onChange={(e) => onParamChange('arpMode', e.target.value)}
            style={{
              fontSize: '7px',
              padding: '4px 6px',
              background: dark ? '#1a1a1a' : '#fff',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              color: dark ? '#fff' : '#000',
              cursor: 'pointer'
            }}
            disabled={!params.arpEnabled}
          >
            <option value="up">UP</option>
            <option value="down">DN</option>
            <option value="updown">UD</option>
            <option value="random">RND</option>
            <option value="chord">CHD</option>
          </select>
          <select
            value={params.arpRate || 8}
            onChange={(e) => onParamChange('arpRate', parseInt(e.target.value))}
            style={{
              fontSize: '7px',
              padding: '4px 6px',
              background: dark ? '#1a1a1a' : '#fff',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              color: dark ? '#fff' : '#000',
              cursor: 'pointer'
            }}
            disabled={!params.arpEnabled}
          >
            <option value={4}>1/4</option>
            <option value={8}>1/8</option>
            <option value={16}>1/16</option>
            <option value={32}>1/32</option>
          </select>
          <select
            value={params.arpOctaves || 1}
            onChange={(e) => onParamChange('arpOctaves', parseInt(e.target.value))}
            style={{
              fontSize: '7px',
              padding: '4px 6px',
              background: dark ? '#1a1a1a' : '#fff',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              color: dark ? '#fff' : '#000',
              cursor: 'pointer'
            }}
            disabled={!params.arpEnabled}
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.1"
            value={params.arpGate || 0.8}
            onChange={(e) => onParamChange('arpGate', parseFloat(e.target.value))}
            style={{ width: '50px', cursor: 'pointer' }}
            disabled={!params.arpEnabled}
          />
          <div style={{ fontSize: '6px', color: dark ? '#999' : '#666', minWidth: '25px' }}>
            {Math.round((params.arpGate || 0.8) * 100)}%
          </div>
          <input
            type="number"
            min="40"
            max="300"
            value={params.bpm || 120}
            onChange={(e) => onParamChange('bpm', parseInt(e.target.value) || 120)}
            style={{
              fontSize: '7px',
              padding: '3px 4px',
              width: '40px',
              background: dark ? '#1a1a1a' : '#fff',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              color: dark ? '#fff' : '#000',
              textAlign: 'center'
            }}
            disabled={!params.arpEnabled}
          />
          <div style={{ fontSize: '6px', color: dark ? '#999' : '#666' }}>BPM</div>
          {windows && Array.isArray(windows) && windows.some(w => w.type === 'gridseq') && (
            <button
              onClick={() => {
                try {
                  const gridSeqWindow = windows.find(w => w.type === 'gridseq');
                  if (gridSeqWindow && instrumentParams && typeof instrumentParams.get === 'function') {
                    const gridSeqParams = instrumentParams.get(gridSeqWindow.id);
                    if (gridSeqParams && gridSeqParams.bpm) {
                      onParamChange('bpm', gridSeqParams.bpm);
                    }
                  }
                } catch (e) {
                  console.log('SYNC button error:', e);
                }
              }}
              style={{
                fontSize: '6px',
                padding: '3px 6px',
                background: dark ? '#333' : '#e5e5e5',
                border: 'none',
                cursor: 'pointer',
                color: dark ? '#fff' : '#000',
                borderRadius: '2px'
              }}
              disabled={!params.arpEnabled}
              title="Sync to GridSeq BPM"
            >
              SYNC
            </button>
          )}
          {params.arpEnabled && (
            <div style={{ fontSize: '6px', color: dark ? '#4ade80' : '#22c55e', marginLeft: 'auto' }}>
              🎵 {heldNotes.size}
            </div>
          )}
        </div>
      </div>

      {/* Keyboard */}
      <div style={{
        display: 'flex',
        position: 'relative',
        height: '120px',
        userSelect: 'none'
      }}>
        {notes.filter(n => !n.isBlack).map((note, i) => (
          <button
            key={note.name + i + note.offset}
            onPointerDown={(e) => { 
              e.preventDefault();
              if (params?.arpEnabled) {
                setHeldNotes(prev => new Set([...prev, note.offset]));
              } else {
                playNote(note.name + note.offset, note.offset);
              }
            }}
            onPointerUp={(e) => { 
              e.preventDefault();
              if (params?.arpEnabled) {
                setHeldNotes(prev => {
                  const newSet = new Set(prev);
                  newSet.delete(note.offset);
                  return newSet;
                });
              } else {
                stopNote(note.name + note.offset);
              }
            }}
            onPointerLeave={(e) => { 
              if (e.buttons === 1) {
                e.preventDefault();
                if (params?.arpEnabled) {
                  setHeldNotes(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(note.offset);
                    return newSet;
                  });
                } else {
                  stopNote(note.name + note.offset);
                }
              }
            }}
            style={{
              flex: 1,
              background: activeNotes.has(note.name + note.offset)
                ? (dark ? '#999' : '#ccc') 
                : (dark ? '#fff' : '#fff'),
              border: `1px solid ${dark ? '#000' : '#000'}`,
              cursor: 'pointer',
              position: 'relative',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              paddingBottom: '8px',
              fontSize: '8px',
              color: '#000',
              touchAction: 'none'
            }}
          >
            {note.name}
          </button>
        ))}

        {notes.filter(n => n.isBlack).map((note, i) => {
          const whiteKeyIndex = notes.filter(n => !n.isBlack && notes.indexOf(n) < notes.indexOf(note)).length;
          const offset = whiteKeyIndex * (100 / 8) - 2.5;
          
          return (
            <button
              key={note.name + i + note.offset}
              onPointerDown={(e) => { 
                e.preventDefault();
                if (params?.arpEnabled) {
                  setHeldNotes(prev => new Set([...prev, note.offset]));
                } else {
                  playNote(note.name + note.offset, note.offset);
                }
              }}
              onPointerUp={(e) => { 
                e.preventDefault();
                if (params?.arpEnabled) {
                  setHeldNotes(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(note.offset);
                    return newSet;
                  });
                } else {
                  stopNote(note.name + note.offset);
                }
              }}
              onPointerLeave={(e) => { 
                if (e.buttons === 1) {
                  e.preventDefault();
                  if (params?.arpEnabled) {
                    setHeldNotes(prev => {
                      const newSet = new Set(prev);
                      newSet.delete(note.offset);
                      return newSet;
                    });
                  } else {
                    stopNote(note.name + note.offset);
                  }
                }
              }}
              style={{
                position: 'absolute',
                left: `${offset}%`,
                width: '5%',
                height: '60%',
                background: activeNotes.has(note.name + note.offset)
                  ? (dark ? '#333' : '#555') 
                  : (dark ? '#000' : '#000'),
                border: `1px solid ${dark ? '#fff' : '#fff'}`,
                cursor: 'pointer',
                zIndex: 10,
                touchAction: 'none'
              }}
            />
          );
        })}
      </div>
      
      {/* Help text */}
      <div style={{
        marginTop: '12px',
        fontSize: '7px',
        fontWeight: '500',
        letterSpacing: '0.05em',
        color: dark ? '#666' : '#999',
        textAlign: 'center',
        lineHeight: '1.4'
      }}>
        {params.routingEnabled && params.routingTarget ? (
          <>ROUTING MODE: Playing drum sounds melodically • Adjust GridSeq mixer for tone</>
        ) : params.arpEnabled ? (
          <>ARP MODE: Hold keys to arpeggiate • {(params.arpMode || 'up').toUpperCase()} pattern at {(params.arpRate || 8) === 4 ? '1/4' : (params.arpRate || 8) === 8 ? '1/8' : (params.arpRate || 8) === 16 ? '1/16' : '1/32'} notes</>
        ) : (
          <>QWERTY KEYS: A-K = Notes • ARP: Automatic patterns • ROUTING: Melodic drums • PANIC stops all</>
        )}
      </div>
    </div>
  );
}

// Minimal GridSeq - 5 tracks with 10 presets each
function GridSeqMinimal({ dark, params, audioContext, masterGain, onParamChange }) {
  const [currentStep, setCurrentStep] = useState(-1);
  const intervalRef = React.useRef(null);
  const stepRef = React.useRef(0);
  const paramsRef = React.useRef(params); // Track current params without recreating interval

  const isPlaying = params?.isPlaying || false;

  // Update params ref whenever they change (doesn't trigger interval recreation)
  React.useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  const presetLibrary = {
    kick: [
      { name: '808', freq: 100, decay: 0.8, type: 'sine' },          // Trap/Hip-hop
      { name: 'GARAGE', freq: 160, decay: 0.35, type: 'sine' },      // UK Garage
      { name: 'TECHNO', freq: 180, decay: 0.25, type: 'sine' },      // Techno
      { name: 'SUB', freq: 70, decay: 1.0, type: 'sine' },           // Dubstep
      { name: 'HOUSE', freq: 140, decay: 0.45, type: 'sine' },       // House
      { name: 'JUNGLE', freq: 170, decay: 0.2, type: 'sine' },       // Jungle/DnB
      { name: 'HARD', freq: 200, decay: 0.3, type: 'square' },       // Hardstyle
      { name: 'BOUNCE', freq: 150, decay: 0.4, type: 'triangle' },   // Footwork
      { name: '909', freq: 130, decay: 0.5, type: 'sine' },          // Detroit
      { name: 'AFRO', freq: 120, decay: 0.55, type: 'triangle' },    // Afrobeat
      { name: 'SALEM', freq: 85, decay: 0.9, type: 'square' },       // Witch house - distorted, heavy
      { name: 'LOFI', freq: 110, decay: 0.6, type: 'triangle' },     // Lo-fi degraded
      { name: 'WITCH', freq: 65, decay: 1.2, type: 'sine' },         // Deep sub witch house
      { name: 'DRAIN', freq: 180, decay: 0.35, type: 'square' },     // Draingang compressed
      { name: 'MECHA', freq: 160, decay: 0.28, type: 'square' },     // Mechatok hard
      { name: 'HYPER', freq: 190, decay: 0.32, type: 'square' }      // Hyperpop distorted
    ],
    snare: [
      { name: 'TRAP', freq: 350, decay: 0.12, type: 'square' },      // Trap
      { name: 'JUNGLE', freq: 280, decay: 0.08, type: 'square' },    // Jungle
      { name: 'CLAP', freq: 400, decay: 0.15, type: 'triangle' },    // House
      { name: 'GARAGE', freq: 320, decay: 0.1, type: 'square' },     // UK Garage  
      { name: 'DUB', freq: 220, decay: 0.25, type: 'triangle' },     // Dubstep
      { name: 'TECHNO', freq: 300, decay: 0.13, type: 'triangle' },  // Techno
      { name: 'JUKE', freq: 380, decay: 0.09, type: 'square' },      // Footwork
      { name: '808', freq: 260, decay: 0.18, type: 'triangle' },     // Classic
      { name: 'RETON', freq: 420, decay: 0.11, type: 'square' },     // Reggaeton
      { name: 'LIVE', freq: 200, decay: 0.2, type: 'sine' },         // Acoustic-like
      { name: 'CRACK', freq: 6500, decay: 0.06, type: 'square' },    // Vinyl texture
      { name: 'WITCH', freq: 240, decay: 0.35, type: 'square' },     // Reverby witch house
      { name: 'NOISE', freq: 5000, decay: 0.08, type: 'square' },    // White noise snare
      { name: 'PITCH', freq: 450, decay: 0.1, type: 'square' },      // Draingang pitched snare
      { name: 'METAL', freq: 1800, decay: 0.07, type: 'square' },    // Mechatok metallic
      { name: 'GLITCH', freq: 3200, decay: 0.05, type: 'square' }    // Hyperpop glitchy
    ],
    hat: [
      { name: 'TRAP', freq: 2800, decay: 0.04, type: 'square' },     // Trap - traditional crisp
      { name: 'JUNGLE', freq: 3200, decay: 0.03, type: 'square' },   // Jungle - fast attack
      { name: 'OPEN', freq: 2500, decay: 0.2, type: 'square' },      // House open - warm long
      { name: 'GARAGE', freq: 2900, decay: 0.06, type: 'square' },   // UK Garage - classic
      { name: 'TECHNO', freq: 3300, decay: 0.035, type: 'square' },  // Techno - bright
      { name: 'DARK', freq: 2200, decay: 0.08, type: 'square' },     // Dubstep - deep dark
      { name: 'JUKE', freq: 3400, decay: 0.05, type: 'square' },     // Footwork - fast
      { name: '808', freq: 2400, decay: 0.05, type: 'square' },      // Classic - vintage
      { name: 'TRANCE', freq: 3000, decay: 0.15, type: 'sawtooth' }, // Trance - cutting
      { name: 'JERSEY', freq: 3500, decay: 0.04, type: 'square' },   // Jersey Club - bright
      { name: 'METAL', freq: 3800, decay: 0.025, type: 'square' },   // Draingang - metallic but usable
      { name: 'GLITCH', freq: 4000, decay: 0.02, type: 'square' },   // Mechatok - glitchy high
      { name: 'CRYSTAL', freq: 3600, decay: 0.06, type: 'triangle' } // Ethereal - shimmery
    ],
    perc: [
      { name: 'CONGA', freq: 220, decay: 0.3, type: 'sine' },        // Latin
      { name: 'TALK', freq: 250, decay: 0.25, type: 'triangle' },    // Afrobeat
      { name: 'DJEMBE', freq: 180, decay: 0.35, type: 'sine' },      // Tribal
      { name: 'TIMBAL', freq: 350, decay: 0.2, type: 'triangle' },   // Reggaeton
      { name: 'RIM', freq: 800, decay: 0.08, type: 'square' },       // Trap
      { name: 'METAL', freq: 1200, decay: 0.15, type: 'square' },    // Techno
      { name: 'WHISTLE', freq: 2500, decay: 0.12, type: 'sine' },    // Baile Funk
      { name: 'CLICK', freq: 1800, decay: 0.05, type: 'square' },    // Jersey Club
      { name: 'GRIME', freq: 400, decay: 0.1, type: 'square' },      // Grime
      { name: 'BELL', freq: 900, decay: 0.4, type: 'sine' },         // Dancehall
      { name: 'SHAKER', freq: 6000, decay: 0.06, type: 'square' },   // Draingang shaker
      { name: 'STICK', freq: 1500, decay: 0.04, type: 'square' },    // Mechatok stick
      { name: 'CHAIN', freq: 3500, decay: 0.08, type: 'triangle' }   // Hyperpop chain
    ],
    fx: [
      { name: 'HORN', freq: 600, decay: 0.2, type: 'sawtooth' },     // Trap airhorn
      { name: 'WOBBLE', freq: 140, decay: 0.3, type: 'square' },     // Dubstep
      { name: 'SQUEAK', freq: 2800, decay: 0.15, type: 'sine' },     // Jersey Club
      { name: 'REWIND', freq: 1200, decay: 0.25, type: 'sawtooth' }, // Grime
      { name: 'WHISTLE', freq: 3500, decay: 0.18, type: 'sine' },    // Baile Funk
      { name: 'VOCAL', freq: 800, decay: 0.1, type: 'triangle' },    // Footwork
      { name: 'REESE', freq: 180, decay: 0.4, type: 'sawtooth' },    // UK Garage
      { name: 'LASER', freq: 2000, decay: 0.2, type: 'sawtooth' },   // Techno
      { name: 'RISER', freq: 1500, decay: 0.35, type: 'triangle' },  // Trance
      { name: 'SCREECH', freq: 500, decay: 0.15, type: 'square' },   // Hardstyle
      { name: 'VINYL', freq: 4200, decay: 0.08, type: 'square' },    // Vinyl crackle/noise
      { name: 'DRONE', freq: 55, decay: 2.0, type: 'sine' },         // Dark ambient drone
      { name: 'PAD', freq: 220, decay: 1.5, type: 'triangle' },      // Shlohmo ambient pad
      { name: 'CLAP', freq: 1400, decay: 0.12, type: 'square' },     // Trap clap - bright
      { name: 'CLAP2', freq: 1000, decay: 0.15, type: 'triangle' },  // Witch house clap - dark
      { name: 'SNAP', freq: 2200, decay: 0.08, type: 'square' },     // Hyperpop snap
      { name: 'CHROME', freq: 3000, decay: 0.1, type: 'sawtooth' },  // Draingang metallic perc
      { name: 'GLASS', freq: 4500, decay: 0.12, type: 'triangle' }   // Mechatok glass shatter
    ]
  };

  const trackTypes = [
    { name: 'KICK', type: 'kick' },
    { name: 'SNARE', type: 'snare' },
    { name: 'HAT', type: 'hat' },
    { name: 'PERC', type: 'perc' },
    { name: 'FX', type: 'fx' }
  ];

  const tracks = trackTypes.map((t, i) => ({
    ...t,
    preset: (params?.[`${t.type}Preset`] !== undefined) ? params[`${t.type}Preset`] : 0
  }));

  // Safety check - if params is not ready, don't render yet
  if (!params || !params.pattern) {
    return (
      <div style={{ width: '520px', padding: '40px', textAlign: 'center', fontSize: '10px', color: dark ? '#666' : '#999' }}>
        LOADING...
      </div>
    );
  }

  const playSound = (trackIndex) => {
    if (!audioContext) return;

    const currentParams = paramsRef.current;
    const track = tracks[trackIndex];
    const preset = presetLibrary[track.type][track.preset];
    const now = audioContext.currentTime;

    // Get mixer settings from paramsRef
    const mixerTrack = currentParams?.tracks?.[trackIndex] || {
      gain: 1.0, volume: 0.8, pan: 0, drive: 0,
      highpass: 0, eqLow: 0, eqMid: 0, eqHigh: 0,
      decay: 0.5, sweep: 0, contour: 0.5, shape: 0, muted: false
    };

    // Skip if track is muted
    if (mixerTrack.muted) return;
    
    // Skip if another track is soloed and this isn't it
    const soloedTrack = currentParams?.tracks?.findIndex(t => t.soloed);
    if (soloedTrack !== -1 && soloedTrack !== trackIndex) return;

    // Use mixer decay (0.01 to 10 seconds, 10 = infinite sustain)
    const actualDecay = mixerTrack.decay >= 9.9 ? 10 : mixerTrack.decay;

    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const driveGain = audioContext.createGain();
    const volumeGain = audioContext.createGain();
    const panner = audioContext.createStereoPanner();
    
    // High-pass filter
    let currentNode = gain;
    if (mixerTrack.highpass > 0) {
      const hpf = audioContext.createBiquadFilter();
      hpf.type = 'highpass';
      hpf.frequency.value = mixerTrack.highpass;
      gain.connect(hpf);
      currentNode = hpf;
    }

    // 3-band EQ
    if (mixerTrack.eqLow !== 0) {
      const lowShelf = audioContext.createBiquadFilter();
      lowShelf.type = 'lowshelf';
      lowShelf.frequency.value = 200;
      lowShelf.gain.value = mixerTrack.eqLow;
      currentNode.connect(lowShelf);
      currentNode = lowShelf;
    }

    if (mixerTrack.eqMid !== 0) {
      const midPeak = audioContext.createBiquadFilter();
      midPeak.type = 'peaking';
      midPeak.frequency.value = 1000;
      midPeak.Q.value = 1;
      midPeak.gain.value = mixerTrack.eqMid;
      currentNode.connect(midPeak);
      currentNode = midPeak;
    }

    if (mixerTrack.eqHigh !== 0) {
      const highShelf = audioContext.createBiquadFilter();
      highShelf.type = 'highshelf';
      highShelf.frequency.value = 4000;
      highShelf.gain.value = mixerTrack.eqHigh;
      currentNode.connect(highShelf);
      currentNode = highShelf;
    }

    currentNode.connect(driveGain);
    driveGain.connect(volumeGain);
    volumeGain.connect(panner);
    
    // Implement delay if enabled
    const finalDestination = masterGain || audioContext.destination;
    
    if (mixerTrack.delayTime > 0 && mixerTrack.delaySend > 0) {
      // Create delay line
      const delayNode = audioContext.createDelay(5.0); // Max 5 seconds
      delayNode.delayTime.value = mixerTrack.delayTime;
      
      // Create delay gain (wet signal)
      const delayGain = audioContext.createGain();
      delayGain.gain.value = mixerTrack.delaySend;
      
      // Create feedback if needed
      const feedbackGain = audioContext.createGain();
      feedbackGain.gain.value = mixerTrack.delayFeedback;
      
      // Route: panner -> delay -> delayGain -> destination
      //        panner -> destination (dry)
      //        delay -> feedback -> delay (feedback loop)
      panner.connect(delayNode);
      delayNode.connect(delayGain);
      delayGain.connect(finalDestination);
      
      // Feedback loop
      if (mixerTrack.delayFeedback > 0) {
        delayNode.connect(feedbackGain);
        feedbackGain.connect(delayNode);
      }
      
      // Dry signal
      panner.connect(finalDestination);
    } else {
      // No delay, just route directly
      panner.connect(finalDestination);
    }

    // Apply shape to oscillator type
    let oscType = preset.type;
    if (mixerTrack.shape > 0.66) oscType = 'square';
    else if (mixerTrack.shape > 0.33) oscType = 'sawtooth';
    else oscType = preset.type;
    
    osc.type = oscType;
    osc.connect(gain);

    // Frequency with sweep
    const baseFreq = preset.freq;
    const sweepAmount = mixerTrack.sweep * 2000; // Up to 2kHz sweep
    
    if (track.type === 'kick') {
      osc.frequency.setValueAtTime(baseFreq + sweepAmount, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(50, baseFreq * 0.3), now + 0.1);
    } else {
      osc.frequency.setValueAtTime(baseFreq + sweepAmount, now);
      if (mixerTrack.sweep !== 0) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(50, baseFreq), now + actualDecay * 0.5);
      }
    }

    // Gain envelope with contour
    const baseGain = 0.3 * mixerTrack.gain * mixerTrack.volume;
    const driveAmount = 1 + (mixerTrack.drive * 2);
    
    // Contour affects envelope curve (0 = linear, 1 = exponential)
    if (mixerTrack.contour > 0.5) {
      gain.gain.setValueAtTime(baseGain, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + actualDecay);
    } else {
      gain.gain.setValueAtTime(baseGain, now);
      gain.gain.linearRampToValueAtTime(0, now + actualDecay);
    }
    
    driveGain.gain.value = driveAmount;
    volumeGain.gain.value = 1;
    panner.pan.value = mixerTrack.pan;

    osc.start(now);
    osc.stop(now + actualDecay);
  };

  const toggleCell = (trackIndex, step) => {
    if (!params) return;
    
    const newPattern = params.pattern.map((row, i) =>
      i === trackIndex ? row.map((cell, j) => (j === step ? !cell : cell)) : row
    );
    onParamChange('pattern', newPattern);
    
    // ALWAYS trigger sound when clicking, regardless of on/off state
    playSound(trackIndex);
  };

  const changePreset = (trackIndex, direction) => {
    const track = tracks[trackIndex];
    const currentPreset = track.preset;
    const maxPresets = presetLibrary[track.type].length;
    const newPreset = direction === 'next' 
      ? (currentPreset + 1) % maxPresets
      : (currentPreset - 1 + maxPresets) % maxPresets;
    
    onParamChange(`${track.type}Preset`, newPreset);
    playSound(trackIndex);
  };

  // Play loop - only recreates for BPM/play state/swing changes, NOT mixer changes
  React.useEffect(() => {
    if (isPlaying) {
      if (!intervalRef.current) {
        stepRef.current = 0; // Only reset to 0 when first starting
      }
      
      const baseStepTime = (60 / (params?.bpm || 120)) * 250;
      const swing = (paramsRef.current?.swing || 0) / 100; // 0 to 1

      const scheduleNextStep = () => {
        setCurrentStep(stepRef.current);
        
        // Read pattern from ref for latest values
        const currentPattern = paramsRef.current?.pattern || [];
        const stepProbabilities = paramsRef.current?.stepProbabilities || [];
        currentPattern.forEach((row, trackIndex) => {
          if (row[stepRef.current]) {
            // Check probability (default 100% if not set)
            const probability = stepProbabilities[trackIndex]?.[stepRef.current] || 100;
            if (Math.random() * 100 < probability) {
              playSound(trackIndex);
            }
          }
        });

        stepRef.current = (stepRef.current + 1) % 16;
        
        // Apply swing to every other step
        const isOffBeat = stepRef.current % 2 === 1;
        const swingAmount = isOffBeat ? swing * baseStepTime * 0.5 : 0;
        const nextStepTime = baseStepTime + swingAmount;
        
        intervalRef.current = setTimeout(scheduleNextStep, nextStepTime);
      };
      
      scheduleNextStep();
    } else {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
        intervalRef.current = null;
      }
      setCurrentStep(-1);
      stepRef.current = 0;
    }

    return () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }
    };
  }, [isPlaying, params?.bpm, params?.swing]); // Recreate for play state, BPM, and swing changes

  return (
    <div style={{ width: '580px' }}>
      {/* Pattern Management Bar */}
      <div style={{ 
        display: 'flex', 
        gap: '6px', 
        marginBottom: '8px',
        flexWrap: 'wrap',
        padding: '8px',
        background: dark ? '#0a0a0a' : '#fafafa',
        border: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`
      }}>
        {/* Pattern Slots (16) */}
        <div style={{ display: 'flex', gap: '2px', flex: 1 }}>
          {Array(8).fill(0).map((_, i) => {
            const slots = params?.patternSlots || Array(16).fill(null);
            const hasPattern = slots[i] !== null && slots[i] !== undefined;
            return (
              <button
                key={i}
                onClick={() => {
                  console.log('Pattern slot clicked:', i, 'hasPattern:', hasPattern);
                  if (hasPattern) {
                    // Load pattern
                    console.log('Loading pattern from slot', i);
                    onParamChange('pattern', slots[i]);
                  } else {
                    // Save current pattern
                    console.log('Saving pattern to slot', i);
                    const newSlots = [...slots];
                    newSlots[i] = JSON.parse(JSON.stringify(params.pattern)); // Deep clone
                    onParamChange('patternSlots', newSlots);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  // Right-click to clear slot
                  console.log('Clearing slot', i);
                  const newSlots = [...slots];
                  newSlots[i] = null;
                  onParamChange('patternSlots', newSlots);
                }}
                style={{
                  flex: 1,
                  fontSize: '8px',
                  fontWeight: '600',
                  padding: '6px 2px',
                  background: hasPattern ? (dark ? '#4ade80' : '#22c55e') : 'none',
                  border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                  cursor: 'pointer',
                  color: hasPattern ? '#000' : (dark ? '#fff' : '#000')
                }}
                title={hasPattern ? 'Click: Load | Right-click: Clear' : 'Click to save current pattern'}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
        
        {/* Copy/Paste/Randomize */}
        <button
          onClick={() => onParamChange('clipboard', params.pattern)}
          style={{
            fontSize: '8px',
            fontWeight: '500',
            padding: '6px 10px',
            background: 'none',
            border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
            cursor: 'pointer',
            color: dark ? '#fff' : '#000'
          }}
          title="Copy pattern"
        >
          CPY
        </button>
        <button
          onClick={() => {
            if (params.clipboard) {
              onParamChange('pattern', params.clipboard);
            }
          }}
          style={{
            fontSize: '8px',
            fontWeight: '500',
            padding: '6px 10px',
            background: params.clipboard ? (dark ? '#fff' : '#000') : 'none',
            border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
            cursor: 'pointer',
            color: params.clipboard ? (dark ? '#000' : '#fff') : (dark ? '#666' : '#999')
          }}
          title="Paste pattern"
        >
          PST
        </button>
        <button
          onClick={() => {
            // Randomize with 30% density
            const newPattern = params.pattern.map(row => 
              row.map(() => Math.random() < 0.3)
            );
            onParamChange('pattern', newPattern);
          }}
          style={{
            fontSize: '8px',
            fontWeight: '500',
            padding: '6px 10px',
            background: 'none',
            border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
            cursor: 'pointer',
            color: dark ? '#fff' : '#000'
          }}
          title="Randomize pattern"
        >
          RND
        </button>
        <button
          onClick={() => {
            onParamChange('pattern', Array(5).fill(null).map(() => Array(16).fill(false)));
          }}
          style={{
            fontSize: '8px',
            fontWeight: '500',
            padding: '6px 10px',
            background: 'none',
            border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
            cursor: 'pointer',
            color: dark ? '#fff' : '#000'
          }}
          title="Clear pattern"
        >
          CLR
        </button>
        <button
          onClick={() => {
            // Generate fill pattern (every other step + some random variations)
            const fillPattern = params.pattern.map((row, trackIdx) => 
              row.map((cell, stepIdx) => {
                if (trackIdx === 0) return stepIdx % 2 === 0; // Kick on downbeats
                if (trackIdx === 1) return stepIdx === 4 || stepIdx === 12; // Snare on backbeats
                if (trackIdx === 2) return stepIdx % 2 === 1; // Hats on offbeats
                return Math.random() < 0.4; // Perc/FX randomly
              })
            );
            onParamChange('pattern', fillPattern);
          }}
          style={{
            fontSize: '8px',
            fontWeight: '500',
            padding: '6px 10px',
            background: dark ? '#f59e0b' : '#fbbf24',
            border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
            cursor: 'pointer',
            color: '#000'
          }}
          title="Generate fill pattern"
        >
          FILL
        </button>
        
        {/* Swing Control */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: '100px' }}>
          <div style={{ fontSize: '8px', fontWeight: '500', color: dark ? '#999' : '#666' }}>SWING</div>
          <input
            type="range"
            min="0"
            max="100"
            value={params.swing || 0}
            onChange={(e) => onParamChange('swing', parseInt(e.target.value))}
            style={{ flex: 1, height: '6px' }}
          />
          <div style={{ fontSize: '8px', fontFamily: 'monospace', fontWeight: '600', color: dark ? '#999' : '#666', width: '25px' }}>
            {params.swing || 0}%
          </div>
        </div>
        
        {/* Pattern Library */}
        <button
          onClick={() => {
            // Export current pattern to library
            const library = JSON.parse(localStorage.getItem('carlisle_pattern_library') || '[]');
            const patternName = prompt('Name this pattern:', `Pattern ${library.length + 1}`);
            if (patternName) {
              library.push({
                name: patternName,
                pattern: params.pattern,
                probabilities: params.stepProbabilities,
                timestamp: Date.now()
              });
              localStorage.setItem('carlisle_pattern_library', JSON.stringify(library));
              alert('Pattern saved to library!');
            }
          }}
          style={{
            fontSize: '8px',
            fontWeight: '500',
            padding: '6px 10px',
            background: dark ? '#3b82f6' : '#60a5fa',
            border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
            cursor: 'pointer',
            color: dark ? '#fff' : '#000'
          }}
          title="Save to pattern library"
        >
          💾 SAVE
        </button>
        <button
          onClick={() => {
            // Show pattern library
            const library = JSON.parse(localStorage.getItem('carlisle_pattern_library') || '[]');
            if (library.length === 0) {
              alert('Pattern library is empty. Save some patterns first!');
              return;
            }
            
            const choice = prompt(
              `Pattern Library:\n\n` +
              library.map((p, i) => `${i + 1}. ${p.name} (${new Date(p.timestamp).toLocaleDateString()})`).join('\n') +
              `\n\nEnter number to load (or 0 to download all as JSON):`,
              '1'
            );
            
            if (choice === '0') {
              // Download all patterns as JSON
              const blob = new Blob([JSON.stringify(library, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `carlisle-patterns-${Date.now()}.json`;
              a.click();
              URL.revokeObjectURL(url);
            } else {
              const index = parseInt(choice) - 1;
              if (index >= 0 && index < library.length) {
                onParamChange('pattern', library[index].pattern);
                if (library[index].probabilities) {
                  onParamChange('stepProbabilities', library[index].probabilities);
                }
              }
            }
          }}
          style={{
            fontSize: '8px',
            fontWeight: '500',
            padding: '6px 10px',
            background: dark ? '#8b5cf6' : '#a78bfa',
            border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
            cursor: 'pointer',
            color: dark ? '#fff' : '#000'
          }}
          title="Load from pattern library or export"
        >
          📂 LOAD
        </button>
      </div>

      {/* Track Info */}
      <div style={{ 
        fontSize: '8px',
        fontWeight: '500',
        letterSpacing: '0.08em', 
        color: dark ? '#999' : '#666',
        marginBottom: '8px',
        textAlign: 'center'
      }}>
        SELECTED: {tracks[params?.selectedTrack || 0].name}
      </div>

      {/* Ultra compact grid */}
      <div>
        {tracks.map((track, trackIndex) => (
          <div key={trackIndex} style={{ display: 'flex', alignItems: 'center', marginBottom: '3px' }}>
            {/* Track name + preset selector */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '2px',
              width: '140px',
              marginRight: '4px'
            }}>
              {/* Mute button */}
              <button
                onClick={() => {
                  const newTracks = [...params.tracks];
                  newTracks[trackIndex] = {
                    ...newTracks[trackIndex],
                    muted: !newTracks[trackIndex].muted
                  };
                  onParamChange('tracks', newTracks);
                }}
                style={{
                  fontSize: '7px',
                  padding: '2px 4px',
                  background: params.tracks[trackIndex].muted ? (dark ? '#666' : '#999') : 'none',
                  border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                  cursor: 'pointer',
                  color: params.tracks[trackIndex].muted ? (dark ? '#000' : '#fff') : (dark ? '#fff' : '#000')
                }}
                title={params.tracks[trackIndex].muted ? 'Unmute' : 'Mute'}
              >
                M
              </button>
              {/* Solo button */}
              <button
                onClick={() => {
                  const newTracks = [...params.tracks];
                  newTracks[trackIndex] = {
                    ...newTracks[trackIndex],
                    soloed: !newTracks[trackIndex].soloed
                  };
                  onParamChange('tracks', newTracks);
                }}
                style={{
                  fontSize: '7px',
                  padding: '2px 4px',
                  background: params.tracks[trackIndex].soloed ? (dark ? '#4ade80' : '#22c55e') : 'none',
                  border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                  cursor: 'pointer',
                  color: params.tracks[trackIndex].soloed ? '#000' : (dark ? '#fff' : '#000')
                }}
                title={params.tracks[trackIndex].soloed ? 'Unsolo' : 'Solo'}
              >
                S
              </button>
              <button
                onClick={() => changePreset(trackIndex, 'prev')}
                style={{
                  fontSize: '8px',
                  padding: '2px 4px',
                  background: 'none',
                  border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                  cursor: 'pointer',
                  color: dark ? '#fff' : '#000'
                }}
              >
                ←
              </button>
              <button
                onClick={() => onParamChange('selectedTrack', trackIndex)}
                style={{
                  flex: 1,
                  fontSize: '8px', fontWeight: '500',
                  letterSpacing: '0.05em',
                  color: params?.selectedTrack === trackIndex ? (dark ? '#000' : '#fff') : (dark ? '#999' : '#666'),
                  background: params?.selectedTrack === trackIndex ? (dark ? '#fff' : '#000') : 'none',
                  border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                  cursor: 'pointer',
                  padding: '4px 2px',
                  textAlign: 'center',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ fontWeight: '500', marginBottom: '1px' }}>{track.name}</div>
                <div style={{ fontSize: '7px', fontWeight: '500' }}>{presetLibrary[track.type][track.preset].name}</div>
              </button>
              <button
                onClick={() => changePreset(trackIndex, 'next')}
                style={{
                  fontSize: '8px',
                  padding: '2px 4px',
                  background: 'none',
                  border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                  cursor: 'pointer',
                  color: dark ? '#fff' : '#000'
                }}
              >
                →
              </button>
            </div>

            {/* Step grid - ultra compact */}
            {Array(16).fill(0).map((_, step) => {
              const isActive = params?.pattern?.[trackIndex]?.[step];
              const probability = params?.stepProbabilities?.[trackIndex]?.[step] || 100;
              const opacity = probability / 100;
              
              return (
                <button
                  key={step}
                  onClick={(e) => {
                    if (e.shiftKey) {
                      // Shift-click: cycle probability 100 -> 75 -> 50 -> 25 -> 100
                      const newProb = probability === 100 ? 75 : probability === 75 ? 50 : probability === 50 ? 25 : 100;
                      const newProbs = (params.stepProbabilities || Array(5).fill(null).map(() => Array(16).fill(100))).map((row, i) =>
                        i === trackIndex ? row.map((p, j) => (j === step ? newProb : p)) : row
                      );
                      onParamChange('stepProbabilities', newProbs);
                    } else {
                      toggleCell(trackIndex, step);
                    }
                  }}
                  style={{
                    width: '18px',
                    height: '18px',
                    background: isActive 
                      ? (dark ? '#fff' : '#000')
                      : 'none',
                    opacity: isActive ? opacity : 1,
                    border: `1px solid ${
                      currentStep === step 
                        ? (dark ? '#666' : '#999')
                        : (dark ? '#1a1a1a' : '#f5f5f5')
                    }`,
                    cursor: 'pointer',
                    marginRight: '1px',
                    padding: 0,
                    position: 'relative'
                  }}
                  title={`Probability: ${probability}% (Shift+Click to adjust)`}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div style={{
        marginTop: '8px',
        fontSize: '7px',
        fontWeight: '500',
        letterSpacing: '0.05em',
        color: dark ? '#666' : '#999',
        textAlign: 'center',
        lineHeight: '1.4'
      }}>
        M=MUTE S=SOLO • SHIFT+CLICK STEP=PROBABILITY • 1-8=QUICK SLOTS • RIGHT-CLICK SLOT=CLEAR
        <br />
        💾=SAVE TO LIBRARY • 📂=LOAD/EXPORT • CPY/PST/RND/CLR/FILL • SWING=GROOVE
      </div>
    </div>
  );
}

// Drag Knob Component - click and drag up/down to adjust
function DragKnob({ label, value, min, max, step, onChange, unit = '', dark }) {
  const [isDragging, setIsDragging] = React.useState(false);
  const [startY, setStartY] = React.useState(0);
  const [startValue, setStartValue] = React.useState(0);

  // Safety check for undefined value
  const safeValue = value !== undefined ? value : min;

  const handleMouseDown = (e) => {
    setIsDragging(true);
    setStartY(e.clientY);
    setStartValue(safeValue);
    e.preventDefault();
  };

  React.useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      const deltaY = startY - e.clientY; // Inverted: drag up = increase
      const range = max - min;
      const sensitivity = range / 100; // 100px = full range
      const newValue = Math.max(min, Math.min(max, startValue + (deltaY * sensitivity)));
      
      // Round to step
      const steppedValue = Math.round(newValue / step) * step;
      onChange(steppedValue);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, startY, startValue, min, max, step, onChange]);

  // Calculate rotation for visual knob (0-270 degrees)
  const percentage = ((safeValue - min) / (max - min));
  const rotation = -135 + (percentage * 270);

  return (
    <div style={{ marginBottom: '8px', textAlign: 'center' }}>
      <div style={{
        fontSize: '8px', fontWeight: '500',
        letterSpacing: '0.1em',
        color: dark ? '#666' : '#999',
        marginBottom: '4px'
      }}>
        {label}
      </div>
      
      {/* Visual Knob */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          width: '40px',
          height: '40px',
          margin: '0 auto 4px',
          borderRadius: '50%',
          background: dark ? '#1a1a1a' : '#f5f5f5',
          border: `2px solid ${isDragging ? (dark ? '#fff' : '#000') : (dark ? '#333' : '#e5e5e5')}`,
          position: 'relative',
          cursor: 'ns-resize',
          transition: isDragging ? 'none' : 'border-color 0.2s',
          userSelect: 'none'
        }}
      >
        {/* Knob indicator */}
        <div style={{
          position: 'absolute',
          top: '4px',
          left: '50%',
          width: '2px',
          height: '14px',
          background: dark ? '#fff' : '#000',
          transformOrigin: 'bottom center',
          transform: `translateX(-50%) rotate(${rotation}deg)`,
          transition: isDragging ? 'none' : 'transform 0.1s'
        }} />
      </div>
      
      {/* Value display */}
      <div style={{
        fontSize: '7px',
        letterSpacing: '0.05em',
        color: dark ? '#999' : '#666',
        fontFamily: 'monospace'
      }}>
        {step >= 1 ? safeValue.toFixed(0) : safeValue.toFixed(2)}{unit}
      </div>
    </div>
  );
}

// Unified Control Board - shows different controls based on focused instrument
function UnifiedControlBoard({ dark, params, instrumentType, onParamChange }) {
  if (!params || !instrumentType) {
    return (
      <div style={{ width: '600px', fontSize: '10px', color: dark ? '#666' : '#999', textAlign: 'center', padding: '60px 20px' }}>
        SELECT AN INSTRUMENT TO CONTROL
      </div>
    );
  }

  if (instrumentType === 'pulsewave') {
    return <PulseWaveControls dark={dark} params={params} onParamChange={onParamChange} />;
  }

  if (instrumentType === 'gridseq') {
    return <GridSeqMixerControls dark={dark} params={params} onParamChange={onParamChange} />;
  }

  return null;
}

// GridSeq Professional Mixing Console - Ultra Compact
function GridSeqMixerControls({ dark, params, onParamChange }) {
  if (!params || !params.tracks) return null;

  const selectedTrackIndex = params.selectedTrack || 0;
  const selectedTrack = params.tracks[selectedTrackIndex];

  const updateTrackParam = (paramName, value) => {
    const newTracks = [...params.tracks];
    newTracks[selectedTrackIndex] = {
      ...newTracks[selectedTrackIndex],
      [paramName]: value
    };
    onParamChange('tracks', newTracks);
  };

  return (
    <div style={{ width: '550px' }}>
      {/* Track Header */}
      <div style={{
        marginBottom: '12px',
        padding: '8px',
        background: dark ? '#0a0a0a' : '#fafafa',
        border: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
        textAlign: 'center'
      }}>
        <div style={{
          fontSize: '9px',
          letterSpacing: '0.15em',
          color: dark ? '#fff' : '#000',
          fontWeight: '500'
        }}>
          {selectedTrack.name}
        </div>
      </div>

      {/* 5-Column Ultra Compact Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
        
        {/* COLUMN 1: DYNAMICS */}
        <div>
          <div style={{
            fontSize: '8px', fontWeight: '500',
            letterSpacing: '0.12em',
            color: dark ? '#999' : '#666',
            marginBottom: '8px',
            paddingBottom: '3px',
            borderBottom: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
            textAlign: 'center'
          }}>
            DYN
          </div>
          
          <DragKnob dark={dark} label="GAIN" value={selectedTrack.gain} min={0} max={2} step={0.1} onChange={(v) => updateTrackParam('gain', v)} unit="x" />
          <DragKnob dark={dark} label="VOL" value={selectedTrack.volume} min={0} max={1} step={0.01} onChange={(v) => updateTrackParam('volume', v)} />
          <DragKnob dark={dark} label="PAN" value={selectedTrack.pan} min={-1} max={1} step={0.01} onChange={(v) => updateTrackParam('pan', v)} />
        </div>

        {/* COLUMN 2: SYNTH */}
        <div>
          <div style={{
            fontSize: '8px', fontWeight: '500',
            letterSpacing: '0.12em',
            color: dark ? '#999' : '#666',
            marginBottom: '8px',
            paddingBottom: '3px',
            borderBottom: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
            textAlign: 'center'
          }}>
            SYNTH
          </div>
          
          <DragKnob dark={dark} label="DECAY" value={selectedTrack.decay} min={0.01} max={10} step={0.01} onChange={(v) => updateTrackParam('decay', v)} unit="s" />
          <DragKnob dark={dark} label="SWEEP" value={selectedTrack.sweep} min={-1} max={1} step={0.01} onChange={(v) => updateTrackParam('sweep', v)} />
          <DragKnob dark={dark} label="SHAPE" value={selectedTrack.shape} min={0} max={1} step={0.01} onChange={(v) => updateTrackParam('shape', v)} />
          <DragKnob dark={dark} label="CONTR" value={selectedTrack.contour} min={0} max={1} step={0.01} onChange={(v) => updateTrackParam('contour', v)} />
        </div>

        {/* COLUMN 3: EQ */}
        <div>
          <div style={{
            fontSize: '8px', fontWeight: '500',
            letterSpacing: '0.12em',
            color: dark ? '#999' : '#666',
            marginBottom: '8px',
            paddingBottom: '3px',
            borderBottom: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
            textAlign: 'center'
          }}>
            EQ
          </div>
          
          <DragKnob dark={dark} label="HPF" value={selectedTrack.highpass} min={0} max={500} step={10} onChange={(v) => updateTrackParam('highpass', v)} unit="Hz" />
          <DragKnob dark={dark} label="LOW" value={selectedTrack.eqLow} min={-12} max={12} step={0.5} onChange={(v) => updateTrackParam('eqLow', v)} unit="dB" />
          <DragKnob dark={dark} label="MID" value={selectedTrack.eqMid} min={-12} max={12} step={0.5} onChange={(v) => updateTrackParam('eqMid', v)} unit="dB" />
          <DragKnob dark={dark} label="HIGH" value={selectedTrack.eqHigh} min={-12} max={12} step={0.5} onChange={(v) => updateTrackParam('eqHigh', v)} unit="dB" />
        </div>

        {/* COLUMN 4: FX */}
        <div>
          <div style={{
            fontSize: '8px', fontWeight: '500',
            letterSpacing: '0.12em',
            color: dark ? '#999' : '#666',
            marginBottom: '8px',
            paddingBottom: '3px',
            borderBottom: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
            textAlign: 'center'
          }}>
            FX
          </div>
          
          <DragKnob dark={dark} label="REVERB" value={selectedTrack.reverbDecay} min={0} max={1} step={0.01} onChange={(v) => updateTrackParam('reverbDecay', v)} />
          <DragKnob dark={dark} label="DELAY" value={selectedTrack.delayTime} min={0} max={1} step={0.01} onChange={(v) => updateTrackParam('delayTime', v)} unit="s" />
          <DragKnob dark={dark} label="FDBK" value={selectedTrack.delayFeedback} min={0} max={0.9} step={0.01} onChange={(v) => updateTrackParam('delayFeedback', v)} />
          <DragKnob dark={dark} label="SEND" value={selectedTrack.delaySend} min={0} max={1} step={0.01} onChange={(v) => updateTrackParam('delaySend', v)} />
        </div>

        {/* COLUMN 5: LFO + MOD */}
        <div>
          <div style={{
            fontSize: '8px', fontWeight: '500',
            letterSpacing: '0.12em',
            color: dark ? '#999' : '#666',
            marginBottom: '8px',
            paddingBottom: '3px',
            borderBottom: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
            textAlign: 'center'
          }}>
            LFO
          </div>
          
          <DragKnob dark={dark} label="RATE" value={selectedTrack.lfoRate} min={0.1} max={20} step={0.1} onChange={(v) => updateTrackParam('lfoRate', v)} unit="Hz" />
          <DragKnob dark={dark} label="DEPTH" value={selectedTrack.lfoDepth} min={0} max={1} step={0.01} onChange={(v) => updateTrackParam('lfoDepth', v)} />
          <DragKnob dark={dark} label="CHORUS" value={selectedTrack.chorusDepth} min={0} max={1} step={0.01} onChange={(v) => updateTrackParam('chorusDepth', v)} />
          <DragKnob dark={dark} label="DRIVE" value={selectedTrack.drive} min={0} max={1} step={0.01} onChange={(v) => updateTrackParam('drive', v)} />
        </div>
      </div>

      {/* Footer */}
      <div style={{
        marginTop: '10px',
        fontSize: '7px', fontWeight: '500',
        letterSpacing: '0.05em',
        color: dark ? '#666' : '#999',
        textAlign: 'center'
      }}>
        DRAG KNOBS UP/DOWN • DECAY 10s = INFINITE SUSTAIN
      </div>
    </div>
  );
}

// PulseWave unified controls - Ultra Compact
function PulseWaveControls({ dark, params, onParamChange }) {
  return (
    <div style={{ width: '550px' }}>
      {/* Header */}
      <div style={{
        marginBottom: '12px',
        padding: '8px',
        background: dark ? '#0a0a0a' : '#fafafa',
        border: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
        textAlign: 'center'
      }}>
        <div style={{
          fontSize: '9px',
          letterSpacing: '0.15em',
          color: dark ? '#fff' : '#000',
          fontWeight: '500'
        }}>
          PULSEWAVE
        </div>
      </div>

      {/* 5-Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
        
        {/* COLUMN 1: OSC */}
        <div>
          <div style={{
            fontSize: '8px', fontWeight: '500',
            letterSpacing: '0.12em',
            color: dark ? '#999' : '#666',
            marginBottom: '8px',
            paddingBottom: '3px',
            borderBottom: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
            textAlign: 'center'
          }}>
            OSC
          </div>
          
          {/* Wave type selector */}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '7px', fontWeight: '500', color: dark ? '#666' : '#999', marginBottom: '4px', textAlign: 'center' }}>WAVE</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px' }}>
              {['sine', 'square', 'saw', 'tri'].map(type => (
                <button
                  key={type}
                  onClick={() => onParamChange('oscType', type === 'saw' ? 'sawtooth' : type === 'tri' ? 'triangle' : type)}
                  style={{
                    fontSize: '7px', fontWeight: '500',
                    padding: '4px 2px',
                    background: params.oscType === (type === 'saw' ? 'sawtooth' : type === 'tri' ? 'triangle' : type) ? (dark ? '#fff' : '#000') : 'none',
                    border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                    cursor: 'pointer',
                    color: params.oscType === (type === 'saw' ? 'sawtooth' : type === 'tri' ? 'triangle' : type) ? (dark ? '#000' : '#fff') : (dark ? '#fff' : '#000')
                  }}
                >
                  {type.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <DragKnob dark={dark} label="SWEEP" value={params.sweep || 0} min={-1} max={1} step={0.01} onChange={(v) => onParamChange('sweep', v)} />
          <DragKnob dark={dark} label="SHAPE" value={params.shape || 0} min={0} max={1} step={0.01} onChange={(v) => onParamChange('shape', v)} />
        </div>

        {/* COLUMN 2: ENVELOPE */}
        <div>
          <div style={{
            fontSize: '8px', fontWeight: '500',
            letterSpacing: '0.12em',
            color: dark ? '#999' : '#666',
            marginBottom: '8px',
            paddingBottom: '3px',
            borderBottom: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
            textAlign: 'center'
          }}>
            ENV
          </div>
          
          <DragKnob dark={dark} label="ATK" value={params.attack} min={0} max={2} step={0.01} onChange={(v) => onParamChange('attack', v)} unit="s" />
          <DragKnob dark={dark} label="DEC" value={params.decay} min={0} max={2} step={0.01} onChange={(v) => onParamChange('decay', v)} unit="s" />
          <DragKnob dark={dark} label="SUS" value={params.sustain} min={0} max={1} step={0.01} onChange={(v) => onParamChange('sustain', v)} />
          <DragKnob dark={dark} label="REL" value={params.release} min={0} max={3} step={0.01} onChange={(v) => onParamChange('release', v)} unit="s" />
        </div>

        {/* COLUMN 3: FILTER */}
        <div>
          <div style={{
            fontSize: '8px', fontWeight: '500',
            letterSpacing: '0.12em',
            color: dark ? '#999' : '#666',
            marginBottom: '8px',
            paddingBottom: '3px',
            borderBottom: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
            textAlign: 'center'
          }}>
            FILT
          </div>
          
          {/* Filter type */}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '7px', fontWeight: '500', color: dark ? '#666' : '#999', marginBottom: '4px', textAlign: 'center' }}>TYPE</div>
            <div style={{ display: 'flex', gap: '2px' }}>
              {['LP', 'HP', 'BP'].map((type, i) => (
                <button
                  key={type}
                  onClick={() => onParamChange('filterType', ['lowpass', 'highpass', 'bandpass'][i])}
                  style={{
                    flex: 1,
                    fontSize: '7px', fontWeight: '500',
                    padding: '4px 2px',
                    background: params.filterType === ['lowpass', 'highpass', 'bandpass'][i] ? (dark ? '#fff' : '#000') : 'none',
                    border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                    cursor: 'pointer',
                    color: params.filterType === ['lowpass', 'highpass', 'bandpass'][i] ? (dark ? '#000' : '#fff') : (dark ? '#fff' : '#000')
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <DragKnob dark={dark} label="FREQ" value={params.filterFreq} min={20} max={20000} step={10} onChange={(v) => onParamChange('filterFreq', v)} unit="Hz" />
          <DragKnob dark={dark} label="RES" value={params.filterQ} min={0.1} max={30} step={0.1} onChange={(v) => onParamChange('filterQ', v)} />
        </div>

        {/* COLUMN 4: MOD */}
        <div>
          <div style={{
            fontSize: '8px', fontWeight: '500',
            letterSpacing: '0.12em',
            color: dark ? '#999' : '#666',
            marginBottom: '8px',
            paddingBottom: '3px',
            borderBottom: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
            textAlign: 'center'
          }}>
            MOD
          </div>
          
          <DragKnob dark={dark} label="VOL" value={params.volume} min={0} max={1} step={0.01} onChange={(v) => onParamChange('volume', v)} />
          <DragKnob dark={dark} label="PAN" value={params.pan || 0} min={-1} max={1} step={0.01} onChange={(v) => onParamChange('pan', v)} />
          <DragKnob dark={dark} label="DRIVE" value={params.drive || 0} min={0} max={1} step={0.01} onChange={(v) => onParamChange('drive', v)} />
          <DragKnob dark={dark} label="CONTR" value={params.contour || 0.5} min={0} max={1} step={0.01} onChange={(v) => onParamChange('contour', v)} />
        </div>

        {/* COLUMN 5: LFO */}
        <div>
          <div style={{
            fontSize: '8px', fontWeight: '500',
            letterSpacing: '0.12em',
            color: dark ? '#999' : '#666',
            marginBottom: '8px',
            paddingBottom: '3px',
            borderBottom: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
            textAlign: 'center'
          }}>
            LFO
          </div>
          
          <DragKnob dark={dark} label="RATE" value={params.lfoRate || 4} min={0.1} max={20} step={0.1} onChange={(v) => onParamChange('lfoRate', v)} unit="Hz" />
          <DragKnob dark={dark} label="DEPTH" value={params.lfoDepth || 0.3} min={0} max={1} step={0.01} onChange={(v) => onParamChange('lfoDepth', v)} />
          
          {/* LFO Wave selector */}
          <div style={{ marginBottom: '8px', marginTop: '8px' }}>
            <div style={{ fontSize: '7px', fontWeight: '500', color: dark ? '#666' : '#999', marginBottom: '4px', textAlign: 'center' }}>WAVE</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px' }}>
              {['sine', 'square', 'saw', 'tri'].map(type => (
                <button
                  key={type}
                  onClick={() => onParamChange('lfoWave', type === 'saw' ? 'sawtooth' : type === 'tri' ? 'triangle' : type)}
                  style={{
                    fontSize: '7px', fontWeight: '500',
                    padding: '4px 2px',
                    background: (params.lfoWave || 'sine') === (type === 'saw' ? 'sawtooth' : type === 'tri' ? 'triangle' : type) ? (dark ? '#fff' : '#000') : 'none',
                    border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                    cursor: 'pointer',
                    color: (params.lfoWave || 'sine') === (type === 'saw' ? 'sawtooth' : type === 'tri' ? 'triangle' : type) ? (dark ? '#000' : '#fff') : (dark ? '#fff' : '#000')
                  }}
                >
                  {type.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        marginTop: '10px',
        fontSize: '7px', fontWeight: '500',
        letterSpacing: '0.05em',
        color: dark ? '#666' : '#999',
        textAlign: 'center'
      }}>
        USE QWERTY KEYS TO PLAY • DRAG KNOBS UP/DOWN
      </div>
    </div>
  );
}

// Oscilloscope Visual - Reactive to actual audio output
function OscilloscopeVisual({ dark, analyser }) {
  const canvasRef = React.useRef(null);
  const animationRef = React.useRef(null);

  React.useEffect(() => {
    if (!analyser || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);

      analyser.getByteTimeDomainData(dataArray);

      // Clear with grid
      ctx.fillStyle = dark ? '#000' : '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw grid
      ctx.strokeStyle = dark ? '#1a1a1a' : '#f5f5f5';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = (canvas.height / 4) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
      for (let i = 0; i <= 4; i++) {
        const x = (canvas.width / 4) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }

      // Draw waveform
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = dark ? '#4ade80' : '#22c55e';
      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [analyser, dark]);

  return (
    <div style={{ width: '400px' }}>
      <canvas
        ref={canvasRef}
        width={400}
        height={200}
        style={{
          width: '100%',
          height: '200px',
          border: `1px solid ${dark ? '#333' : '#e5e5e5'}`
        }}
      />
      <div style={{
        marginTop: '8px',
        fontSize: '7px',
        letterSpacing: '0.05em',
        color: dark ? '#666' : '#999',
        textAlign: 'center'
      }}>
        LIVE AUDIO WAVEFORM
      </div>
    </div>
  );
}

function SoundsStudio({ onBack, dark }) {
  const [activeInstrument, setActiveInstrument] = useState(() => {
    return localStorage.getItem('carlisle_activeInstrument') || null;
  });

  React.useEffect(() => {
    if (activeInstrument) {
      localStorage.setItem('carlisle_activeInstrument', activeInstrument);
    } else {
      localStorage.removeItem('carlisle_activeInstrument');
    }
  }, [activeInstrument]);

  const instruments = [
    {
      id: 'sandbox',
      name: 'SANDBOX',
      description: 'MODULAR PATCHBAY SYSTEM',
      status: 'READY'
    },
    {
      id: 'gridseq',
      name: 'GRIDSEQ',
      description: '16-STEP DRUM SEQUENCER',
      status: 'READY'
    },
    {
      id: 'pulsewave',
      name: 'PULSEWAVE',
      description: 'MONOPHONIC SYNTHESIZER',
      status: 'READY'
    },
    {
      id: 'tapegrid',
      name: 'TAPEGRID',
      description: 'SAMPLE LOOP STATION',
      status: 'COMING SOON'
    }
  ];

  if (activeInstrument === 'sandbox') {
    return <Sandbox onBack={() => setActiveInstrument(null)} dark={dark} />;
  }

  if (activeInstrument === 'gridseq') {
    return <GridSeq onBack={() => setActiveInstrument(null)} dark={dark} />;
  }

  if (activeInstrument === 'pulsewave') {
    return <PulseWave onBack={() => setActiveInstrument(null)} dark={dark} />;
  }

  return (
    <div>
      <button
        onClick={onBack}
        style={{
          fontSize: '10px',
          letterSpacing: '0.15em',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: dark ? '#999' : '#666',
          marginBottom: '40px',
          transition: 'opacity 0.2s'
        }}
        onMouseEnter={(e) => e.target.style.opacity = '0.5'}
        onMouseLeave={(e) => e.target.style.opacity = '1'}
      >
        ← BACK TO HOME
      </button>

      <div style={{
        fontSize: '24px',
        fontWeight: '300',
        letterSpacing: '0.15em',
        marginBottom: '60px',
        color: dark ? '#fff' : '#000'
      }}>
        SOUNDS
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: '30px'
      }}>
        {instruments.map(inst => (
          <button
            key={inst.id}
            onClick={() => inst.status === 'READY' && setActiveInstrument(inst.id)}
            disabled={inst.status !== 'READY'}
            style={{
              padding: '40px',
              background: 'none',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              cursor: inst.status === 'READY' ? 'pointer' : 'not-allowed',
              textAlign: 'left',
              transition: 'border-color 0.2s',
              opacity: inst.status === 'READY' ? 1 : 0.5
            }}
            onMouseEnter={(e) => {
              if (inst.status === 'READY') {
                e.target.style.borderColor = dark ? '#666' : '#999';
              }
            }}
            onMouseLeave={(e) => {
              if (inst.status === 'READY') {
                e.target.style.borderColor = dark ? '#333' : '#e5e5e5';
              }
            }}
          >
            <div style={{
              fontSize: '18px',
              letterSpacing: '0.1em',
              color: dark ? '#fff' : '#000',
              marginBottom: '12px',
              fontWeight: '300'
            }}>
              {inst.name}
            </div>
            <div style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              color: dark ? '#666' : '#999',
              marginBottom: '20px'
            }}>
              {inst.description}
            </div>
            <div style={{
              fontSize: '9px',
              letterSpacing: '0.1em',
              color: inst.status === 'READY' ? (dark ? '#4ade80' : '#22c55e') : (dark ? '#666' : '#999')
            }}>
              {inst.status}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function PulseWave({ onBack, dark }) {
  const [oscType, setOscType] = useState(() => {
    return localStorage.getItem('carlisle_pulsewave_oscType') || 'sine';
  });
  const [attack, setAttack] = useState(() => {
    const saved = localStorage.getItem('carlisle_pulsewave_attack');
    return saved ? parseFloat(saved) : 0.01;
  });
  const [decay, setDecay] = useState(() => {
    const saved = localStorage.getItem('carlisle_pulsewave_decay');
    return saved ? parseFloat(saved) : 0.1;
  });
  const [sustain, setSustain] = useState(() => {
    const saved = localStorage.getItem('carlisle_pulsewave_sustain');
    return saved ? parseFloat(saved) : 0.7;
  });
  const [release, setRelease] = useState(() => {
    const saved = localStorage.getItem('carlisle_pulsewave_release');
    return saved ? parseFloat(saved) : 0.3;
  });
  const [filterType, setFilterType] = useState(() => {
    return localStorage.getItem('carlisle_pulsewave_filterType') || 'lowpass';
  });
  const [filterFreq, setFilterFreq] = useState(() => {
    const saved = localStorage.getItem('carlisle_pulsewave_filterFreq');
    return saved ? parseInt(saved) : 2000;
  });
  const [filterQ, setFilterQ] = useState(() => {
    const saved = localStorage.getItem('carlisle_pulsewave_filterQ');
    return saved ? parseFloat(saved) : 1;
  });
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('carlisle_pulsewave_volume');
    return saved ? parseFloat(saved) : 0.3;
  });
  const [activeNotes, setActiveNotes] = useState(new Set());
  const [activeKeys, setActiveKeys] = useState(new Set());

  const audioContextRef = React.useRef(null);
  const voicesRef = React.useRef(new Map()); // Map of note -> {osc, gain, filter}
  const activeKeysRef = React.useRef(new Set());
  
  // Refs for current parameter values
  const oscTypeRef = React.useRef(oscType);
  const attackRef = React.useRef(attack);
  const decayRef = React.useRef(decay);
  const sustainRef = React.useRef(sustain);
  const releaseRef = React.useRef(release);
  const filterTypeRef = React.useRef(filterType);
  const filterFreqRef = React.useRef(filterFreq);
  const filterQRef = React.useRef(filterQ);
  const volumeRef = React.useRef(volume);

  // Auto-save settings
  React.useEffect(() => { 
    oscTypeRef.current = oscType;
    localStorage.setItem('carlisle_pulsewave_oscType', oscType);
  }, [oscType]);
  React.useEffect(() => { 
    attackRef.current = attack;
    localStorage.setItem('carlisle_pulsewave_attack', attack.toString());
  }, [attack]);
  React.useEffect(() => { 
    decayRef.current = decay;
    localStorage.setItem('carlisle_pulsewave_decay', decay.toString());
  }, [decay]);
  React.useEffect(() => { 
    sustainRef.current = sustain;
    localStorage.setItem('carlisle_pulsewave_sustain', sustain.toString());
  }, [sustain]);
  React.useEffect(() => { 
    releaseRef.current = release;
    localStorage.setItem('carlisle_pulsewave_release', release.toString());
  }, [release]);
  React.useEffect(() => { 
    filterTypeRef.current = filterType;
    localStorage.setItem('carlisle_pulsewave_filterType', filterType);
  }, [filterType]);
  React.useEffect(() => { 
    filterFreqRef.current = filterFreq;
    localStorage.setItem('carlisle_pulsewave_filterFreq', filterFreq.toString());
  }, [filterFreq]);
  React.useEffect(() => { 
    filterQRef.current = filterQ;
    localStorage.setItem('carlisle_pulsewave_filterQ', filterQ.toString());
  }, [filterQ]);
  React.useEffect(() => { 
    volumeRef.current = volume;
    localStorage.setItem('carlisle_pulsewave_volume', volume.toString());
  }, [volume]);

  // Note frequencies (C4 to C5)
  const notes = [
    { name: 'C', freq: 261.63, isBlack: false, key: 'a' },
    { name: 'C#', freq: 277.18, isBlack: true, key: 'w' },
    { name: 'D', freq: 293.66, isBlack: false, key: 's' },
    { name: 'D#', freq: 311.13, isBlack: true, key: 'e' },
    { name: 'E', freq: 329.63, isBlack: false, key: 'd' },
    { name: 'F', freq: 349.23, isBlack: false, key: 'f' },
    { name: 'F#', freq: 369.99, isBlack: true, key: 't' },
    { name: 'G', freq: 392.00, isBlack: false, key: 'g' },
    { name: 'G#', freq: 415.30, isBlack: true, key: 'y' },
    { name: 'A', freq: 440.00, isBlack: false, key: 'h' },
    { name: 'A#', freq: 466.16, isBlack: true, key: 'u' },
    { name: 'B', freq: 493.88, isBlack: false, key: 'j' },
    { name: 'C', freq: 523.25, isBlack: false, key: 'k' }
  ];

  const playNoteInternal = React.useCallback((freq, noteName, isHeld = false) => {
    const ctx = audioContextRef.current;
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = oscTypeRef.current;
    osc.frequency.setValueAtTime(freq, now);

    const gainNode = ctx.createGain();
    
    if (isHeld) {
      // For held notes (mouse), start attack/decay and hold at sustain
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(volumeRef.current, now + attackRef.current);
      gainNode.gain.linearRampToValueAtTime(volumeRef.current * sustainRef.current, now + attackRef.current + decayRef.current);
    } else {
      // For triggered notes (keyboard), play full ADSR
      const totalDuration = attackRef.current + decayRef.current + 1.5;
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(volumeRef.current, now + attackRef.current);
      gainNode.gain.linearRampToValueAtTime(volumeRef.current * sustainRef.current, now + attackRef.current + decayRef.current);
      gainNode.gain.setValueAtTime(volumeRef.current * sustainRef.current, now + attackRef.current + decayRef.current + 1.5);
      gainNode.gain.linearRampToValueAtTime(0, now + totalDuration + releaseRef.current);
      
      // Auto-cleanup after note finishes
      setTimeout(() => {
        try {
          osc.stop();
        } catch (e) {}
        voicesRef.current.delete(noteName + '_trig_' + now);
        setActiveNotes(new Set([...voicesRef.current.keys()].map(k => k.split('_')[0])));
      }, (totalDuration + releaseRef.current + 0.1) * 1000);
    }

    const filter = ctx.createBiquadFilter();
    filter.type = filterTypeRef.current;
    filter.frequency.setValueAtTime(filterFreqRef.current, now);
    filter.Q.setValueAtTime(filterQRef.current, now);

    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(now);
    
    if (!isHeld) {
      osc.stop(now + attackRef.current + decayRef.current + 1.5 + releaseRef.current + 0.1);
    }

    // Store voice
    const voiceKey = isHeld ? noteName : (noteName + '_trig_' + now);
    voicesRef.current.set(voiceKey, { osc, gainNode, filter });
    setActiveNotes(new Set([...voicesRef.current.keys()].map(k => k.split('_')[0])));

    return voiceKey;
  }, []);

  const stopNoteInternal = React.useCallback((noteName) => {
    const voice = voicesRef.current.get(noteName);
    if (!voice) return;

    const ctx = audioContextRef.current;
    const now = ctx.currentTime;

    try {
      voice.gainNode.gain.cancelScheduledValues(now);
      voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now);
      voice.gainNode.gain.linearRampToValueAtTime(0, now + releaseRef.current);
    } catch (e) {}

    setTimeout(() => {
      try {
        voice.osc.stop();
      } catch (e) {}
      voicesRef.current.delete(noteName);
      setActiveNotes(new Set([...voicesRef.current.keys()].map(k => k.split('_')[0])));
    }, releaseRef.current * 1000 + 100);
  }, []);

  React.useEffect(() => {
    audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    
    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      
      if (e.repeat) return;
      
      const note = notes.find(n => n.key === key);
      if (note) {
        e.preventDefault();
        activeKeysRef.current.add(key);
        setActiveKeys(new Set(activeKeysRef.current));
        playNoteInternal(note.freq, note.name, false);
      }
    };

    const handleKeyUp = (e) => {
      const key = e.key.toLowerCase();
      const note = notes.find(n => n.key === key);
      if (note) {
        e.preventDefault();
        activeKeysRef.current.delete(key);
        setActiveKeys(new Set(activeKeysRef.current));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      // Clean up all voices
      voicesRef.current.forEach(voice => {
        try {
          voice.osc.stop();
        } catch (e) {}
      });
      voicesRef.current.clear();
      
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [playNoteInternal]);

  const handleNoteDown = (note) => {
    playNoteInternal(note.freq, note.name, true);
  };

  const handleNoteUp = (note) => {
    stopNoteInternal(note.name);
  };

  const exportSettings = () => {
    const settings = {
      oscType,
      envelope: { attack, decay, sustain, release },
      filter: { type: filterType, frequency: filterFreq, q: filterQ },
      volume
    };
    const data = JSON.stringify(settings, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pulsewave-preset-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <button
        onClick={onBack}
        style={{
          fontSize: '10px',
          letterSpacing: '0.15em',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: dark ? '#999' : '#666',
          marginBottom: '40px',
          transition: 'opacity 0.2s'
        }}
        onMouseEnter={(e) => e.target.style.opacity = '0.5'}
        onMouseLeave={(e) => e.target.style.opacity = '1'}
      >
        ← BACK TO SOUNDS
      </button>

      <div style={{
        fontSize: '24px',
        fontWeight: '300',
        letterSpacing: '0.15em',
        marginBottom: '40px',
        color: dark ? '#fff' : '#000'
      }}>
        PULSEWAVE
      </div>

      {/* Controls */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '30px',
        marginBottom: '40px'
      }}>
        {/* Oscillator */}
        <div>
          <div style={{
            fontSize: '10px',
            letterSpacing: '0.1em',
            color: dark ? '#999' : '#666',
            marginBottom: '12px'
          }}>
            OSCILLATOR
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {['sine', 'square', 'sawtooth', 'triangle'].map(type => (
              <button
                key={type}
                onClick={() => setOscType(type)}
                style={{
                  fontSize: '9px',
                  letterSpacing: '0.1em',
                  padding: '8px 12px',
                  background: oscType === type ? (dark ? '#fff' : '#000') : 'none',
                  border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                  cursor: 'pointer',
                  color: oscType === type ? (dark ? '#000' : '#fff') : (dark ? '#fff' : '#000'),
                  transition: 'all 0.2s',
                  textTransform: 'uppercase'
                }}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Envelope */}
        <div>
          <div style={{
            fontSize: '10px',
            letterSpacing: '0.1em',
            color: dark ? '#999' : '#666',
            marginBottom: '12px'
          }}>
            ENVELOPE (ADSR)
          </div>
          {[
            { label: 'ATTACK', value: attack, set: setAttack, min: 0, max: 2, step: 0.01 },
            { label: 'DECAY', value: decay, set: setDecay, min: 0, max: 2, step: 0.01 },
            { label: 'SUSTAIN', value: sustain, set: setSustain, min: 0, max: 1, step: 0.01 },
            { label: 'RELEASE', value: release, set: setRelease, min: 0, max: 3, step: 0.01 }
          ].map(param => (
            <div key={param.label} style={{ marginBottom: '8px' }}>
              <div style={{
                fontSize: '8px',
                letterSpacing: '0.1em',
                color: dark ? '#666' : '#999',
                marginBottom: '4px'
              }}>
                {param.label}: {(param.value || 0).toFixed(2)}
              </div>
              <input
                type="range"
                min={param.min}
                max={param.max}
                step={param.step}
                value={param.value}
                onChange={(e) => param.set(parseFloat(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>
          ))}
        </div>

        {/* Filter */}
        <div>
          <div style={{
            fontSize: '10px',
            letterSpacing: '0.1em',
            color: dark ? '#999' : '#666',
            marginBottom: '12px'
          }}>
            FILTER
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            {['lowpass', 'highpass', 'bandpass'].map(type => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                style={{
                  fontSize: '8px',
                  letterSpacing: '0.1em',
                  padding: '6px 10px',
                  background: filterType === type ? (dark ? '#fff' : '#000') : 'none',
                  border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                  cursor: 'pointer',
                  color: filterType === type ? (dark ? '#000' : '#fff') : (dark ? '#fff' : '#000'),
                  transition: 'all 0.2s',
                  textTransform: 'uppercase'
                }}
              >
                {type.slice(0, 2)}
              </button>
            ))}
          </div>
          <div style={{ marginBottom: '8px' }}>
            <div style={{
              fontSize: '8px',
              letterSpacing: '0.1em',
              color: dark ? '#666' : '#999',
              marginBottom: '4px'
            }}>
              CUTOFF: {filterFreq}Hz
            </div>
            <input
              type="range"
              min="20"
              max="20000"
              step="10"
              value={filterFreq}
              onChange={(e) => setFilterFreq(parseInt(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <div style={{
              fontSize: '8px',
              letterSpacing: '0.1em',
              color: dark ? '#666' : '#999',
              marginBottom: '4px'
            }}>
              RESONANCE: {(filterQ || 1).toFixed(1)}
            </div>
            <input
              type="range"
              min="0.1"
              max="30"
              step="0.1"
              value={filterQ}
              onChange={(e) => setFilterQ(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
        </div>

        {/* Output */}
        <div>
          <div style={{
            fontSize: '10px',
            letterSpacing: '0.1em',
            color: dark ? '#999' : '#666',
            marginBottom: '12px'
          }}>
            OUTPUT
          </div>
          <div style={{ marginBottom: '12px' }}>
            <div style={{
              fontSize: '8px',
              letterSpacing: '0.1em',
              color: dark ? '#666' : '#999',
              marginBottom: '4px'
            }}>
              VOLUME: {((volume || 0) * 100).toFixed(0)}%
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
          <button
            onClick={exportSettings}
            style={{
              fontSize: '9px',
              letterSpacing: '0.1em',
              padding: '8px 16px',
              background: 'none',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              cursor: 'pointer',
              color: dark ? '#fff' : '#000',
              transition: 'border-color 0.2s',
              width: '100%'
            }}
            onMouseEnter={(e) => e.target.style.borderColor = dark ? '#666' : '#999'}
            onMouseLeave={(e) => e.target.style.borderColor = dark ? '#333' : '#e5e5e5'}
          >
            EXPORT PRESET
          </button>
        </div>
      </div>

      {/* Keyboard */}
      <div style={{
        marginTop: '60px',
        marginBottom: '20px'
      }}>
        <div style={{
          fontSize: '10px',
          letterSpacing: '0.1em',
          color: dark ? '#999' : '#666',
          marginBottom: '20px'
        }}>
          POLYPHONIC KEYBOARD (C4 - C5) • PRESS COMPUTER KEYS TO TRIGGER: A W S E D F T G Y H U J K
        </div>
        
        <div style={{
          display: 'flex',
          position: 'relative',
          height: '180px',
          userSelect: 'none'
        }}>
          {/* White keys */}
          {notes.filter(n => !n.isBlack).map((note, i) => (
            <button
              key={note.name + i + note.freq}
              onPointerDown={(e) => { e.preventDefault(); handleNoteDown(note); }}
              onPointerUp={(e) => { e.preventDefault(); handleNoteUp(note); }}
              onPointerLeave={(e) => { 
                if (e.buttons === 1) {
                  e.preventDefault(); 
                  handleNoteUp(note); 
                }
              }}
              style={{
                flex: 1,
                background: (activeNotes.has(note.name) || activeKeys.has(note.key)) 
                  ? (dark ? '#999' : '#ccc') 
                  : (dark ? '#fff' : '#fff'),
                border: `1px solid ${dark ? '#000' : '#000'}`,
                cursor: 'pointer',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                paddingBottom: '12px',
                fontSize: '10px',
                letterSpacing: '0.1em',
                color: '#000',
                transition: 'background 0.05s',
                touchAction: 'none'
              }}
            >
              <div style={{ fontSize: '8px', color: '#666', marginBottom: '4px' }}>
                {note.key.toUpperCase()}
              </div>
              {note.name}
            </button>
          ))}

          {/* Black keys */}
          {notes.filter(n => n.isBlack).map((note, i) => {
            const whiteKeyIndex = notes.filter(n => !n.isBlack && notes.indexOf(n) < notes.indexOf(note)).length;
            const offset = whiteKeyIndex * (100 / 8) - 2.5;
            
            return (
              <button
                key={note.name + i + note.freq}
                onPointerDown={(e) => { e.preventDefault(); handleNoteDown(note); }}
                onPointerUp={(e) => { e.preventDefault(); handleNoteUp(note); }}
                onPointerLeave={(e) => { 
                  if (e.buttons === 1) {
                    e.preventDefault(); 
                    handleNoteUp(note); 
                  }
                }}
                style={{
                  position: 'absolute',
                  left: `${offset}%`,
                  width: '5%',
                  height: '60%',
                  background: (activeNotes.has(note.name) || activeKeys.has(note.key))
                    ? (dark ? '#333' : '#555') 
                    : (dark ? '#000' : '#000'),
                  border: `1px solid ${dark ? '#fff' : '#fff'}`,
                  cursor: 'pointer',
                  zIndex: 10,
                  transition: 'background 0.05s',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'center',
                  paddingTop: '8px',
                  fontSize: '7px',
                  color: '#fff',
                  letterSpacing: '0.1em',
                  touchAction: 'none'
                }}
              >
                {note.key.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{
        marginTop: '40px',
        fontSize: '10px',
        letterSpacing: '0.05em',
        color: dark ? '#666' : '#999',
        lineHeight: '1.6'
      }}>
        🎹 POLYPHONIC SYNTH • PLAY CHORDS WITH MOUSE • TAP KEYBOARD FOR MELODIES • ADJUST PARAMETERS IN REAL-TIME
      </div>
    </div>
  );
}

function GridSeq({ onBack, dark }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(() => {
    const saved = localStorage.getItem('carlisle_gridseq_bpm');
    return saved ? parseInt(saved) : 120;
  });
  const [currentStep, setCurrentStep] = useState(-1);
  const [pattern, setPattern] = useState(() => {
    const saved = localStorage.getItem('carlisle_gridseq_pattern');
    if (saved) {
      return JSON.parse(saved);
    }
    // 8 tracks x 16 steps
    return Array(8).fill(null).map(() => Array(16).fill(false));
  });

  const audioContextRef = React.useRef(null);
  const intervalRef = React.useRef(null);

  // Auto-save pattern
  React.useEffect(() => {
    localStorage.setItem('carlisle_gridseq_pattern', JSON.stringify(pattern));
  }, [pattern]);

  // Auto-save BPM
  React.useEffect(() => {
    localStorage.setItem('carlisle_gridseq_bpm', bpm.toString());
  }, [bpm]);

  const tracks = [
    { name: 'KICK', freq: 150, decay: 0.5 },
    { name: 'SNARE', freq: 200, decay: 0.2 },
    { name: 'CLAP', freq: 400, decay: 0.15 },
    { name: 'HAT-C', freq: 8000, decay: 0.05 },
    { name: 'HAT-O', freq: 10000, decay: 0.1 },
    { name: 'TOM-H', freq: 300, decay: 0.3 },
    { name: 'TOM-L', freq: 180, decay: 0.4 },
    { name: 'PERC', freq: 800, decay: 0.15 }
  ];

  React.useEffect(() => {
    audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const playSound = (trackIndex) => {
    const ctx = audioContextRef.current;
    if (!ctx) return;

    const track = tracks[trackIndex];
    const now = ctx.currentTime;

    // Oscillator for tone
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    // Different wave types for different drums
    if (trackIndex === 0) { // Kick
      osc.type = 'sine';
      osc.frequency.setValueAtTime(track.freq, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.1);
    } else if (trackIndex === 1 || trackIndex === 2) { // Snare/Clap
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(track.freq, now);
    } else if (trackIndex === 3 || trackIndex === 4) { // Hi-hats
      osc.type = 'square';
      osc.frequency.setValueAtTime(track.freq, now);
    } else { // Toms/Perc
      osc.type = 'sine';
      osc.frequency.setValueAtTime(track.freq, now);
      osc.frequency.exponentialRampToValueAtTime(track.freq * 0.5, now + track.decay);
    }

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + track.decay);

    osc.start(now);
    osc.stop(now + track.decay);
  };

  const toggleCell = (trackIndex, step) => {
    const newPattern = pattern.map((row, i) =>
      i === trackIndex ? row.map((cell, j) => (j === step ? !cell : cell)) : row
    );
    setPattern(newPattern);
    
    // Play sound immediately when activating a cell
    if (!pattern[trackIndex][step]) {
      playSound(trackIndex);
    }
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      clearInterval(intervalRef.current);
      setCurrentStep(-1);
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      let step = 0;
      const stepTime = (60 / bpm) * 250; // 16th notes

      intervalRef.current = setInterval(() => {
        setCurrentStep(step);
        
        // Play sounds for active cells in this step
        pattern.forEach((row, trackIndex) => {
          if (row[step]) {
            playSound(trackIndex);
          }
        });

        step = (step + 1) % 16;
      }, stepTime);
    }
  };

  const clearPattern = () => {
    setPattern(Array(8).fill(null).map(() => Array(16).fill(false)));
  };

  const exportPattern = () => {
    const data = JSON.stringify({ pattern, bpm }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gridseq-pattern-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <button
        onClick={onBack}
        style={{
          fontSize: '10px',
          letterSpacing: '0.15em',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: dark ? '#999' : '#666',
          marginBottom: '40px',
          transition: 'opacity 0.2s'
        }}
        onMouseEnter={(e) => e.target.style.opacity = '0.5'}
        onMouseLeave={(e) => e.target.style.opacity = '1'}
      >
        ← BACK TO SOUNDS
      </button>

      <div style={{
        fontSize: '24px',
        fontWeight: '300',
        letterSpacing: '0.15em',
        marginBottom: '40px',
        color: dark ? '#fff' : '#000'
      }}>
        GRIDSEQ
      </div>

      {/* Controls */}
      <div style={{
        display: 'flex',
        gap: '20px',
        marginBottom: '40px',
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        <button
          onClick={handlePlayPause}
          style={{
            fontSize: '11px',
            letterSpacing: '0.1em',
            padding: '12px 24px',
            background: isPlaying ? (dark ? '#fff' : '#000') : 'none',
            border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
            cursor: 'pointer',
            color: isPlaying ? (dark ? '#000' : '#fff') : (dark ? '#fff' : '#000'),
            transition: 'all 0.2s'
          }}
        >
          {isPlaying ? 'STOP' : 'PLAY'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{
            fontSize: '10px',
            letterSpacing: '0.1em',
            color: dark ? '#999' : '#666'
          }}>
            BPM
          </label>
          <input
            type="number"
            value={bpm}
            onChange={(e) => setBpm(Math.max(60, Math.min(200, parseInt(e.target.value) || 120)))}
            style={{
              width: '70px',
              fontSize: '12px',
              padding: '8px',
              background: 'none',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              color: dark ? '#fff' : '#000',
              fontFamily: 'Helvetica Neue, Arial, sans-serif'
            }}
          />
        </div>

        <button
          onClick={clearPattern}
          style={{
            fontSize: '10px',
            letterSpacing: '0.1em',
            padding: '10px 20px',
            background: 'none',
            border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
            cursor: 'pointer',
            color: dark ? '#fff' : '#000',
            transition: 'border-color 0.2s'
          }}
          onMouseEnter={(e) => e.target.style.borderColor = dark ? '#666' : '#999'}
          onMouseLeave={(e) => e.target.style.borderColor = dark ? '#333' : '#e5e5e5'}
        >
          CLEAR
        </button>

        <button
          onClick={exportPattern}
          style={{
            fontSize: '10px',
            letterSpacing: '0.1em',
            padding: '10px 20px',
            background: 'none',
            border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
            cursor: 'pointer',
            color: dark ? '#fff' : '#000',
            transition: 'border-color 0.2s'
          }}
          onMouseEnter={(e) => e.target.style.borderColor = dark ? '#666' : '#999'}
          onMouseLeave={(e) => e.target.style.borderColor = dark ? '#333' : '#e5e5e5'}
        >
          EXPORT PATTERN
        </button>
      </div>

      {/* Sequencer Grid */}
      <div style={{ 
        overflowX: 'auto',
        paddingBottom: '20px'
      }}>
        <div style={{ 
          display: 'inline-block',
          minWidth: '100%'
        }}>
          {/* Track names */}
          <div style={{ 
            display: 'flex',
            marginBottom: '12px'
          }}>
            <div style={{ width: '80px' }} />
            {Array(16).fill(0).map((_, i) => (
              <div
                key={i}
                style={{
                  width: '32px',
                  height: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '9px',
                  color: dark ? '#666' : '#999',
                  marginRight: '4px'
                }}
              >
                {(i + 1).toString().padStart(2, '0')}
              </div>
            ))}
          </div>

          {/* Tracks */}
          {tracks.map((track, trackIndex) => (
            <div key={trackIndex} style={{ 
              display: 'flex',
              marginBottom: '8px',
              alignItems: 'center'
            }}>
              <div style={{
                width: '80px',
                fontSize: '10px',
                letterSpacing: '0.1em',
                color: dark ? '#999' : '#666',
                paddingRight: '12px'
              }}>
                {track.name}
              </div>
              {Array(16).fill(0).map((_, step) => (
                <button
                  key={step}
                  onClick={() => toggleCell(trackIndex, step)}
                  style={{
                    width: '32px',
                    height: '32px',
                    background: pattern[trackIndex][step] 
                      ? (dark ? '#fff' : '#000')
                      : 'none',
                    border: `1px solid ${
                      currentStep === step 
                        ? (dark ? '#666' : '#999')
                        : (dark ? '#1a1a1a' : '#f5f5f5')
                    }`,
                    cursor: 'pointer',
                    marginRight: '4px',
                    transition: 'all 0.1s',
                    padding: 0
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div style={{
        marginTop: '40px',
        fontSize: '10px',
        letterSpacing: '0.05em',
        color: dark ? '#666' : '#999',
        lineHeight: '1.6'
      }}>
        CLICK CELLS TO BUILD YOUR PATTERN • ADJUST BPM • EXPORT TO SAVE
      </div>
    </div>
  );
}

function InviteGate({ onSignUp, onLogin, getColor }) {
  const [mode, setMode] = useState("signup");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");

  const handleGenerate = () => {
    setUsername(generateUsername());
  };

  const handleSubmit = async () => {
    setError("");
    
    if (mode === "signup") {
      if (!username.trim() || !password.trim() || !inviteCode.trim()) {
        setError("PLEASE FILL IN ALL FIELDS");
        return;
      }
      const success = await onSignUp(username, password, inviteCode);
      if (!success) {
        // Error already shown by onSignUp
      }
    } else {
      if (!username.trim() || !password.trim()) {
        setError("PLEASE ENTER USERNAME AND PASSWORD");
        return;
      }
      const success = await onLogin(username, password);
      if (!success) {
        // Error already shown by onLogin
      }
    }
  };

  const handleAdminBypass = () => {
    const password = prompt("ENTER ADMIN PASSWORD:");
    if (password === "EpicMan101") {
      const event = new CustomEvent('adminBypass');
      window.dispatchEvent(event);
    } else if (password) {
      alert("INCORRECT PASSWORD");
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: getColor('bg'),
      color: getColor('text'),
      fontFamily: 'Helvetica Neue, Arial, sans-serif',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '420px',
        width: '100%'
      }}>
        {/* Header */}
        <div style={{
          textAlign: 'center',
          marginBottom: '60px'
        }}>
          <div style={{
            fontSize: '32px',
            fontWeight: '300',
            letterSpacing: '0.15em',
            marginBottom: '10px'
          }}>
            CARLISLE
          </div>
          <div style={{
            fontSize: '10px',
            letterSpacing: '0.2em',
            color: getColor('textMuted')
          }}>
            ANONYMOUS ARCHIVE
          </div>
        </div>

        {/* Mode Tabs */}
        <div style={{
          display: 'flex',
          marginBottom: '30px',
          border: `1px solid ${getColor('border')}`,
          overflow: 'hidden'
        }}>
          <button
            onClick={() => {
              setMode("signup");
              setError("");
            }}
            style={{
              flex: 1,
              fontSize: '10px',
              letterSpacing: '0.1em',
              padding: '12px',
              backgroundColor: mode === "signup" ? getColor('text') : 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: mode === "signup" ? getColor('bg') : getColor('textMuted'),
              transition: 'all 0.2s',
              fontFamily: 'Helvetica Neue, Arial, sans-serif'
            }}
          >
            SIGN UP
          </button>
          <button
            onClick={() => {
              setMode("login");
              setError("");
            }}
            style={{
              flex: 1,
              fontSize: '10px',
              letterSpacing: '0.1em',
              padding: '12px',
              backgroundColor: mode === "login" ? getColor('text') : 'transparent',
              border: 'none',
              borderLeft: `1px solid ${getColor('border')}`,
              cursor: 'pointer',
              color: mode === "login" ? getColor('bg') : getColor('textMuted'),
              transition: 'all 0.2s',
              fontFamily: 'Helvetica Neue, Arial, sans-serif'
            }}
          >
            LOGIN
          </button>
        </div>

        {/* Info Text */}
        <div style={{
          fontSize: '10px',
          letterSpacing: '0.05em',
          color: getColor('textMuted'),
          marginBottom: '25px',
          lineHeight: '1.5',
          textAlign: 'center'
        }}>
          {mode === "signup" ? (
            <>
              Pick a username or generate a random one.
              <br />
              No emails. No recovery. Remember your password.
            </>
          ) : (
            <>
              Enter your username and password.
            </>
          )}
        </div>

        {/* Form Fields */}
        <div style={{ marginBottom: '20px' }}>
          {/* Invite Code (signup only) */}
          {mode === "signup" && (
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                fontSize: '9px',
                letterSpacing: '0.1em',
                color: getColor('textMuted'),
                marginBottom: '8px'
              }}>
                INVITE CODE
              </label>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="ABC123XYZ"
                style={{
                  width: '100%',
                  fontSize: '14px',
                  letterSpacing: '0.1em',
                  padding: '12px',
                  background: 'none',
                  border: `1px solid ${getColor('border')}`,
                  outline: 'none',
                  color: getColor('text'),
                  fontFamily: 'Helvetica Neue, Arial, sans-serif',
                  boxSizing: 'border-box',
                  textTransform: 'uppercase'
                }}
              />
            </div>
          )}

          {/* Username */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              fontSize: '9px',
              letterSpacing: '0.1em',
              color: getColor('textMuted'),
              marginBottom: '8px'
            }}>
              USERNAME
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="HalfKitty28"
                style={{
                  width: '100%',
                  fontSize: '16px',
                  letterSpacing: '0.05em',
                  padding: '12px',
                  paddingRight: mode === "signup" ? '50px' : '12px',
                  background: 'none',
                  border: `1px solid ${getColor('border')}`,
                  outline: 'none',
                  color: getColor('text'),
                  fontFamily: 'Helvetica Neue, Arial, sans-serif',
                  boxSizing: 'border-box'
                }}
              />
              {mode === "signup" && (
                <button
                  onClick={handleGenerate}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '18px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: getColor('textMuted'),
                    padding: '4px 8px',
                    transition: 'opacity 0.2s'
                  }}
                  onMouseEnter={(e) => e.target.style.opacity = '0.5'}
                  onMouseLeave={(e) => e.target.style.opacity = '1'}
                  title="Generate random username"
                >
                  🎲
                </button>
              )}
            </div>
            {mode === "signup" && (
              <div style={{
                fontSize: '9px',
                letterSpacing: '0.05em',
                color: getColor('textMuted'),
                marginTop: '6px'
              }}>
                Click the dice to generate random names
              </div>
            )}
          </div>

          {/* Password */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              fontSize: '9px',
              letterSpacing: '0.1em',
              color: getColor('textMuted'),
              marginBottom: '8px'
            }}>
              PASSWORD
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit();
              }}
              placeholder="••••••••••"
              style={{
                width: '100%',
                fontSize: '16px',
                letterSpacing: '0.1em',
                padding: '12px',
                background: 'none',
                border: `1px solid ${getColor('border')}`,
                outline: 'none',
                color: getColor('text'),
                fontFamily: 'Helvetica Neue, Arial, sans-serif',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Warning (signup only) */}
          {mode === "signup" && (
            <div style={{
              fontSize: '9px',
              letterSpacing: '0.05em',
              color: '#ff4444',
              lineHeight: '1.4',
              padding: '10px',
              backgroundColor: getColor('bg') === '#000' ? '#1a0a0a' : '#fff5f5',
              border: `1px solid #ff4444`,
              marginBottom: '20px'
            }}>
              ⚠️ No password recovery. Write it down.
            </div>
          )}

          {error && (
            <div style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              color: '#ff4444',
              marginBottom: '20px',
              textAlign: 'center'
            }}>
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            style={{
              width: '100%',
              fontSize: '11px',
              letterSpacing: '0.1em',
              padding: '15px',
              backgroundColor: getColor('text'),
              border: 'none',
              cursor: 'pointer',
              color: getColor('bg'),
              transition: 'opacity 0.2s',
              fontFamily: 'Helvetica Neue, Arial, sans-serif'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.8'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
          >
            {mode === "signup" ? "CREATE ACCOUNT" : "LOGIN"}
          </button>
        </div>

        {/* Hidden admin login - triple click */}
        <div 
          onClick={(e) => {
            if (e.detail === 3) {
              handleAdminBypass();
            }
          }}
          style={{
            marginTop: '40px',
            fontSize: '9px',
            letterSpacing: '0.1em',
            color: getColor('borderDim'),
            cursor: 'default',
            userSelect: 'none',
            textAlign: 'center'
          }}
        >
          •
        </div>

        {/* Example Usernames */}
        <div style={{
          marginTop: '60px',
          textAlign: 'center',
          fontSize: '9px',
          letterSpacing: '0.1em',
          color: getColor('textMuted')
        }}>
          <div style={{ marginBottom: '10px' }}>EXAMPLE USERNAMES:</div>
          <div style={{ lineHeight: '1.8' }}>
            HalfKitty28 • BigFrog12 • TinyMoon99
            <br />
            SadRock45 • FastCheese03 • OldBox71
          </div>
        </div>
      </div>
    </div>
  );
}
