import React, { useEffect, useMemo, useState } from "react";
import { initializeApp } from "firebase/app";
import { 
  getDatabase, 
  ref, 
  set, 
  onValue, 
  push,
  update,
  remove
} from "firebase/database";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
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

// ---------- Config & utils ----------
const LS_USER = "pinanon_v3_user";
const DEFAULT_ROOM = "main";
const ADMIN_PASSWORD = "EpicMan101";

function genAnonId() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 7; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
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
  inviteCodes: {}, // { code: { used: false, createdBy: userId, usedBy: null, created: timestamp } }
  syncTokens: {}, // { token: { firebaseUID: uid, used: false, created: timestamp, expiresAt: timestamp } }
  users: {} // Track which users have access
};

// ---------- Main Component ----------
export default function PinAnonBoard() {
  const [state, setState] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [syncToken, setSyncToken] = useState(null);
  const [user, setUser] = useState(() => {
    const existing = loadUser();
    if (existing?.id) {
      // Grandfather in existing users - if they don't have hasAccess field yet, give them access
      if (existing.hasAccess === undefined) {
        existing.hasAccess = true;
        existing.inviteCodesRemaining = 3;
        localStorage.setItem(LS_USER, JSON.stringify(existing));
      }
      return existing;
    }
    const newUser = { 
      id: genAnonId(7), 
      display: null,
      bio: null,
      profileImage: null,
      bannerColor: null,
      isAdmin: false,
      hasAccess: false, // Whether they've used an invite code
      inviteCodesRemaining: 0, // How many invites they can give out
      inviteCodesCreated: [], // Codes they've created
      createdRooms: [], // Track rooms this user created
      createdPosts: [], // Track posts this user created
      joinedRooms: [DEFAULT_ROOM] // Track rooms user has joined
    };
    localStorage.setItem(LS_USER, JSON.stringify(newUser));
    return newUser;
  });

  const [layout, setLayout] = useState(() => {
    return localStorage.getItem("pinanon_layout") || "single";
  }); // "single", "double", or "triple"
  const [view, setView] = useState(() => {
    return localStorage.getItem("pinanon_view") || "home";
  }); // "home" or "room"
  const [room, setRoom] = useState(() => {
    return localStorage.getItem("pinanon_room") || DEFAULT_ROOM;
  });
  const [showNew, setShowNew] = useState(false);
  const [profileView, setProfileView] = useState(null);
  const [sort, setSort] = useState("newest");
  const [whisper, setWhisper] = useState(false);
  const [search, setSearch] = useState("");
  const [inviteModal, setInviteModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [dark, setDark] = useState(() => {
    return localStorage.getItem("pinanon_dark") === "1";
  });
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("pinanon_theme") || "default";
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
        setState(data);
        setWhisper(data.settings?.whisper || false);
      } else {
        set(stateRef, EMPTY);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Firebase Auth - Sign in anonymously and sync user data
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // User is signed in
        setFirebaseUser(firebaseUser);
        
        // Generate sync token for QR code
        const token = await firebaseUser.getIdToken();
        setSyncToken(token);
        
        // Try to load user data from Firebase
        const userRef = ref(database, `users/${firebaseUser.uid}`);
        onValue(userRef, (snapshot) => {
          const firebaseData = snapshot.val();
          
          if (firebaseData) {
            // User data exists in Firebase, use it
            setUser(firebaseData);
            saveUser(firebaseData);
          } else {
            // First time with this Firebase account, save current user data
            const currentUser = loadUser();
            if (currentUser) {
              set(userRef, currentUser);
            }
          }
        }, { onlyOnce: true });
      } else {
        // No user signed in, sign in anonymously
        signInAnonymously(auth).catch((error) => {
          console.error("Error signing in anonymously:", error);
        });
      }
    });

    return () => unsubscribe();
  }, []);

  // Sync user data to Firebase whenever it changes
  useEffect(() => {
    if (firebaseUser && user.id) {
      const userRef = ref(database, `users/${firebaseUser.uid}`);
      set(userRef, user);
    }
  }, [user, firebaseUser]);

  useEffect(() => {
    saveUser(user);
  }, [user]);

  useEffect(() => {
    localStorage.setItem("pinanon_dark", dark ? "1" : "0");
  }, [dark]);

  useEffect(() => {
    localStorage.setItem("pinanon_theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("pinanon_layout", layout);
  }, [layout]);

  useEffect(() => {
    localStorage.setItem("pinanon_view", view);
  }, [view]);

  useEffect(() => {
    localStorage.setItem("pinanon_room", room);
  }, [room]);

  const postsInRoom = useMemo(
    () => (state.posts || []).filter((p) => p.room === room),
    [state.posts, room]
  );

  function createRoom(name = "room", isPrivate = true, creatorOnly = false) {
    const invite = genAnonId(6);
    const r = { 
      id: invite, 
      name: name || `room-${invite}`, 
      invite,
      creator: user.id,
      isPrivate: isPrivate, // Now controlled by user choice
      creatorOnly: creatorOnly // Only creator can post
    };
    const newRooms = [r, ...state.rooms];
    const updates = {};
    updates['appState/rooms'] = newRooms;
    update(ref(database), updates);
    
    // Add room to user's created and joined rooms
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
    const found = state.rooms.find((r) => r.id === code || r.invite === code);
    if (found) {
      setRoom(found.id);
      setView("room");
      
      // Add to user's joined rooms
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
      author: user.display || user.id,
      authorId: user.id, // Track comment creator
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
    
    const isCreator = comment.authorId === user.id;
    const isRoomModerator = isRoomMod(post.room);
    
    if (!user.isAdmin && !isCreator && !isRoomModerator) {
      alert("YOU CAN ONLY DELETE YOUR OWN COMMENTS");
      return;
    }
    
    if (!confirm("DELETE THIS COMMENT?")) return;
    
    // Remove comment and all its replies
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
    
    const isCreator = post.authorId === user.id;
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
    const room = state.rooms.find(r => r.id === roomId);
    return room?.creator === user.id;
  }

  function enterRoom(roomId) {
    setRoom(roomId);
    setView("room");
  }

  function removeRoom(roomId) {
    const roomToDelete = state.rooms.find(r => r.id === roomId);
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

  function saveProfile(updatedUser) {
    setUser(updatedUser);
    saveUser(updatedUser);
  }

  function generateInviteCode() {
    if (user.inviteCodesRemaining <= 0 && !user.isAdmin) {
      alert("NO INVITE CODES REMAINING");
      return null;
    }

    const code = genAnonId(8).toUpperCase();
    const inviteData = {
      used: false,
      createdBy: user.id,
      usedBy: null,
      created: now()
    };

    const updates = {};
    updates[`appState/inviteCodes/${code}`] = inviteData;
    update(ref(database), updates);

    // Update user's remaining codes and created list
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

  function redeemInviteCode(code) {
    const upperCode = code.toUpperCase().trim();
    const inviteData = state.inviteCodes?.[upperCode];

    if (!inviteData) {
      alert("INVALID INVITE CODE");
      return false;
    }

    if (inviteData.used) {
      alert("INVITE CODE ALREADY USED");
      return false;
    }

    // Mark code as used
    const updates = {};
    updates[`appState/inviteCodes/${upperCode}/used`] = true;
    updates[`appState/inviteCodes/${upperCode}/usedBy`] = user.id;
    updates[`appState/users/${user.id}`] = {
      id: user.id,
      invitedBy: inviteData.createdBy,
      joinedAt: now()
    };
    update(ref(database), updates);

    // Grant access to user and give them invite codes
    setUser((prev) => {
      const u = {
        ...prev,
        hasAccess: true,
        inviteCodesRemaining: 3 // Each new user gets 3 invites
      };
      saveUser(u);
      return u;
    });

    return true;
  }

  async function syncFromToken(token) {
    try {
      const upperToken = token.toUpperCase().trim();
      const tokenRef = ref(database, `appState/syncTokens/${upperToken}`);
      
      return new Promise((resolve) => {
        onValue(tokenRef, async (snapshot) => {
          const tokenData = snapshot.val();
          
          if (!tokenData) {
            alert("INVALID SYNC TOKEN");
            resolve(false);
            return;
          }

          if (tokenData.used) {
            alert("SYNC TOKEN ALREADY USED");
            resolve(false);
            return;
          }

          if (tokenData.expiresAt < now()) {
            alert("SYNC TOKEN EXPIRED");
            resolve(false);
            return;
          }

          // Token is valid! Load user data from Firebase
          const userRef = ref(database, `users/${tokenData.firebaseUID}`);
          onValue(userRef, (userSnapshot) => {
            const syncedUserData = userSnapshot.val();
            
            if (syncedUserData) {
              // Mark token as used
              const updates = {};
              updates[`appState/syncTokens/${upperToken}/used`] = true;
              updates[`appState/syncTokens/${upperToken}/usedAt`] = now();
              update(ref(database), updates);

              // Sync the user data
              setUser(syncedUserData);
              saveUser(syncedUserData);
              alert("ACCOUNT SYNCED SUCCESSFULLY!");
              resolve(true);
            } else {
              alert("USER DATA NOT FOUND");
              resolve(false);
            }
          }, { onlyOnce: true });
        }, { onlyOnce: true });
      });
    } catch (error) {
      console.error("Sync error:", error);
      alert("SYNC FAILED");
      return false;
    }
  }

  function generateSyncToken() {
    if (!firebaseUser) {
      alert("PLEASE WAIT, LOADING...");
      return null;
    }

    const token = genAnonId(8).toUpperCase();
    const expiresAt = now() + (24 * 60 * 60 * 1000); // 24 hours

    const tokenData = {
      firebaseUID: firebaseUser.uid,
      used: false,
      created: now(),
      expiresAt: expiresAt
    };

    const updates = {};
    updates[`appState/syncTokens/${token}`] = tokenData;
    update(ref(database), updates);

    return token;
  }

  function handleAdminLogout() {
    setUser((prev) => {
      const u = { ...prev, isAdmin: false };
      saveUser(u);
      return u;
    });
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
    const currentRoom = state.rooms.find(r => r.id === room);
    
    // Check if room is creator-only and user is not the creator
    if (currentRoom?.creatorOnly && currentRoom.creator !== user.id && !user.isAdmin) {
      alert("ONLY THE ROOM CREATOR CAN POST IN THIS ROOM");
      return;
    }
    
    const postId = crypto.randomUUID();
    const post = {
      id: postId,
      author: user.display || user.id,
      authorId: user.id, // Store actual user ID for ownership checking
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
    
    // Track this post as created by user
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
    const r = state.rooms.find(r => r.id === room);
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
    // Always respect the user's layout choice on all screen sizes
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
          <div className="text-xl font-light tracking-widest">PIN-ANON</div>
          <div className="text-xs tracking-widest mt-2" style={{ color: getColor('textMuted') }}>
            LOADING...
          </div>
        </div>
      </div>
    );
  }

  // Invite gate - show if user doesn't have access
  if (!user.hasAccess && !user.isAdmin) {
    return <InviteGate onRedeem={redeemInviteCode} onSync={syncFromToken} getColor={getColor} />;
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
                PIN-ANON
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
              {!user.isAdmin ? (
                <button
                  onClick={handleAdminLogin}
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
                  LOGIN
                </button>
              ) : (
                <button
                  onClick={handleAdminLogout}
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
                  LOGOUT
                </button>
              )}
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
                  fontSize: '10px',
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
                rooms={state.rooms}
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

              <button
                onClick={() => setShowNew(true)}
                style={{
                  fontSize: '10px',
                  letterSpacing: '0.15em',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: dark ? '#fff' : '#000',
                  marginLeft: 'auto',
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.opacity = '0.5'}
                onMouseLeave={(e) => e.target.style.opacity = '1'}
              >
                NEW POST
              </button>
            </div>
          )}
        </header>

        {view === "home" ? (
          <HomePage
            rooms={state.rooms}
            posts={state.posts}
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
          <>
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
                      <div style={{ display: 'flex', gap: '15px', alignItems: 'baseline', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => setProfileView(post.author)}
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
                          {post.author.toUpperCase()}
                        </button>
                        {!whisper && (
                          <div style={{ 
                            fontSize: '9px',
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
                        {(user.isAdmin || post.authorId === user.id || isRoomMod(post.room)) && (
                          <button
                            onClick={() => removePost(post.id)}
                            style={{
                              fontSize: '9px',
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
                              <source src={post.videoUrl} />
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
                        isRoomMod={isRoomMod(post.room)}
                        setProfileView={setProfileView}
                      />
                    </div>
                  </article>
                ))}
              </section>
            </main>
          </>
        )}
      </div>

      {showNew && (
        <NewPostModal
          onClose={() => setShowNew(false)}
          onPost={postNew}
          dark={dark}
        />
      )}
      {profileView && (
        <ProfileModal
          authorId={profileView}
          posts={state.posts.filter((p) => p.author === profileView)}
          onClose={() => setProfileView(null)}
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
          onGenerateSyncToken={generateSyncToken}
          setShowProfileEdit={setShowProfileEdit}
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
    </div>
  );
}

// ---------- UI Subcomponents ----------

function InviteGate({ onRedeem, onSync, getColor }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState("invite"); // "invite" or "sync"

  const handleSubmit = () => {
    if (!code.trim()) {
      setError("PLEASE ENTER A CODE");
      return;
    }
    
    if (mode === "invite") {
      const success = onRedeem(code);
      if (!success) {
        setError("INVALID OR USED CODE");
        setCode("");
      }
    } else {
      const success = onSync(code);
      if (!success) {
        setError("INVALID SYNC CODE");
        setCode("");
      }
    }
  };

  const handleAdminBypass = () => {
    const password = prompt("ENTER ADMIN PASSWORD:");
    if (password === "EpicMan101") {
      // Bypass invite gate with admin access
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
        maxWidth: '400px',
        width: '100%',
        textAlign: 'center'
      }}>
        <div style={{
          fontSize: '32px',
          fontWeight: '300',
          letterSpacing: '0.15em',
          marginBottom: '10px',
          color: getColor('text')
        }}>
          PIN-ANON
        </div>
        <div style={{
          fontSize: '10px',
          letterSpacing: '0.2em',
          color: getColor('textMuted'),
          marginBottom: '60px'
        }}>
          ANONYMOUS ARCHIVE
        </div>

        <div style={{
          fontSize: '11px',
          letterSpacing: '0.1em',
          color: getColor('textMuted'),
          marginBottom: '30px',
          lineHeight: '1.6'
        }}>
          THIS IS AN INVITE-ONLY COMMUNITY
          <br />
          {mode === "invite" ? "ENTER YOUR INVITE CODE TO CONTINUE" : "SYNC YOUR EXISTING ACCOUNT"}
        </div>

        {/* Tab Switcher */}
        <div style={{
          display: 'flex',
          marginBottom: '20px',
          border: `1px solid ${getColor('border')}`,
          overflow: 'hidden'
        }}>
          <button
            onClick={() => {
              setMode("invite");
              setCode("");
              setError("");
            }}
            style={{
              flex: 1,
              fontSize: '10px',
              letterSpacing: '0.1em',
              padding: '12px',
              backgroundColor: mode === "invite" ? getColor('text') : 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: mode === "invite" ? getColor('bg') : getColor('textMuted'),
              transition: 'all 0.2s',
              fontFamily: 'Helvetica Neue, Arial, sans-serif'
            }}
          >
            INVITE CODE
          </button>
          <button
            onClick={() => {
              setMode("sync");
              setCode("");
              setError("");
            }}
            style={{
              flex: 1,
              fontSize: '10px',
              letterSpacing: '0.1em',
              padding: '12px',
              backgroundColor: mode === "sync" ? getColor('text') : 'transparent',
              border: 'none',
              borderLeft: `1px solid ${getColor('border')}`,
              cursor: 'pointer',
              color: mode === "sync" ? getColor('bg') : getColor('textMuted'),
              transition: 'all 0.2s',
              fontFamily: 'Helvetica Neue, Arial, sans-serif'
            }}
          >
            SYNC ACCOUNT
          </button>
        </div>

        <input
          value={code}
          onChange={(e) => {
            setCode(mode === "invite" ? e.target.value.toUpperCase() : e.target.value);
            setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
          }}
          placeholder={mode === "invite" ? "INVITE CODE" : "SYNC CODE"}
          style={{
            width: '100%',
            fontSize: mode === "sync" ? '11px' : '14px',
            letterSpacing: mode === "sync" ? '0.05em' : '0.2em',
            padding: '15px',
            marginBottom: '20px',
            background: 'none',
            border: `2px solid ${error ? '#ff4444' : getColor('border')}`,
            outline: 'none',
            color: getColor('text'),
            textAlign: 'center',
            fontFamily: 'Helvetica Neue, Arial, sans-serif',
            textTransform: mode === "invite" ? 'uppercase' : 'none',
            boxSizing: 'border-box'
          }}
        />

        {error && (
          <div style={{
            fontSize: '10px',
            letterSpacing: '0.1em',
            color: '#ff4444',
            marginBottom: '20px'
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          style={{
            width: '100%',
            fontSize: '11px',
            letterSpacing: '0.15em',
            padding: '15px',
            backgroundColor: getColor('text'),
            border: 'none',
            cursor: 'pointer',
            color: getColor('bg'),
            transition: 'opacity 0.2s',
            fontFamily: 'Helvetica Neue, Arial, sans-serif',
            marginBottom: '20px'
          }}
          onMouseEnter={(e) => e.target.style.opacity = '0.8'}
          onMouseLeave={(e) => e.target.style.opacity = '1'}
        >
          {mode === "invite" ? "ENTER" : "SYNC ACCOUNT"}
        </button>

        {mode === "sync" && (
          <div style={{
            fontSize: '9px',
            letterSpacing: '0.05em',
            color: getColor('textDim'),
            lineHeight: '1.5',
            marginBottom: '20px'
          }}>
            Find your sync code in Settings → Account Sync
          </div>
        )}

        {/* Hidden admin login - triple click to reveal */}
        <div 
          onClick={(e) => {
            if (e.detail === 3) { // Triple click
              handleAdminBypass();
            }
          }}
          style={{
            fontSize: '8px',
            letterSpacing: '0.1em',
            color: getColor('borderDim'),
            cursor: 'default',
            userSelect: 'none'
          }}
        >
          •
        </div>
      </div>
    </div>
  );
}

function HomePage({ rooms, posts, onEnterRoom, onCreateRoom, onJoinRoom, dark, userJoinedRooms }) {
  const [scrollPositions, setScrollPositions] = useState({});

  // Show main room, public rooms, and rooms user has joined
  const visibleRooms = rooms.filter(r => 
    r.id === DEFAULT_ROOM || 
    !r.isPrivate || 
    (userJoinedRooms || []).includes(r.id)
  );

  const getRoomPosts = (roomId) => {
    return (posts || [])
      .filter(p => p.room === roomId)
      .sort((a, b) => b.created - a.created)
      .slice(0, 10);
  };

  const getRoomActivity = (roomId) => {
    const roomPosts = (posts || []).filter(p => p.room === roomId);
    if (roomPosts.length === 0) return 0;
    // Return the timestamp of the most recent post
    return Math.max(...roomPosts.map(p => p.created));
  };

  // Sort rooms by most recent activity
  const sortedRooms = [...visibleRooms].sort((a, b) => {
    const activityA = getRoomActivity(a.id);
    const activityB = getRoomActivity(b.id);
    // Main room always stays on top
    if (a.id === DEFAULT_ROOM) return -1;
    if (b.id === DEFAULT_ROOM) return 1;
    return activityB - activityA;
  });

  const handleScroll = (roomId, e) => {
    setScrollPositions(prev => ({
      ...prev,
      [roomId]: e.target.scrollLeft
    }));
  };

  return (
    <div>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '40px',
        flexWrap: 'wrap',
        gap: '20px'
      }}>
        <div style={{
          fontSize: '12px',
          letterSpacing: '0.15em',
          color: dark ? '#fff' : '#000'
        }}>
          EXPLORE ROOMS
        </div>
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          <button
            onClick={onCreateRoom}
            style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              padding: '8px 16px',
              backgroundColor: dark ? '#fff' : '#000',
              border: `1px solid ${dark ? '#fff' : '#000'}`,
              cursor: 'pointer',
              color: dark ? '#000' : '#fff',
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.7'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
          >
            + CREATE ROOM
          </button>
          <button
            onClick={onJoinRoom}
            style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              padding: '8px 16px',
              background: 'none',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              cursor: 'pointer',
              color: dark ? '#999' : '#666',
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.5'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
          >
            JOIN WITH CODE
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '60px' }}>
        {sortedRooms.map((room) => {
          const roomPosts = getRoomPosts(room.id);
          return (
            <div key={room.id}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '20px',
                flexWrap: 'wrap',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h2 style={{
                    fontSize: '14px',
                    letterSpacing: '0.1em',
                    fontWeight: '300',
                    margin: 0,
                    color: dark ? '#fff' : '#000'
                  }}>
                    {room.name.toUpperCase()}
                  </h2>
                  {room.isPrivate && (
                    <span style={{ fontSize: '12px' }}>🔒</span>
                  )}
                </div>
                <button
                  onClick={() => onEnterRoom(room.id)}
                  style={{
                    fontSize: '9px',
                    letterSpacing: '0.1em',
                    padding: '6px 12px',
                    background: 'none',
                    border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                    cursor: 'pointer',
                    color: dark ? '#999' : '#666',
                    transition: 'opacity 0.2s',
                    whiteSpace: 'nowrap'
                  }}
                  onMouseEnter={(e) => e.target.style.opacity = '0.5'}
                  onMouseLeave={(e) => e.target.style.opacity = '1'}
                >
                  VIEW ALL →
                </button>
              </div>

              {roomPosts.length === 0 ? (
                <div style={{
                  padding: '40px 20px',
                  textAlign: 'center',
                  fontSize: '10px',
                  letterSpacing: '0.1em',
                  color: dark ? '#666' : '#999',
                  border: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`
                }}>
                  NO POSTS YET
                </div>
              ) : (
                <div 
                  onScroll={(e) => handleScroll(room.id, e)}
                  style={{
                    display: 'flex',
                    gap: '20px',
                    overflowX: 'auto',
                    overflowY: 'hidden',
                    paddingBottom: '10px',
                    scrollbarWidth: 'thin',
                    scrollbarColor: `${dark ? '#333' : '#ccc'} transparent`,
                    WebkitOverflowScrolling: 'touch'
                  }}
                >
                  {roomPosts.map((post) => (
                    <div
                      key={post.id}
                      onClick={() => onEnterRoom(room.id)}
                      style={{
                        minWidth: '280px',
                        maxWidth: '280px',
                        padding: '15px',
                        border: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
                        cursor: 'pointer',
                        transition: 'border-color 0.2s',
                        backgroundColor: dark ? '#0a0a0a' : '#fafafa'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.borderColor = dark ? '#333' : '#ccc'}
                      onMouseLeave={(e) => e.currentTarget.style.borderColor = dark ? '#1a1a1a' : '#f5f5f5'}
                    >
                      {post.image && (
                        <img
                          src={post.image}
                          style={{
                            width: '100%',
                            height: '180px',
                            objectFit: 'cover',
                            marginBottom: '12px'
                          }}
                          alt="post preview"
                        />
                      )}
                      <div style={{
                        fontSize: '10px',
                        letterSpacing: '0.05em',
                        fontWeight: '400',
                        color: dark ? '#999' : '#666',
                        marginBottom: '8px',
                        wordBreak: 'break-all'
                      }}>
                        {post.author.toUpperCase()}
                      </div>
                      <div style={{
                        fontSize: '11px',
                        lineHeight: '1.6',
                        letterSpacing: '0.02em',
                        color: dark ? '#fff' : '#000',
                        fontWeight: '300',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        wordWrap: 'break-word'
                      }}>
                        {post.text}
                      </div>
                      <div style={{
                        marginTop: '12px',
                        fontSize: '9px',
                        letterSpacing: '0.05em',
                        color: dark ? '#666' : '#999',
                        display: 'flex',
                        gap: '15px'
                      }}>
                        <span>↑ {post.votes || 0}</span>
                        <span>💬 {post.comments?.length || 0}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RoomsDropdown({ rooms, currentRoom, currentRoomName, onSelectRoom, onCreateRoom, onJoinRoom, onDeleteRoom, dark, isAdmin, userJoinedRooms, userCreatedRooms }) {
  const [open, setOpen] = useState(false);
  
  // Show: main room, public rooms, or rooms user has joined
  const visibleRooms = rooms.filter(r => 
    r.id === DEFAULT_ROOM || 
    !r.isPrivate || 
    (userJoinedRooms || []).includes(r.id)
  );

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          fontSize: '10px',
          letterSpacing: '0.15em',
          background: 'none',
          border: 'none',
          borderBottom: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
          cursor: 'pointer',
          color: dark ? '#fff' : '#000',
          padding: '8px 0',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          maxWidth: '200px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentRoomName.toUpperCase()}</span>
        <span style={{ fontSize: '8px', flexShrink: 0 }}>▼</span>
      </button>

      {open && (
        <>
          <div 
            style={{ 
              position: 'fixed', 
              inset: 0, 
              zIndex: 10 
            }}
            onClick={() => setOpen(false)}
          />
          <div style={{
            position: 'absolute',
            right: 0,
            marginTop: '10px',
            backgroundColor: dark ? '#0a0a0a' : '#fff',
            border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
            padding: '10px',
            zIndex: 20,
            minWidth: '200px',
            maxWidth: '300px'
          }}>
            <div style={{ 
              marginBottom: '10px', 
              paddingBottom: '10px', 
              borderBottom: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}` 
            }}>
              <button
                onClick={() => {
                  onCreateRoom();
                  setOpen(false);
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  fontSize: '10px',
                  letterSpacing: '0.1em',
                  padding: '8px 10px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: dark ? '#999' : '#666',
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.opacity = '0.5'}
                onMouseLeave={(e) => e.target.style.opacity = '1'}
              >
                + CREATE ROOM
              </button>
              <button
                onClick={() => {
                  onJoinRoom();
                  setOpen(false);
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  fontSize: '10px',
                  letterSpacing: '0.1em',
                  padding: '8px 10px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: dark ? '#999' : '#666',
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.opacity = '0.5'}
                onMouseLeave={(e) => e.target.style.opacity = '1'}
              >
                JOIN ROOM
              </button>
            </div>

            <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
              {visibleRooms.map((r) => {
                const isCreator = (userCreatedRooms || []).includes(r.id);
                return (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <button
                      onClick={() => {
                        onSelectRoom(r.id);
                        setOpen(false);
                      }}
                      style={{
                        flex: 1,
                        textAlign: 'left',
                        fontSize: '10px',
                        letterSpacing: '0.1em',
                        padding: '8px 10px',
                        background: r.id === currentRoom ? (dark ? '#1a1a1a' : '#f5f5f5') : 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: r.id === currentRoom ? (dark ? '#fff' : '#000') : (dark ? '#999' : '#666'),
                        transition: 'opacity 0.2s',
                        wordBreak: 'break-word',
                        overflowWrap: 'break-word'
                      }}
                      onMouseEnter={(e) => e.target.style.opacity = '0.5'}
                      onMouseLeave={(e) => e.target.style.opacity = '1'}
                    >
                      {r.name.toUpperCase()}{isCreator ? ' ★' : ''}{r.isPrivate ? ' 🔒' : ''}
                    </button>
                    {(isAdmin || isCreator) && r.id !== DEFAULT_ROOM && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteRoom(r.id);
                        }}
                        style={{
                          fontSize: '10px',
                          padding: '4px 8px',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: dark ? '#666' : '#999',
                          transition: 'opacity 0.2s',
                          flexShrink: 0
                        }}
                        onMouseEnter={(e) => e.target.style.opacity = '0.5'}
                        onMouseLeave={(e) => e.target.style.opacity = '1'}
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function NewPostModal({ onClose, onPost, dark }) {
  const [text, setText] = useState("");
  const [img, setImg] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);

  const CLOUDINARY_CLOUD_NAME = "dnulbfj48";
  const CLOUDINARY_UPLOAD_PRESET = "pin-anon-uploads";

  async function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert("IMAGE TOO LARGE");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        { method: "POST", body: formData }
      );
      const data = await response.json();
      if (data.secure_url) {
        setImg(data.secure_url);
      } else {
        throw new Error("Upload failed");
      }
      setUploading(false);
    } catch (error) {
      console.error("Upload error:", error);
      alert("FAILED TO UPLOAD IMAGE");
      setUploading(false);
    }
  }

  async function handleVideoFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) { // 100MB limit for video
      alert("VIDEO TOO LARGE (MAX 100MB)");
      return;
    }
    setUploadingVideo(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
      formData.append("resource_type", "video");
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`,
        { method: "POST", body: formData }
      );
      const data = await response.json();
      if (data.secure_url) {
        setVideoUrl(data.secure_url);
      } else {
        throw new Error("Upload failed");
      }
      setUploadingVideo(false);
    } catch (error) {
      console.error("Upload error:", error);
      alert("FAILED TO UPLOAD VIDEO");
      setUploadingVideo(false);
    }
  }

  async function handleAudioFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { // 50MB limit for audio
      alert("AUDIO TOO LARGE (MAX 50MB)");
      return;
    }
    setUploadingAudio(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
      formData.append("resource_type", "video"); // Cloudinary uses 'video' for audio too
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`,
        { method: "POST", body: formData }
      );
      const data = await response.json();
      if (data.secure_url) {
        setAudioUrl(data.secure_url);
      } else {
        throw new Error("Upload failed");
      }
      setUploadingAudio(false);
    } catch (error) {
      console.error("Upload error:", error);
      alert("FAILED TO UPLOAD AUDIO");
      setUploadingAudio(false);
    }
  }

  function submit() {
    if (!text.trim() && !img && !videoUrl && !audioUrl) return;
    onPost({ 
      text: text.trim(), 
      image: img || null,
      videoUrl: videoUrl.trim() || null,
      audioUrl: audioUrl.trim() || null
    });
    onClose();
    setText("");
    setImg("");
    setVideoUrl("");
    setAudioUrl("");
  }

  return (
    <div style={{ 
      position: 'fixed', 
      inset: 0, 
      zIndex: 50, 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.8)',
      padding: '20px',
      overflowY: 'auto'
    }}>
      <div style={{
        maxWidth: '600px',
        width: '100%',
        backgroundColor: dark ? '#0a0a0a' : '#fff',
        border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
        padding: '40px 20px',
        fontFamily: 'Helvetica Neue, Arial, sans-serif'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', paddingLeft: '20px', paddingRight: '20px' }}>
          <h3 style={{ 
            fontSize: '12px', 
            letterSpacing: '0.15em',
            fontWeight: '300',
            color: dark ? '#fff' : '#000'
          }}>
            NEW POST
          </h3>
          <button 
            onClick={onClose}
            style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: dark ? '#999' : '#666',
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.5'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
          >
            CLOSE
          </button>
        </div>

        <div style={{ paddingLeft: '20px', paddingRight: '20px' }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="TEXT"
            style={{
              width: '100%',
              height: '120px',
              padding: '15px',
              marginBottom: '20px',
              fontSize: '12px',
              letterSpacing: '0.05em',
              fontWeight: '300',
              lineHeight: '1.6',
              background: 'none',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              outline: 'none',
              resize: 'none',
              color: dark ? '#fff' : '#000',
              fontFamily: 'Helvetica Neue, Arial, sans-serif',
              boxSizing: 'border-box'
            }}
          />

          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', gap: '15px', marginBottom: '15px', flexWrap: 'wrap' }}>
              <label style={{
                fontSize: '10px',
                letterSpacing: '0.1em',
                padding: '10px 15px',
                border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                cursor: uploading ? 'not-allowed' : 'pointer',
                color: uploading ? (dark ? '#333' : '#ccc') : (dark ? '#fff' : '#000'),
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={(e) => !uploading && (e.target.style.opacity = '0.5')}
              onMouseLeave={(e) => e.target.style.opacity = '1'}
              >
                {uploading ? "UPLOADING..." : "CHOOSE IMAGE"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFile}
                  disabled={uploading}
                  style={{ display: 'none' }}
                />
              </label>
              
              <label style={{
                fontSize: '10px',
                letterSpacing: '0.1em',
                padding: '10px 15px',
                border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                cursor: uploadingVideo ? 'not-allowed' : 'pointer',
                color: uploadingVideo ? (dark ? '#333' : '#ccc') : (dark ? '#fff' : '#000'),
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={(e) => !uploadingVideo && (e.target.style.opacity = '0.5')}
              onMouseLeave={(e) => e.target.style.opacity = '1'}
              >
                {uploadingVideo ? "UPLOADING..." : "CHOOSE VIDEO"}
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleVideoFile}
                  disabled={uploadingVideo}
                  style={{ display: 'none' }}
                />
              </label>
              
              <label style={{
                fontSize: '10px',
                letterSpacing: '0.1em',
                padding: '10px 15px',
                border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                cursor: uploadingAudio ? 'not-allowed' : 'pointer',
                color: uploadingAudio ? (dark ? '#333' : '#ccc') : (dark ? '#fff' : '#000'),
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={(e) => !uploadingAudio && (e.target.style.opacity = '0.5')}
              onMouseLeave={(e) => e.target.style.opacity = '1'}
              >
                {uploadingAudio ? "UPLOADING..." : "CHOOSE AUDIO"}
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleAudioFile}
                  disabled={uploadingAudio}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
            
            <input
              value={img}
              onChange={(e) => setImg(e.target.value)}
              placeholder="OR PASTE IMAGE URL"
              disabled={uploading}
              style={{
                width: '100%',
                padding: '10px 0',
                fontSize: '10px',
                letterSpacing: '0.1em',
                background: 'none',
                border: 'none',
                borderBottom: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                outline: 'none',
                color: dark ? '#fff' : '#000',
                boxSizing: 'border-box'
              }}
            />
            
            {img && !uploading && (
              <div style={{ marginTop: '20px', position: 'relative' }}>
                <img 
                  src={img} 
                  alt="preview" 
                  style={{ 
                    width: '100%',
                    maxHeight: '300px',
                    objectFit: 'contain'
                  }}
                />
                <button
                  onClick={() => setImg("")}
                  style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    fontSize: '9px',
                    letterSpacing: '0.1em',
                    padding: '6px 10px',
                    backgroundColor: dark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)',
                    border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                    cursor: 'pointer',
                    color: dark ? '#fff' : '#000',
                    transition: 'opacity 0.2s'
                  }}
                  onMouseEnter={(e) => e.target.style.opacity = '0.5'}
                  onMouseLeave={(e) => e.target.style.opacity = '1'}
                >
                  REMOVE
                </button>
              </div>
            )}
            
            <input
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="VIDEO URL (YOUTUBE OR DIRECT LINK)"
              style={{
                width: '100%',
                padding: '10px 0',
                fontSize: '10px',
                letterSpacing: '0.1em',
                background: 'none',
                border: 'none',
                borderBottom: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                outline: 'none',
                color: dark ? '#fff' : '#000',
                boxSizing: 'border-box',
                marginTop: '15px'
              }}
            />
            
            <input
              value={audioUrl}
              onChange={(e) => setAudioUrl(e.target.value)}
              placeholder="AUDIO URL"
              style={{
                width: '100%',
                padding: '10px 0',
                fontSize: '10px',
                letterSpacing: '0.1em',
                background: 'none',
                border: 'none',
                borderBottom: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                outline: 'none',
                color: dark ? '#fff' : '#000',
                boxSizing: 'border-box',
                marginTop: '15px'
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', flexWrap: 'wrap' }}>
            <button
              onClick={onClose}
              disabled={uploading}
              style={{
                fontSize: '10px',
                letterSpacing: '0.1em',
                padding: '10px 20px',
                background: 'none',
                border: 'none',
                cursor: uploading ? 'not-allowed' : 'pointer',
                color: dark ? '#666' : '#999',
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={(e) => !uploading && (e.target.style.opacity = '0.5')}
              onMouseLeave={(e) => e.target.style.opacity = '1'}
            >
              CANCEL
            </button>
            <button
              onClick={submit}
              disabled={uploading || (!text.trim() && !img)}
              style={{
                fontSize: '10px',
                letterSpacing: '0.1em',
                padding: '10px 20px',
                backgroundColor: (uploading || (!text.trim() && !img)) ? 'transparent' : (dark ? '#fff' : '#000'),
                border: `1px solid ${(uploading || (!text.trim() && !img)) ? (dark ? '#333' : '#e5e5e5') : (dark ? '#fff' : '#000')}`,
                cursor: (uploading || (!text.trim() && !img)) ? 'not-allowed' : 'pointer',
                color: (uploading || (!text.trim() && !img)) ? (dark ? '#333' : '#ccc') : (dark ? '#000' : '#fff'),
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={(e) => !(uploading || (!text.trim() && !img)) && (e.target.style.opacity = '0.7')}
              onMouseLeave={(e) => e.target.style.opacity = '1'}
            >
              {uploading ? "UPLOADING..." : "POST"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CommentBlock({ post, addComment, removeComment, whisper, dark, user, isRoomMod, setProfileView }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  const buildCommentTree = (comments) => {
    const commentMap = {};
    const roots = [];
    comments.forEach(comment => {
      commentMap[comment.id] = { ...comment, replies: [] };
    });
    comments.forEach(comment => {
      if (comment.parentId && commentMap[comment.parentId]) {
        commentMap[comment.parentId].replies.push(commentMap[comment.id]);
      } else {
        roots.push(commentMap[comment.id]);
      }
    });
    return roots;
  };

  const commentTree = buildCommentTree(post.comments || []);

  return (
    <div>
      <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{
            fontSize: '10px',
            letterSpacing: '0.1em',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: dark ? '#999' : '#666',
            transition: 'opacity 0.2s'
          }}
          onMouseEnter={(e) => e.target.style.opacity = '0.5'}
          onMouseLeave={(e) => e.target.style.opacity = '1'}
        >
          {(post.comments || []).length} {open ? '' : 'COMMENTS'}
        </button>
        {!whisper && !open && post.comments?.length === 0 && (
          <div style={{ 
            fontSize: '9px',
            letterSpacing: '0.1em',
            color: dark ? '#666' : '#999'
          }}>
            BE THE FIRST TO COMMENT
          </div>
        )}
      </div>

      {open && (
        <div style={{ 
          marginTop: '25px',
          paddingLeft: '20px',
          borderLeft: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
          display: 'flex',
          flexDirection: 'column',
          gap: '20px'
        }}>
          {commentTree.map((comment) => (
            <CommentThread 
              key={comment.id} 
              comment={comment} 
              postId={post.id}
              addComment={addComment}
              removeComment={removeComment}
              dark={dark}
              user={user}
              isRoomMod={isRoomMod}
              setProfileView={setProfileView}
              depth={0}
            />
          ))}

          <div style={{ display: 'flex', gap: '10px', paddingTop: '10px', flexWrap: 'wrap' }}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && text.trim()) {
                  e.preventDefault();
                  addComment(post.id, text, null);
                  setText("");
                }
              }}
              placeholder="ADD A COMMENT..."
              style={{
                flex: 1,
                minWidth: '200px',
                fontSize: '10px',
                letterSpacing: '0.05em',
                padding: '8px 0',
                background: 'none',
                border: 'none',
                borderBottom: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                outline: 'none',
                color: dark ? '#fff' : '#000'
              }}
            />
            <button
              onClick={() => {
                if (text.trim()) {
                  addComment(post.id, text, null);
                  setText("");
                }
              }}
              disabled={!text.trim()}
              style={{
                fontSize: '9px',
                letterSpacing: '0.1em',
                padding: '8px 15px',
                backgroundColor: text.trim() ? (dark ? '#fff' : '#000') : 'transparent',
                border: `1px solid ${text.trim() ? (dark ? '#fff' : '#000') : (dark ? '#333' : '#e5e5e5')}`,
                cursor: text.trim() ? 'pointer' : 'not-allowed',
                color: text.trim() ? (dark ? '#000' : '#fff') : (dark ? '#333' : '#ccc'),
                transition: 'opacity 0.2s',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => text.trim() && (e.target.style.opacity = '0.7')}
              onMouseLeave={(e) => e.target.style.opacity = '1'}
            >
              REPLY
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CommentThread({ comment, postId, addComment, removeComment, dark, user, isRoomMod, depth, setProfileView }) {
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  const handleReply = () => {
    if (replyText.trim()) {
      addComment(postId, replyText, comment.id);
      setReplyText("");
      setShowReplyBox(false);
    }
  };
  
  const canDelete = user.isAdmin || comment.authorId === user.id || isRoomMod;

  return (
    <div style={{ wordWrap: 'break-word', overflowWrap: 'break-word' }}>
      <div style={{ display: 'flex', gap: '10px' }}>
        {comment.replies?.length > 0 && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{
              fontSize: '9px',
              width: '16px',
              height: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: dark ? '#666' : '#999',
              flexShrink: 0,
              marginTop: '2px'
            }}
          >
            {collapsed ? "+" : "−"}
          </button>
        )}
        
        <div style={{ flex: 1, minWidth: 0 }}>
          {!collapsed && (
            <>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '8px', flexWrap: 'wrap', alignItems: 'baseline' }}>
                <button
                  onClick={() => setProfileView(comment.author)}
                  style={{
                    fontSize: '10px',
                    letterSpacing: '0.05em',
                    fontWeight: '400',
                    color: dark ? '#999' : '#666',
                    wordBreak: 'break-all',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: 0
                  }}
                >
                  {comment.author.toUpperCase()}
                </button>
                <span style={{
                  fontSize: '9px',
                  letterSpacing: '0.05em',
                  color: dark ? '#666' : '#999'
                }}>
                  •
                </span>
                <span style={{
                  fontSize: '9px',
                  letterSpacing: '0.05em',
                  color: dark ? '#666' : '#999'
                }}>
                  {new Date(comment.created).toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: '2-digit', 
                    day: '2-digit' 
                  }).toUpperCase()}
                </span>
              </div>
              
              <div style={{
                fontSize: '11px',
                lineHeight: '1.6',
                letterSpacing: '0.02em',
                marginBottom: '12px',
                color: dark ? '#fff' : '#000',
                fontWeight: '300',
                wordWrap: 'break-word',
                overflowWrap: 'break-word'
              }}>
                {comment.text}
              </div>

              <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setShowReplyBox(!showReplyBox)}
                  style={{
                    fontSize: '9px',
                    letterSpacing: '0.1em',
                    padding: '4px 8px',
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
                  REPLY
                </button>
                {canDelete && (
                  <button
                    onClick={() => removeComment(postId, comment.id)}
                    style={{
                      fontSize: '9px',
                      letterSpacing: '0.1em',
                      padding: '4px 8px',
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
                {comment.replies?.length > 0 && (
                  <span style={{
                    fontSize: '9px',
                    letterSpacing: '0.05em',
                    color: dark ? '#666' : '#999'
                  }}>
                    {comment.replies.length} {comment.replies.length === 1 ? 'REPLY' : 'REPLIES'}
                  </span>
                )}
              </div>

              {showReplyBox && (
                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
                  <input
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && replyText.trim()) {
                        e.preventDefault();
                        handleReply();
                      }
                      if (e.key === 'Escape') {
                        setShowReplyBox(false);
                        setReplyText("");
                      }
                    }}
                    placeholder={`REPLY TO ${comment.author.toUpperCase()}...`}
                    autoFocus
                    style={{
                      flex: 1,
                      minWidth: '200px',
                      fontSize: '10px',
                      letterSpacing: '0.05em',
                      padding: '8px 0',
                      background: 'none',
                      border: 'none',
                      borderBottom: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                      outline: 'none',
                      color: dark ? '#fff' : '#000'
                    }}
                  />
                  <button
                    onClick={handleReply}
                    disabled={!replyText.trim()}
                    style={{
                      fontSize: '9px',
                      letterSpacing: '0.1em',
                      padding: '6px 12px',
                      backgroundColor: replyText.trim() ? (dark ? '#fff' : '#000') : 'transparent',
                      border: `1px solid ${replyText.trim() ? (dark ? '#fff' : '#000') : (dark ? '#333' : '#e5e5e5')}`,
                      cursor: replyText.trim() ? 'pointer' : 'not-allowed',
                      color: replyText.trim() ? (dark ? '#000' : '#fff') : (dark ? '#333' : '#ccc'),
                      transition: 'opacity 0.2s',
                      whiteSpace: 'nowrap'
                    }}
                    onMouseEnter={(e) => replyText.trim() && (e.target.style.opacity = '0.7')}
                    onMouseLeave={(e) => e.target.style.opacity = '1'}
                  >
                    REPLY
                  </button>
                </div>
              )}
            </>
          )}

          {collapsed && (
            <div style={{
              fontSize: '9px',
              padding: '4px 0',
              letterSpacing: '0.05em',
              color: dark ? '#666' : '#999'
            }}>
              {comment.author.toUpperCase()} • {comment.replies.length} {comment.replies.length === 1 ? 'REPLY' : 'REPLIES'} HIDDEN
            </div>
          )}

          {!collapsed && comment.replies?.length > 0 && (
            <div style={{ 
              marginTop: '15px',
              paddingLeft: '20px',
              borderLeft: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
              display: 'flex',
              flexDirection: 'column',
              gap: '20px'
            }}>
              {comment.replies.map((reply) => (
                <CommentThread
                  key={reply.id}
                  comment={reply}
                  postId={postId}
                  addComment={addComment}
                  removeComment={removeComment}
                  dark={dark}
                  user={user}
                  isRoomMod={isRoomMod}
                  setProfileView={setProfileView}
                  depth={depth + 1}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileModal({ authorId, posts, onClose, dark }) {
  return (
    <div style={{ 
      position: 'fixed', 
      inset: 0, 
      zIndex: 60, 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.8)',
      padding: '20px',
      overflowY: 'auto'
    }}>
      <div style={{
        maxWidth: '900px',
        width: '100%',
        backgroundColor: dark ? '#0a0a0a' : '#fff',
        border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
        padding: '40px 20px',
        maxHeight: '80vh',
        overflow: 'auto',
        fontFamily: 'Helvetica Neue, Arial, sans-serif'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px', paddingLeft: '20px', paddingRight: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ 
              fontSize: '14px', 
              letterSpacing: '0.1em',
              fontWeight: '300',
              color: dark ? '#fff' : '#000',
              marginBottom: '8px',
              wordBreak: 'break-all'
            }}>
              {authorId.toUpperCase()}
            </h3>
            <div style={{ 
              fontSize: '9px',
              letterSpacing: '0.1em',
              color: dark ? '#666' : '#999'
            }}>
              {posts.length} POSTS
            </div>
          </div>
          <button 
            onClick={onClose}
            style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: dark ? '#999' : '#666',
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.5'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
          >
            CLOSE
          </button>
        </div>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', 
          gap: '20px',
          paddingLeft: '20px',
          paddingRight: '20px'
        }}>
          {posts.map((p) => (
            <div
              key={p.id}
              style={{
                padding: '15px',
                border: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
                backgroundColor: dark ? '#0a0a0a' : '#fafafa',
                wordWrap: 'break-word',
                overflowWrap: 'break-word'
              }}
            >
              {p.image && (
                <img
                  src={p.image}
                  style={{ 
                    width: '100%',
                    maxHeight: '200px',
                    objectFit: 'contain',
                    marginBottom: '10px'
                  }}
                  alt="post"
                />
              )}
              <div style={{ 
                fontSize: '11px',
                lineHeight: '1.6',
                letterSpacing: '0.02em',
                color: dark ? '#fff' : '#000',
                fontWeight: '300',
                wordWrap: 'break-word',
                overflowWrap: 'break-word'
              }}>
                {p.text}
              </div>
              <div style={{
                fontSize: '9px',
                marginTop: '10px',
                letterSpacing: '0.05em',
                color: dark ? '#666' : '#999'
              }}>
                {new Date(p.created).toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: '2-digit', 
                  day: '2-digit' 
                }).toUpperCase()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RoomModal({ onClose, onCreate, onJoin, dark }) {
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [creatorOnly, setCreatorOnly] = useState(false);

  return (
    <div style={{ 
      position: 'fixed', 
      inset: 0, 
      zIndex: 60, 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.8)',
      padding: '20px',
      overflowY: 'auto'
    }}>
      <div style={{
        maxWidth: '450px',
        width: '100%',
        backgroundColor: dark ? '#0a0a0a' : '#fff',
        border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
        padding: '40px 20px',
        fontFamily: 'Helvetica Neue, Arial, sans-serif'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', paddingLeft: '20px', paddingRight: '20px' }}>
          <h3 style={{ 
            fontSize: '12px', 
            letterSpacing: '0.15em',
            fontWeight: '300',
            color: dark ? '#fff' : '#000'
          }}>
            ROOMS
          </h3>
          <button 
            onClick={onClose}
            style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: dark ? '#999' : '#666',
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.5'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
          >
            CLOSE
          </button>
        </div>

        <div style={{ marginBottom: '25px', paddingLeft: '20px', paddingRight: '20px' }}>
          <div style={{ marginBottom: '20px', display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              color: dark ? '#fff' : '#000'
            }}>
              ROOM TYPE:
            </span>
            <button
              onClick={() => setIsPrivate(true)}
              style={{
                fontSize: '10px',
                letterSpacing: '0.1em',
                padding: '8px 16px',
                backgroundColor: isPrivate ? (dark ? '#fff' : '#000') : 'transparent',
                border: `1px solid ${dark ? '#fff' : '#000'}`,
                cursor: 'pointer',
                color: isPrivate ? (dark ? '#000' : '#fff') : (dark ? '#fff' : '#000'),
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.opacity = '0.7'}
              onMouseLeave={(e) => e.target.style.opacity = '1'}
            >
              PRIVATE
            </button>
            <button
              onClick={() => setIsPrivate(false)}
              style={{
                fontSize: '10px',
                letterSpacing: '0.1em',
                padding: '8px 16px',
                backgroundColor: !isPrivate ? (dark ? '#fff' : '#000') : 'transparent',
                border: `1px solid ${dark ? '#fff' : '#000'}`,
                cursor: 'pointer',
                color: !isPrivate ? (dark ? '#000' : '#fff') : (dark ? '#fff' : '#000'),
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.opacity = '0.7'}
              onMouseLeave={(e) => e.target.style.opacity = '1'}
            >
              PUBLIC
            </button>
          </div>

          <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
            <label style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              color: dark ? '#fff' : '#000',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={creatorOnly}
                onChange={(e) => setCreatorOnly(e.target.checked)}
                style={{
                  width: '16px',
                  height: '16px',
                  cursor: 'pointer'
                }}
              />
              CREATOR-ONLY POSTS
            </label>
          </div>
          
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="NEW ROOM NAME (OPTIONAL)"
            style={{
              width: '100%',
              fontSize: '10px',
              letterSpacing: '0.1em',
              padding: '12px 0',
              marginBottom: '20px',
              background: 'none',
              border: 'none',
              borderBottom: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              outline: 'none',
              color: dark ? '#fff' : '#000',
              boxSizing: 'border-box'
            }}
          />
          
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={() => onCreate(name, isPrivate, creatorOnly)}
              style={{
                fontSize: '10px',
                letterSpacing: '0.1em',
                padding: '12px 20px',
                backgroundColor: dark ? '#fff' : '#000',
                border: `1px solid ${dark ? '#fff' : '#000'}`,
                cursor: 'pointer',
                color: dark ? '#000' : '#fff',
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.opacity = '0.7'}
              onMouseLeave={(e) => e.target.style.opacity = '1'}
            >
              CREATE
            </button>
            <button
              onClick={() => {
                const code = prompt("PASTE INVITE CODE") || "";
                if (code) onJoin(code);
              }}
              style={{
                fontSize: '10px',
                letterSpacing: '0.1em',
                padding: '12px 20px',
                background: 'none',
                border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                cursor: 'pointer',
                color: dark ? '#999' : '#666',
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.opacity = '0.5'}
              onMouseLeave={(e) => e.target.style.opacity = '1'}
            >
              JOIN
            </button>
          </div>
        </div>

        <div style={{
          fontSize: '9px',
          letterSpacing: '0.05em',
          lineHeight: '1.5',
          color: dark ? '#666' : '#999',
          paddingLeft: '20px',
          paddingRight: '20px'
        }}>
          PRIVATE ROOMS: INVITE-ONLY VIA CODE • PUBLIC ROOMS: VISIBLE TO ALL USERS • CREATOR-ONLY: ONLY YOU CAN POST
        </div>
      </div>
    </div>
  );
}
function ProfileEditModal({ user, onSave, onClose, dark }) {
  const [display, setDisplay] = useState(user.display || "");
  const [bio, setBio] = useState(user.bio || "");
  const [profileImage, setProfileImage] = useState(user.profileImage || "");
  const [bannerColor, setBannerColor] = useState(user.bannerColor || "#333333");
  const [uploading, setUploading] = useState(false);

  const CLOUDINARY_CLOUD_NAME = "dnulbfj48";
  const CLOUDINARY_UPLOAD_PRESET = "pin-anon-uploads";

  async function handleProfileImageUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("IMAGE TOO LARGE (MAX 5MB)");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        { method: "POST", body: formData }
      );
      const data = await response.json();
      if (data.secure_url) {
        setProfileImage(data.secure_url);
      }
      setUploading(false);
    } catch (error) {
      console.error("Upload error:", error);
      alert("FAILED TO UPLOAD IMAGE");
      setUploading(false);
    }
  }

  function handleSave() {
    onSave({
      ...user,
      display: display.trim() || user.id,
      bio: bio.trim(),
      profileImage,
      bannerColor
    });
    onClose();
  }

  return (
    <div style={{ 
      position: 'fixed', 
      inset: 0, 
      zIndex: 60, 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.8)',
      padding: '20px',
      overflowY: 'auto'
    }}>
      <div style={{
        maxWidth: '500px',
        width: '100%',
        backgroundColor: dark ? '#0a0a0a' : '#fff',
        border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
        padding: '40px 20px',
        fontFamily: 'Helvetica Neue, Arial, sans-serif'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', paddingLeft: '20px', paddingRight: '20px' }}>
          <h3 style={{ 
            fontSize: '12px', 
            letterSpacing: '0.15em',
            fontWeight: '300',
            color: dark ? '#fff' : '#000'
          }}>
            EDIT PROFILE
          </h3>
          <button 
            onClick={onClose}
            style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: dark ? '#999' : '#666',
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.5'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
          >
            CLOSE
          </button>
        </div>

        <div style={{ paddingLeft: '20px', paddingRight: '20px' }}>
          {/* Display Name */}
          <div style={{ marginBottom: '25px' }}>
            <label style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              color: dark ? '#999' : '#666',
              display: 'block',
              marginBottom: '10px'
            }}>
              DISPLAY NAME
            </label>
            <input
              value={display}
              onChange={(e) => setDisplay(e.target.value)}
              placeholder={user.id.toUpperCase()}
              style={{
                width: '100%',
                fontSize: '11px',
                letterSpacing: '0.05em',
                padding: '12px',
                background: 'none',
                border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                outline: 'none',
                color: dark ? '#fff' : '#000',
                fontFamily: 'Helvetica Neue, Arial, sans-serif',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Bio */}
          <div style={{ marginBottom: '25px' }}>
            <label style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              color: dark ? '#999' : '#666',
              display: 'block',
              marginBottom: '10px'
            }}>
              BIO
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="TELL US ABOUT YOURSELF..."
              maxLength={200}
              style={{
                width: '100%',
                height: '80px',
                fontSize: '11px',
                letterSpacing: '0.05em',
                padding: '12px',
                background: 'none',
                border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                outline: 'none',
                resize: 'none',
                color: dark ? '#fff' : '#000',
                fontFamily: 'Helvetica Neue, Arial, sans-serif',
                boxSizing: 'border-box'
              }}
            />
            <div style={{
              fontSize: '9px',
              letterSpacing: '0.05em',
              color: dark ? '#666' : '#999',
              marginTop: '5px',
              textAlign: 'right'
            }}>
              {bio.length}/200
            </div>
          </div>

          {/* Profile Image */}
          <div style={{ marginBottom: '25px' }}>
            <label style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              color: dark ? '#999' : '#666',
              display: 'block',
              marginBottom: '10px'
            }}>
              PROFILE IMAGE
            </label>
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '10px' }}>
              {profileImage && (
                <img
                  src={profileImage}
                  style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: `2px solid ${dark ? '#333' : '#e5e5e5'}`
                  }}
                  alt="profile preview"
                />
              )}
              <label style={{
                fontSize: '10px',
                letterSpacing: '0.1em',
                padding: '10px 15px',
                border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                cursor: uploading ? 'not-allowed' : 'pointer',
                color: uploading ? (dark ? '#333' : '#ccc') : (dark ? '#fff' : '#000'),
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={(e) => !uploading && (e.target.style.opacity = '0.5')}
              onMouseLeave={(e) => e.target.style.opacity = '1'}
              >
                {uploading ? "UPLOADING..." : profileImage ? "CHANGE" : "UPLOAD"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleProfileImageUpload}
                  disabled={uploading}
                  style={{ display: 'none' }}
                />
              </label>
              {profileImage && (
                <button
                  onClick={() => setProfileImage("")}
                  style={{
                    fontSize: '10px',
                    letterSpacing: '0.1em',
                    padding: '10px 15px',
                    background: 'none',
                    border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                    cursor: 'pointer',
                    color: dark ? '#999' : '#666',
                    transition: 'opacity 0.2s'
                  }}
                  onMouseEnter={(e) => e.target.style.opacity = '0.5'}
                  onMouseLeave={(e) => e.target.style.opacity = '1'}
                >
                  REMOVE
                </button>
              )}
            </div>
            <input
              value={profileImage}
              onChange={(e) => setProfileImage(e.target.value)}
              placeholder="OR PASTE IMAGE URL"
              style={{
                width: '100%',
                padding: '10px 0',
                fontSize: '10px',
                letterSpacing: '0.1em',
                background: 'none',
                border: 'none',
                borderBottom: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                outline: 'none',
                color: dark ? '#fff' : '#000',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Banner Color */}
          <div style={{ marginBottom: '30px' }}>
            <label style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              color: dark ? '#999' : '#666',
              display: 'block',
              marginBottom: '10px'
            }}>
              BANNER COLOR
            </label>
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
              <input
                type="color"
                value={bannerColor}
                onChange={(e) => setBannerColor(e.target.value)}
                style={{
                  width: '60px',
                  height: '40px',
                  border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                  cursor: 'pointer'
                }}
              />
              <div style={{
                flex: 1,
                height: '40px',
                backgroundColor: bannerColor,
                border: `1px solid ${dark ? '#333' : '#e5e5e5'}`
              }} />
              <span style={{
                fontSize: '10px',
                letterSpacing: '0.1em',
                color: dark ? '#999' : '#666'
              }}>
                {bannerColor.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            style={{
              width: '100%',
              fontSize: '11px',
              letterSpacing: '0.15em',
              padding: '15px',
              backgroundColor: dark ? '#fff' : '#000',
              border: 'none',
              cursor: 'pointer',
              color: dark ? '#000' : '#fff',
              transition: 'opacity 0.2s',
              fontFamily: 'Helvetica Neue, Arial, sans-serif'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.8'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
          >
            SAVE PROFILE
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsModal({ dark, setDark, theme, setTheme, onClose, user, onGenerateInvite, onGenerateSyncToken, setShowProfileEdit }) {
  const [showCopied, setShowCopied] = useState(false);
  const [showSyncCopied, setShowSyncCopied] = useState(false);

  const handleGenerateInvite = () => {
    const code = onGenerateInvite();
    if (code) {
      navigator.clipboard.writeText(code);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
      alert(`INVITE CODE: ${code}\n\nCopied to clipboard!`);
    }
  };

  const handleGenerateSyncToken = () => {
    const token = onGenerateSyncToken();
    if (token) {
      navigator.clipboard.writeText(token);
      setShowSyncCopied(true);
      setTimeout(() => setShowSyncCopied(false), 2000);
      alert(`SYNC TOKEN: ${token}\n\nCopied to clipboard!\n\nThis token expires in 24 hours and can only be used once.\nUse it to sync your account on another device.`);
    }
  };

  return (
    <div style={{ 
      position: 'fixed', 
      inset: 0, 
      zIndex: 50, 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.8)',
      padding: '20px',
      overflowY: 'auto'
    }}>
      <div style={{
        maxWidth: '500px',
        width: '100%',
        backgroundColor: dark ? '#0a0a0a' : '#fff',
        border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
        padding: '40px 20px',
        fontFamily: 'Helvetica Neue, Arial, sans-serif'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', paddingLeft: '20px', paddingRight: '20px' }}>
          <h3 style={{ 
            fontSize: '12px', 
            letterSpacing: '0.15em',
            fontWeight: '300',
            color: dark ? '#fff' : '#000'
          }}>
            SETTINGS
          </h3>
          <button 
            onClick={onClose}
            style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: dark ? '#999' : '#666',
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.5'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
          >
            CLOSE
          </button>
        </div>

        <div style={{ fontSize: '11px', letterSpacing: '0.05em', paddingLeft: '20px', paddingRight: '20px' }}>
          {/* Edit Profile Section */}
          <div style={{ marginBottom: '25px', paddingBottom: '25px', borderBottom: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}` }}>
            <span style={{ color: dark ? '#fff' : '#000', display: 'block', marginBottom: '15px' }}>PROFILE</span>
            <button
              onClick={() => {
                setShowProfileEdit(true);
                onClose();
              }}
              style={{
                width: '100%',
                fontSize: '10px',
                letterSpacing: '0.1em',
                padding: '12px 20px',
                backgroundColor: dark ? '#fff' : '#000',
                border: `1px solid ${dark ? '#fff' : '#000'}`,
                cursor: 'pointer',
                color: dark ? '#000' : '#fff',
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.opacity = '0.7'}
              onMouseLeave={(e) => e.target.style.opacity = '1'}
            >
              EDIT PROFILE
            </button>
          </div>

          {/* Account Sync Section */}
          <div style={{ marginBottom: '25px', paddingBottom: '25px', borderBottom: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}` }}>
            <div style={{ marginBottom: '15px' }}>
              <span style={{ color: dark ? '#fff' : '#000', display: 'block', marginBottom: '10px' }}>ACCOUNT SYNC</span>
              <div style={{ 
                fontSize: '9px', 
                letterSpacing: '0.05em',
                color: dark ? '#666' : '#999',
                marginBottom: '15px',
                lineHeight: '1.5'
              }}>
                Generate a one-time sync token to access your account on another device.
                Tokens expire in 24 hours.
              </div>
            </div>
            <button
              onClick={handleGenerateSyncToken}
              style={{
                width: '100%',
                fontSize: '10px',
                letterSpacing: '0.1em',
                padding: '12px 20px',
                backgroundColor: dark ? '#fff' : '#000',
                border: `1px solid ${dark ? '#fff' : '#000'}`,
                cursor: 'pointer',
                color: dark ? '#000' : '#fff',
                transition: 'opacity 0.2s',
                marginBottom: '10px'
              }}
              onMouseEnter={(e) => e.target.style.opacity = '0.7'}
              onMouseLeave={(e) => e.target.style.opacity = '1'}
            >
              {showSyncCopied ? 'COPIED!' : 'GENERATE SYNC TOKEN'}
            </button>
            <div style={{ 
              fontSize: '8px', 
              letterSpacing: '0.05em',
              color: dark ? '#666' : '#999',
              lineHeight: '1.4'
            }}>
              ⚠️ Treat sync tokens like passwords. Anyone with the token can access your account until it's used or expires.
            </div>
          </div>

          {/* Invite Codes Section */}
          <div style={{ marginBottom: '25px', paddingBottom: '25px', borderBottom: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <span style={{ color: dark ? '#fff' : '#000' }}>INVITE CODES</span>
              <span style={{ color: dark ? '#999' : '#666', fontSize: '10px' }}>
                {user.isAdmin ? '∞' : user.inviteCodesRemaining} REMAINING
              </span>
            </div>
            <button
              onClick={handleGenerateInvite}
              disabled={user.inviteCodesRemaining <= 0 && !user.isAdmin}
              style={{
                width: '100%',
                fontSize: '10px',
                letterSpacing: '0.1em',
                padding: '12px 20px',
                backgroundColor: (user.inviteCodesRemaining > 0 || user.isAdmin) ? (dark ? '#fff' : '#000') : 'transparent',
                border: `1px solid ${(user.inviteCodesRemaining > 0 || user.isAdmin) ? (dark ? '#fff' : '#000') : (dark ? '#333' : '#e5e5e5')}`,
                cursor: (user.inviteCodesRemaining > 0 || user.isAdmin) ? 'pointer' : 'not-allowed',
                color: (user.inviteCodesRemaining > 0 || user.isAdmin) ? (dark ? '#000' : '#fff') : (dark ? '#333' : '#ccc'),
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={(e) => (user.inviteCodesRemaining > 0 || user.isAdmin) && (e.target.style.opacity = '0.7')}
              onMouseLeave={(e) => e.target.style.opacity = '1'}
            >
              {showCopied ? 'COPIED!' : 'GENERATE INVITE CODE'}
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <span style={{ color: dark ? '#fff' : '#000' }}>DARK MODE</span>
            <button
              onClick={() => setDark((d) => !d)}
              style={{
                fontSize: '10px',
                letterSpacing: '0.1em',
                padding: '10px 20px',
                backgroundColor: dark ? '#fff' : '#000',
                border: `1px solid ${dark ? '#fff' : '#000'}`,
                cursor: 'pointer',
                color: dark ? '#000' : '#fff',
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.opacity = '0.7'}
              onMouseLeave={(e) => e.target.style.opacity = '1'}
            >
              {dark ? "ON" : "OFF"}
            </button>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <span style={{ color: dark ? '#fff' : '#000', display: 'block', marginBottom: '15px' }}>COLOR THEME</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              {['default', 'serika', 'retrocast', 'botanical', 'ocean', 'rose'].map((themeName) => (
                <button
                  key={themeName}
                  onClick={() => setTheme(themeName)}
                  style={{
                    fontSize: '10px',
                    letterSpacing: '0.1em',
                    padding: '10px 15px',
                    backgroundColor: theme === themeName ? (dark ? '#fff' : '#000') : 'transparent',
                    border: `1px solid ${theme === themeName ? (dark ? '#fff' : '#000') : (dark ? '#333' : '#e5e5e5')}`,
                    cursor: 'pointer',
                    color: theme === themeName ? (dark ? '#000' : '#fff') : (dark ? '#999' : '#666'),
                    transition: 'opacity 0.2s',
                    textTransform: 'uppercase'
                  }}
                  onMouseEnter={(e) => e.target.style.opacity = '0.7'}
                  onMouseLeave={(e) => e.target.style.opacity = '1'}
                >
                  {themeName}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
