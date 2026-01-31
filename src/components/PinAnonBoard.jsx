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

// ---------- Firebase Config ----------
// You'll replace this with your own config from Firebase Console
const firebaseConfig = {
  apiKey: import.meta.env.FIREBASE_API,
  authDomain: "pin-anon.firebaseapp.com",
  databaseURL: "https://pin-anon-default-rtdb.firebaseio.com",
  projectId: "pin-anon",
  storageBucket: "pin-anon.firebasestorage.app",
  messagingSenderId: "564572635192",
  appId: "1:564572635192:web:98d31c63a22b07383e26cd"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// ---------- Config & utils ----------
const LS_USER = "pinanon_v3_user";
const DEFAULT_ROOM = "main";

// Admin password - you should change this!
const ADMIN_PASSWORD = "admin123";

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

// ---------- Initial state ----------
const EMPTY = {
  rooms: [{ id: DEFAULT_ROOM, name: "main room", invite: DEFAULT_ROOM }],
  posts: [],
  settings: { whisper: false },
};

// ---------- Main Component ----------
export default function PinAnonBoard() {
  const [state, setState] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(() => {
    const existing = loadUser();
    if (existing?.id) return existing;
    const newUser = { id: genAnonId(7), display: null, isAdmin: false };
    localStorage.setItem(LS_USER, JSON.stringify(newUser));
    return newUser;
  });

  const [room, setRoom] = useState(DEFAULT_ROOM);
  const [showNew, setShowNew] = useState(false);
  const [profileView, setProfileView] = useState(null);
  const [sort, setSort] = useState("newest");
  const [whisper, setWhisper] = useState(false);
  const [search, setSearch] = useState("");
  const [inviteModal, setInviteModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dark, setDark] = useState(() => {
    return localStorage.getItem("pinanon_dark") === "1";
  });

  // Listen to Firebase for real-time updates
  useEffect(() => {
    const stateRef = ref(database, 'appState');
    
    const unsubscribe = onValue(stateRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setState(data);
        setWhisper(data.settings?.whisper || false);
      } else {
        // Initialize Firebase with default state if empty
        set(stateRef, EMPTY);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    saveUser(user);
  }, [user]);

  useEffect(() => {
    localStorage.setItem("pinanon_dark", dark ? "1" : "0");
  }, [dark]);

  const postsInRoom = useMemo(
  () => (state.posts || []).filter((p) => p.room === room),
  [state.posts, room]
);

  function createRoom(name = "room") {
    const invite = genAnonId(6);
    const r = { id: invite, name: name || `room-${invite}`, invite };
    
    const newRooms = [r, ...state.rooms];
    const updates = {};
    updates['appState/rooms'] = newRooms;
    update(ref(database), updates);
    
    return r;
  }

  function joinRoom(code) {
    const found = state.rooms.find((r) => r.id === code || r.invite === code);
    if (found) {
      setRoom(found.id);
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

  function removePost(postId) {
  if (!user.isAdmin) {
    alert("Only admins can delete posts");
    return;
  }
  
  if (!confirm("Delete this post?")) return;
  
  const newPosts = (state.posts || []).filter((p) => p.id !== postId);
  const updates = {};
  updates['appState/posts'] = newPosts;
  update(ref(database), updates);
}

  function removeRoom(roomId) {
  if (!user.isAdmin) {
    alert("Only admins can delete rooms");
    return;
  }
  
  if (roomId === DEFAULT_ROOM) {
    alert("Cannot delete the main room");
    return;
  }
  
  if (!confirm("Delete this room? All posts in this room will remain but won't be accessible.")) return;
  
  // If we're in the room being deleted, switch to main room
  if (room === roomId) {
    setRoom(DEFAULT_ROOM);
  }
  
  const newRooms = (state.rooms || []).filter((r) => r.id !== roomId);
  const updates = {};
  updates['appState/rooms'] = newRooms;
  update(ref(database), updates);
}

  function toggleWhisper() {
    const nw = !whisper;
    setWhisper(nw);
    const updates = {};
    updates['appState/settings/whisper'] = nw;
    update(ref(database), updates);
  }

  function setDisplayName(name) {
    setUser((prev) => {
      const u = { ...prev, display: (name || "").toLowerCase() || null };
      saveUser(u);
      return u;
    });
  }

  function handleAdminLogin() {
    const password = prompt("Enter admin password:");
    if (password === ADMIN_PASSWORD) {
      setUser((prev) => {
        const u = { ...prev, isAdmin: true };
        saveUser(u);
        return u;
      });
      alert("Admin access granted!");
    } else if (password) {
      alert("Incorrect password");
    }
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

  function postNew({ text, image }) {
  const post = {
    id: crypto.randomUUID(),
    author: user.display || user.id,
    text,
    image,
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
}

  const currentRoomName = useMemo(() => {
    const r = state.rooms.find(r => r.id === room);
    return r?.name || "main room";
  }, [room, state.rooms]);

  if (loading) {
    return (
      <div className={
        "min-h-screen flex items-center justify-center antialiased " +
        (dark ? "bg-slate-950 text-slate-100" : "bg-white text-slate-900")
      }>
        <div className="text-center">
          <div className="text-2xl font-light mb-2">pin-anon</div>
          <div className={dark ? "text-slate-400" : "text-slate-500"}>
            loading...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        "min-h-screen antialiased lowercase transition-colors duration-200 " +
        (dark ? "bg-slate-950 text-slate-100" : "bg-white text-slate-900")
      }
    >
      <div className="max-w-6xl mx-auto px-6 py-10">
        <header className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4">
            {/* Hamburger Menu - Moved to Left */}
            <button
              onClick={() => setMenuOpen(true)}
              className="text-xl px-2 hover:opacity-70"
              aria-label="menu"
            >
              ☰
            </button>
            
            <div>
              <div className="text-2xl font-light tracking-tight">pin-anon</div>
              <div className={dark ? "text-slate-400" : "text-slate-500"}>
                anonymous archive • live
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Rooms Dropdown */}
            <RoomsDropdown 
              rooms={state.rooms}
              currentRoom={room}
              currentRoomName={currentRoomName}
              onSelectRoom={setRoom}
              onCreateRoom={() => setInviteModal(true)}
              onJoinRoom={() => {
                const code = prompt("paste invite code");
                if (code) joinRoom(code);
              }}
              onDeleteRoom={removeRoom}
              dark={dark}
              isAdmin={user.isAdmin}
            />

            {/* New Post Button */}
            <button
              onClick={() => setShowNew(true)}
              className={
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors " +
                (dark
                  ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                  : "bg-blue-500/10 text-blue-600 hover:bg-blue-500/20")
              }
            >
              new post
            </button>
          </div>
        </header>

        {/* Slide-over Menu */}
        <SlideOverMenu 
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          dark={dark}
          user={user}
          onAdminLogin={handleAdminLogin}
          onAdminLogout={handleAdminLogout}
          onSettings={() => {
            setShowSettings(true);
            setMenuOpen(false);
          }}
          onCopyLink={() => {
            navigator.clipboard.writeText(window.location.href);
            setMenuOpen(false);
          }}
        />

        <div className="flex items-center justify-between mb-6 gap-4">
          <div className="flex items-center gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search posts..."
              className={
                "text-sm rounded-lg px-3 py-2 transition-colors outline-none " +
                (dark
                  ? "bg-slate-800/50 hover:bg-slate-800 focus:bg-slate-800 text-slate-100 placeholder-slate-500"
                  : "bg-slate-100 hover:bg-slate-200/70 focus:bg-slate-200/70 text-slate-900 placeholder-slate-400")
              }
            />
          </div>
          <div className={dark ? "text-slate-400" : "text-slate-500"}>
            {visible.length} posts
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
          <main className="lg:col-span-3">
            <section className="space-y-6">
              {visible.length === 0 && (
                <div
                  className={
                    "py-10 text-center " +
                    (dark ? "text-slate-500" : "text-slate-400")
                  }
                >
                  no posts yet in this room
                </div>
              )}

              {visible.map((post) => (
                <article
                  key={post.id}
                  className={
                    "pb-6 mb-6 " +
                    (dark
                      ? "border-b border-slate-800/50"
                      : "border-b border-slate-200")
                  }
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => setProfileView(post.author)}
                        className={
                          "text-sm font-medium hover:underline lowercase " +
                          (dark ? "text-slate-300" : "text-slate-700")
                        }
                      >
                        {post.author}
                      </button>
                      <div
                        className={
                          "text-xs " +
                          (dark ? "text-slate-500" : "text-slate-400")
                        }
                      >
                        {!whisper &&
                          `${new Date(post.created).toLocaleString()}`}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {user.isAdmin && (
                        <button
                          onClick={() => removePost(post.id)}
                          className={
                            "px-2.5 py-1.5 text-sm rounded-lg transition-all mr-2 " +
                            (dark
                              ? "hover:bg-red-500/20 text-red-400"
                              : "hover:bg-red-500/10 text-red-600")
                          }
                        >
                          delete
                        </button>
                      )}
                      <button
                        onClick={() => vote(post.id, 1)}
                        className={
                          "px-2.5 py-1.5 text-sm rounded-lg transition-all " +
                          (post.voters && post.voters[user.id] === 1
                            ? dark
                              ? "bg-orange-500/20 text-orange-400 hover:bg-orange-500/30"
                              : "bg-orange-500/10 text-orange-600 hover:bg-orange-500/20"
                            : dark
                            ? "hover:bg-slate-800/70 text-slate-400 hover:text-orange-400"
                            : "hover:bg-slate-100 text-slate-500 hover:text-orange-600")
                        }
                      >
                        ▲
                      </button>
                      <div className={
                        "text-sm font-medium px-2 " + 
                        (post.votes > 0 
                          ? dark ? "text-orange-400" : "text-orange-600"
                          : post.votes < 0
                          ? dark ? "text-blue-400" : "text-blue-600" 
                          : dark ? "text-slate-500" : "text-slate-400")
                      }>{post.votes}</div>
                      <button
                        onClick={() => vote(post.id, -1)}
                        className={
                          "px-2.5 py-1.5 text-sm rounded-lg transition-all " +
                          (post.voters && post.voters[user.id] === -1
                            ? dark
                              ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                              : "bg-blue-500/10 text-blue-600 hover:bg-blue-500/20"
                            : dark
                            ? "hover:bg-slate-800/70 text-slate-400 hover:text-blue-400"
                            : "hover:bg-slate-100 text-slate-500 hover:text-blue-600")
                        }
                      >
                        ▼
                      </button>
                    </div>
                  </div>

                  <div className="mt-3">
                    {post.image && (
                      <img
                        src={post.image}
                        className="w-full rounded-xl mb-3 object-contain max-h-[600px]"
                        alt="post"
                        style={{ maxWidth: '100%', height: 'auto' }}
                      />
                    )}
                    <div className="text-base leading-relaxed">{post.text}</div>
                  </div>

                  <div className="mt-4">
                    <CommentBlock
                      post={post}
                      addComment={addComment}
                      whisper={whisper}
                      dark={dark}
                      user={user}
                    />
                  </div>
                </article>
              ))}
            </section>
          </main>

          <aside className="lg:col-span-1 space-y-6">
            <Panel title="profile" dark={dark}>
              <div className="text-sm">id</div>
              <div className="mt-1 font-medium lowercase">
                {user.display || user.id}
              </div>
              {user.isAdmin && (
                <div className="mt-2 text-xs text-orange-500">
                  admin
                </div>
              )}
              <div
                className={
                  "mt-3 text-xs " +
                  (dark ? "text-slate-500" : "text-slate-400")
                }
              >
                synced in real-time
              </div>
            </Panel>
          </aside>
        </div>
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
          onCreate={(n) => {
            const r = createRoom(n);
            setRoom(r.id);
            setInviteModal(false);
            alert(`room created: ${r.invite}`);
          }}
          onJoin={(code) => {
            if (joinRoom(code)) {
              setInviteModal(false);
              alert("joined");
            } else alert("invalid");
          }}
          dark={dark}
        />
      )}
      {showSettings && (
        <SettingsModal
          dark={dark}
          setDark={setDark}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

// ---------- UI Subcomponents ----------

function SlideOverMenu({ open, onClose, dark, user, onAdminLogin, onAdminLogout, onSettings, onCopyLink }) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
      />
      
      {/* Slide-over panel */}
      <div 
        className={
          "fixed top-0 left-0 h-full w-80 z-50 shadow-xl transform transition-transform duration-300 ease-in-out " +
          (dark ? "bg-slate-900" : "bg-white")
        }
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-slate-700">
            <h2 className="text-lg font-medium">menu</h2>
            <button 
              onClick={onClose}
              className="text-xl hover:opacity-70"
            >
              ×
            </button>
          </div>

          {/* Menu Items */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-2">
              <button
                onClick={onSettings}
                className={
                  "w-full text-left px-4 py-3 rounded-lg transition-colors " +
                  (dark ? "hover:bg-slate-800" : "hover:bg-slate-100")
                }
              >
                settings
              </button>

              <button
                onClick={onCopyLink}
                className={
                  "w-full text-left px-4 py-3 rounded-lg transition-colors " +
                  (dark ? "hover:bg-slate-800" : "hover:bg-slate-100")
                }
              >
                copy link
              </button>

              <div className={
                "my-4 " + (dark ? "border-t border-slate-800" : "border-t border-slate-200")
              } />

              {!user.isAdmin ? (
                <button
                  onClick={() => {
                    onAdminLogin();
                    onClose();
                  }}
                  className={
                    "w-full text-left px-4 py-3 rounded-lg transition-colors " +
                    (dark ? "hover:bg-slate-800 text-orange-400" : "hover:bg-slate-100 text-orange-600")
                  }
                >
                  admin login
                </button>
              ) : (
                <button
                  onClick={() => {
                    onAdminLogout();
                    onClose();
                  }}
                  className={
                    "w-full text-left px-4 py-3 rounded-lg transition-colors " +
                    (dark ? "hover:bg-slate-800 text-red-400" : "hover:bg-slate-100 text-red-600")
                  }
                >
                  admin logout
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function RoomsDropdown({ rooms, currentRoom, currentRoomName, onSelectRoom, onCreateRoom, onJoinRoom, onDeleteRoom, dark, isAdmin }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={
          "px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 " +
          (dark
            ? "bg-slate-800/70 hover:bg-slate-800 text-slate-300"
            : "bg-slate-200 hover:bg-slate-300 text-slate-700")
        }
      >
        <span>{currentRoomName}</span>
        <span className="text-xs">▼</span>
      </button>

      {open && (
        <>
          <div 
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div
            className={
              "absolute right-0 mt-2 rounded-xl shadow-xl p-2 z-20 min-w-[200px] " +
              (dark
                ? "bg-slate-900/95 backdrop-blur-sm"
                : "bg-white/95 backdrop-blur-sm")
            }
          >
            <div className="mb-2 pb-2 border-b border-slate-700">
              <button
                onClick={() => {
                  onCreateRoom();
                  setOpen(false);
                }}
                className={
                  "block w-full text-left text-sm px-3 py-2 rounded-lg transition-colors " +
                  (dark ? "hover:bg-slate-800/70 text-blue-400" : "hover:bg-slate-100 text-blue-600")
                }
              >
                + create room
              </button>
              <button
                onClick={() => {
                  onJoinRoom();
                  setOpen(false);
                }}
                className={
                  "block w-full text-left text-sm px-3 py-2 rounded-lg transition-colors " +
                  (dark ? "hover:bg-slate-800/70 text-green-400" : "hover:bg-slate-100 text-green-600")
                }
              >
                join room
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto">
              {rooms.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between group/room"
                >
                  <button
                    onClick={() => {
                      onSelectRoom(r.id);
                      setOpen(false);
                    }}
                    className={
                      "flex-1 text-left text-sm px-3 py-2 rounded-lg transition-colors " +
                      (r.id === currentRoom
                        ? dark
                          ? "bg-slate-800 text-slate-100"
                          : "bg-slate-200 text-slate-900"
                        : dark
                        ? "hover:bg-slate-800/70 text-slate-300"
                        : "hover:bg-slate-100 text-slate-700")
                    }
                  >
                    {r.name}
                  </button>
                  {isAdmin && r.id !== DEFAULT_ROOM && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteRoom(r.id);
                      }}
                      className={
                        "px-2 py-1 text-xs rounded transition-colors opacity-0 group-hover/room:opacity-100 " +
                        (dark
                          ? "hover:bg-red-500/20 text-red-400"
                          : "hover:bg-red-500/10 text-red-600")
                      }
                      title="Delete room"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Panel({ title, children, dark }) {
  return (
    <div
      className={
        "rounded-xl p-4 " +
        (dark
          ? "bg-slate-900/50"
          : "bg-slate-50")
      }
    >
      <h4 className="text-sm font-medium mb-2">{title}</h4>
      {children}
    </div>
  );
}

function NewPostModal({ onClose, onPost, dark }) {
  const [text, setText] = useState("");
  const [img, setImg] = useState("");
  const [uploading, setUploading] = useState(false);

  // REPLACE these with your Cloudinary values
  const CLOUDINARY_CLOUD_NAME = "dnulbfj48"; // e.g., "dab12xyz"
  const CLOUDINARY_UPLOAD_PRESET = "pin-anon-uploads"; // or whatever you named it

  async function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    
    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert("Image too large! Please choose an image under 10MB.");
      return;
    }
    
    setUploading(true);
    
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
      
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        {
          method: "POST",
          body: formData,
        }
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
      alert("Failed to upload image. Please try again.");
      setUploading(false);
    }
  }

  function submit() {
    if (!text.trim() && !img) return;
    onPost({
      text: text.trim(),
      image: img || null,
    });
    onClose();
    setText("");
    setImg("");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className={
          "max-w-2xl w-full rounded-xl p-6 " +
          (dark ? "bg-slate-900 text-slate-100" : "bg-white text-slate-900")
        }
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg">new post</h3>
          <button onClick={onClose} className="text-sm hover:opacity-70">
            close
          </button>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="text or journal entry..."
          className={
            "w-full rounded-lg p-3 mb-3 h-28 outline-none transition-colors resize-none " +
            (dark
              ? "bg-slate-800/50 hover:bg-slate-800 focus:bg-slate-800 text-slate-100 placeholder-slate-500"
              : "bg-slate-100 hover:bg-slate-200/70 focus:bg-slate-200/70 text-slate-900 placeholder-slate-400")
          }
        ></textarea>

        <div className="mb-3">
          <div className="flex gap-3 items-center mb-2">
            <label className={
              "px-4 py-2 rounded-lg cursor-pointer transition-colors " +
              (uploading
                ? dark
                  ? "bg-slate-800/30 text-slate-600 cursor-not-allowed"
                  : "bg-slate-200/50 text-slate-400 cursor-not-allowed"
                : dark
                ? "bg-slate-800/70 hover:bg-slate-800 text-slate-300"
                : "bg-slate-200 hover:bg-slate-300 text-slate-700")
            }>
              {uploading ? "uploading..." : "choose image"}
              <input
                type="file"
                accept="image/*"
                onChange={handleFile}
                disabled={uploading}
                className="hidden"
              />
            </label>
            <span className={
              "text-xs " + (dark ? "text-slate-500" : "text-slate-400")
            }>
              or paste url below
            </span>
          </div>
          
          <input
            value={img}
            onChange={(e) => setImg(e.target.value)}
            placeholder="or paste image url"
            disabled={uploading}
            className={
              "w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors " +
              (dark
                ? "bg-slate-800/50 hover:bg-slate-800 focus:bg-slate-800 text-slate-100 placeholder-slate-500"
                : "bg-slate-100 hover:bg-slate-200/70 focus:bg-slate-200/70 text-slate-900 placeholder-slate-400")
            }
          />
          
          {img && !uploading && (
            <div className="mt-3 relative">
              <img 
                src={img} 
                alt="preview" 
                className="w-full rounded-lg object-contain max-h-96" 
                style={{ maxWidth: '100%', height: 'auto' }}
              />
              <button
                onClick={() => setImg("")}
                className={
                  "absolute top-2 right-2 px-2 py-1 rounded-lg text-xs font-medium " +
                  (dark
                    ? "bg-slate-900/90 text-slate-300 hover:bg-slate-900"
                    : "bg-white/90 text-slate-700 hover:bg-white")
                }
              >
                remove
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={uploading}
            className={
              "px-4 py-2 rounded-lg transition-colors " +
              (dark
                ? "hover:bg-slate-800/70 text-slate-400"
                : "hover:bg-slate-100 text-slate-600")
            }
          >
            cancel
          </button>
          <button
            onClick={submit}
            disabled={uploading || (!text.trim() && !img)}
            className={
              "px-5 py-2 rounded-lg font-medium transition-colors " +
              (uploading || (!text.trim() && !img)
                ? dark
                  ? "bg-slate-800/30 text-slate-600 cursor-not-allowed"
                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
                : dark
                ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                : "bg-blue-500/10 text-blue-600 hover:bg-blue-500/20")
            }
          >
            {uploading ? "uploading..." : "post"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CommentBlock({ post, addComment, whisper, dark, user }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  // Build a tree structure from flat comments
  const buildCommentTree = (comments) => {
    const commentMap = {};
    const roots = [];

    // First pass: create map of all comments
    comments.forEach(comment => {
      commentMap[comment.id] = { ...comment, replies: [] };
    });

    // Second pass: build tree structure
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
      <div className="flex items-center gap-3">
        <button
          onClick={() => setOpen((o) => !o)}
          className={
            "text-xs px-3 py-1.5 rounded-full font-medium transition-colors " +
            (dark
              ? "hover:bg-slate-800/70 text-slate-400 hover:text-slate-300"
              : "hover:bg-slate-100 text-slate-500 hover:text-slate-700")
          }
        >
          {(post.comments || []).length} {open ? '' : 'comments'}
        </button>
        {!whisper && !open && (
          <div
            className={
              "text-xs " + (dark ? "text-slate-600" : "text-slate-400")
            }
          >
            {post.comments?.length === 0 && "be the first to comment"}
          </div>
        )}
      </div>

      {open && (
        <div className={
          "mt-4 space-y-3 pl-4 " + 
          (dark ? "border-l-2 border-slate-800" : "border-l-2 border-slate-200")
        }>
          {commentTree.map((comment) => (
            <CommentThread 
              key={comment.id} 
              comment={comment} 
              postId={post.id}
              addComment={addComment}
              dark={dark}
              user={user}
              depth={0}
            />
          ))}

          <div className="flex gap-2 pt-2">
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
              placeholder="add a comment..."
              className={
                "flex-1 rounded-lg px-3 py-2 text-sm outline-none transition-colors " +
                (dark
                  ? "bg-slate-800/50 hover:bg-slate-800 focus:bg-slate-800 text-slate-100 placeholder-slate-500"
                  : "bg-slate-100 hover:bg-slate-200/70 focus:bg-slate-200/70 text-slate-900 placeholder-slate-400")
              }
            />
            <button
              onClick={() => {
                if (text.trim()) {
                  addComment(post.id, text, null);
                  setText("");
                }
              }}
              className={
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors " +
                (text.trim()
                  ? dark
                    ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                    : "bg-blue-500/10 text-blue-600 hover:bg-blue-500/20"
                  : dark
                  ? "bg-slate-800/30 text-slate-600 cursor-not-allowed"
                  : "bg-slate-100 text-slate-400 cursor-not-allowed")
              }
              disabled={!text.trim()}
            >
              reply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CommentThread({ comment, postId, addComment, dark, user, depth }) {
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

  // Limit nesting depth visually
  const maxVisualDepth = 6;
  const effectiveDepth = Math.min(depth, maxVisualDepth);

  return (
    <div className="group">
      <div className="flex gap-2">
        {/* Collapse button for threads with replies */}
        {comment.replies?.length > 0 && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={
              "text-xs w-5 h-5 flex items-center justify-center rounded hover:bg-slate-800/50 transition-colors flex-shrink-0 mt-0.5 " +
              (dark ? "text-slate-500 hover:text-slate-400" : "text-slate-400 hover:text-slate-600")
            }
          >
            {collapsed ? "+" : "−"}
          </button>
        )}
        
        <div className="flex-1 min-w-0">
          {!collapsed && (
            <>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span
                  className={
                    "text-xs font-medium lowercase " +
                    (dark ? "text-slate-400" : "text-slate-600")
                  }
                >
                  {comment.author}
                </span>
                <span
                  className={
                    "text-xs " +
                    (dark ? "text-slate-600" : "text-slate-400")
                  }
                >
                  •
                </span>
                <span
                  className={
                    "text-xs " +
                    (dark ? "text-slate-600" : "text-slate-400")
                  }
                >
                  {new Date(comment.created).toLocaleString()}
                </span>
              </div>
              
              <div className={
                "text-sm leading-relaxed mb-2 " +
                (dark ? "text-slate-300" : "text-slate-700")
              }>
                {comment.text}
              </div>

              <div className="flex items-center gap-2 mb-3">
                <button
                  onClick={() => setShowReplyBox(!showReplyBox)}
                  className={
                    "text-xs px-2 py-1 rounded-md font-medium transition-colors " +
                    (dark
                      ? "hover:bg-slate-800/70 text-slate-500 hover:text-slate-400"
                      : "hover:bg-slate-100 text-slate-500 hover:text-slate-700")
                  }
                >
                  reply
                </button>
                {comment.replies?.length > 0 && (
                  <span className={
                    "text-xs " +
                    (dark ? "text-slate-600" : "text-slate-400")
                  }>
                    {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}
                  </span>
                )}
              </div>

              {showReplyBox && (
                <div className="flex gap-2 mb-3">
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
                    placeholder={`reply to ${comment.author}...`}
                    autoFocus
                    className={
                      "flex-1 rounded-lg px-3 py-2 text-sm outline-none transition-colors " +
                      (dark
                        ? "bg-slate-800/50 hover:bg-slate-800 focus:bg-slate-800 text-slate-100 placeholder-slate-500"
                        : "bg-slate-100 hover:bg-slate-200/70 focus:bg-slate-200/70 text-slate-900 placeholder-slate-400")
                    }
                  />
                  <button
                    onClick={handleReply}
                    className={
                      "px-3 py-2 rounded-lg text-sm font-medium transition-colors " +
                      (replyText.trim()
                        ? dark
                          ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                          : "bg-blue-500/10 text-blue-600 hover:bg-blue-500/20"
                        : dark
                        ? "bg-slate-800/30 text-slate-600 cursor-not-allowed"
                        : "bg-slate-100 text-slate-400 cursor-not-allowed")
                    }
                    disabled={!replyText.trim()}
                  >
                    reply
                  </button>
                </div>
              )}
            </>
          )}

          {collapsed && (
            <div className={
              "text-xs py-1 " +
              (dark ? "text-slate-500" : "text-slate-400")
            }>
              {comment.author} • {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'} hidden
            </div>
          )}

          {/* Nested replies */}
          {!collapsed && comment.replies?.length > 0 && (
            <div className={
              "mt-3 space-y-3 pl-4 " +
              (dark ? "border-l-2 border-slate-800" : "border-l-2 border-slate-200")
            }>
              {comment.replies.map((reply) => (
                <CommentThread
                  key={reply.id}
                  comment={reply}
                  postId={postId}
                  addComment={addComment}
                  dark={dark}
                  user={user}
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
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
      <div
        className={
          "max-w-3xl w-full rounded-xl p-6 " +
          (dark ? "bg-slate-900 text-slate-100" : "bg-white text-slate-900")
        }
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xl lowercase font-medium">{authorId}</h3>
            <div
              className={
                "text-xs mt-1 " + (dark ? "text-slate-500" : "text-slate-400")
              }
            >
              {posts.length} posts
            </div>
          </div>
          <button onClick={onClose} className="text-sm hover:opacity-70">
            close
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {posts.map((p) => (
            <div
              key={p.id}
              className={
                "rounded p-3 " +
                (dark
                  ? "bg-slate-800 border border-slate-700"
                  : "bg-slate-50 border")
              }
            >
              {p.image && (
                <img
                  src={p.image}
                  className="w-full rounded mb-2 object-contain max-h-64"
                  alt="post"
                  style={{ maxWidth: '100%', height: 'auto' }}
                />
              )}
              <div className="text-sm">{p.text}</div>
              <div
                className={
                  "text-xs mt-2 " +
                  (dark ? "text-slate-500" : "text-slate-400")
                }
              >
                {new Date(p.created).toLocaleString()}
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

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
      <div
        className={
          "max-w-md w-full rounded-xl p-6 " +
          (dark ? "bg-slate-900 text-slate-100" : "bg-white text-slate-900")
        }
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg">rooms</h3>
          <button onClick={onClose} className="text-sm hover:opacity-70">
            close
          </button>
        </div>

        <div className="mb-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="new room name (optional)"
            className={
              "w-full rounded-lg px-3 py-2 mb-3 outline-none transition-colors " +
              (dark
                ? "bg-slate-800/50 hover:bg-slate-800 focus:bg-slate-800 text-slate-100 placeholder-slate-500"
                : "bg-slate-100 hover:bg-slate-200/70 focus:bg-slate-200/70 text-slate-900 placeholder-slate-400")
            }
          />
          <div className="flex gap-2">
            <button
              onClick={() => onCreate(name)}
              className={
                "px-4 py-2 rounded-lg font-medium transition-colors " +
                (dark
                  ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                  : "bg-blue-500/10 text-blue-600 hover:bg-blue-500/20")
              }
            >
              create
            </button>
            <button
              onClick={() => {
                const code = prompt("paste invite code") || "";
                if (code) onJoin(code);
              }}
              className={
                "px-4 py-2 rounded-lg transition-colors " +
                (dark
                  ? "hover:bg-slate-800/70 text-slate-400"
                  : "hover:bg-slate-100 text-slate-600")
              }
            >
              join
            </button>
          </div>
        </div>

        <div
          className={
            "text-xs " + (dark ? "text-slate-500" : "text-slate-400")
          }
        >
          creating a room generates a short invite code you can share. room
          data is local to browsers that join.
        </div>
      </div>
    </div>
  );
}

function SettingsModal({ dark, setDark, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className={
          "max-w-md w-full rounded-xl p-6 " +
          (dark ? "bg-slate-900 text-slate-100" : "bg-white text-slate-900")
        }
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg lowercase">settings</h3>
          <button onClick={onClose} className="text-sm hover:opacity-70">
            close
          </button>
        </div>

        <div className="space-y-4 text-sm">
          <div className="flex items-center justify-between">
            <span>dark mode</span>
            <button
              onClick={() => setDark((d) => !d)}
              className={
                "px-4 py-2 rounded-lg font-medium transition-colors " +
                (dark
                  ? "bg-slate-800/70 hover:bg-slate-800 text-slate-300"
                  : "bg-slate-200 hover:bg-slate-300 text-slate-700")
              }
            >
              {dark ? "on" : "off"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}