import React, { useEffect, useMemo, useState } from "react";
import { ref, set, onValue, update, get } from "firebase/database";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { database, auth } from "./firebase";
import {
  LS_USER, DEFAULT_ROOM, ADMIN_PASSWORD, EMPTY,
  uid, now, saveUser, loadUser, hashPassword, validateUsername
} from "./utils";
import { themes, makeGetColor } from "./theme";
import ProfilePicture from "./components/ProfilePicture";
import UserListSidebar from "./components/UserListSidebar";
import HomePage from "./components/HomePage";
import RoomsDropdown from "./components/RoomsDropdown";
import ProfilePage from "./components/ProfilePage";
import { CommentBlock } from "./components/CommentBlock";
import NewPostModal from "./modals/NewPostModal";
import RoomModal from "./modals/RoomModal";
import SettingsModal from "./modals/SettingsModal";
import ProfileEditModal from "./modals/ProfileEditModal";
import LogoutConfirmModal from "./modals/LogoutConfirmModal";
import AdminPanel from "./modals/AdminPanel";
import InviteGate from "./modals/InviteGate";
import { SoundsStudio } from "./sounds";

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
  const [targetPostId, setTargetPostId] = useState(null);

  const getColor = makeGetColor(theme, dark);

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

  useEffect(() => {
    if (!targetPostId) return;
    const timeout = setTimeout(() => {
      const el = document.getElementById(`post-${targetPostId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.outline = `2px solid ${dark ? '#fff' : '#000'}`;
        el.style.outlineOffset = '4px';
        setTimeout(() => {
          el.style.outline = 'none';
          el.style.outlineOffset = '0';
        }, 2000);
        setTargetPostId(null);
      }
    }, 100);
    return () => clearTimeout(timeout);
  }, [targetPostId, visible]);

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

  function enterRoom(roomId, postId = null) {
    setRoom(roomId);
    setView("room");
    if (postId) setTargetPostId(postId);
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
          onBack={() => { setProfileView(null); setView(previousView); }}
          onEditProfile={() => setShowProfileEdit(true)}
          onDeletePost={removePost}
          onEnterRoom={enterRoom}
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
                  <article key={post.id} id={`post-${post.id}`} style={{ 
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
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                              style={{ maxWidth: '100%', border: 'none' }}
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
                        post.audioUrl.includes('spotify.com') ? (
                          <iframe
                            src={post.audioUrl.replace('open.spotify.com/', 'open.spotify.com/embed/')}
                            width="100%"
                            height="80"
                            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                            style={{ marginBottom: '12px', borderRadius: '12px', border: 'none' }}
                          />
                        ) : (
                          <audio
                            controls
                            style={{ width: '100%', marginBottom: '20px' }}
                          >
                            <source src={post.audioUrl} />
                            Your browser does not support audio.
                          </audio>
                        )
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
