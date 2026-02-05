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
};

// ---------- Main Component ----------
export default function PinAnonBoard() {
  const [state, setState] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(() => {
    const existing = loadUser();
    if (existing?.id) return existing;
    const newUser = { 
      id: genAnonId(7), 
      display: null, 
      isAdmin: false,
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
  const [room, setRoom] = useState(DEFAULT_ROOM);
  const [showNew, setShowNew] = useState(false);
  const [profileView, setProfileView] = useState(null);
  const [sort, setSort] = useState("newest");
  const [whisper, setWhisper] = useState(false);
  const [search, setSearch] = useState("");
  const [inviteModal, setInviteModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [dark, setDark] = useState(() => {
    return localStorage.getItem("pinanon_dark") === "1";
  });
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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

  useEffect(() => {
    saveUser(user);
  }, [user]);

  useEffect(() => {
    localStorage.setItem("pinanon_dark", dark ? "1" : "0");
  }, [dark]);

  useEffect(() => {
    localStorage.setItem("pinanon_layout", layout);
  }, [layout]);

  const postsInRoom = useMemo(
    () => (state.posts || []).filter((p) => p.room === room),
    [state.posts, room]
  );

  function createRoom(name = "room", isPrivate = true) {
    const invite = genAnonId(6);
    const r = { 
      id: invite, 
      name: name || `room-${invite}`, 
      invite,
      creator: user.id,
      isPrivate: isPrivate // Now controlled by user choice
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
        const u = { ...prev, isAdmin: true };
        saveUser(u);
        return u;
      });
      alert("ADMIN ACCESS GRANTED");
    } else if (password) {
      alert("INCORRECT PASSWORD");
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
    const postId = crypto.randomUUID();
    const post = {
      id: postId,
      author: user.display || user.id,
      authorId: user.id, // Store actual user ID for ownership checking
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
        backgroundColor: dark ? '#000' : '#fff',
        color: dark ? '#fff' : '#000',
        fontFamily: 'Helvetica Neue, Arial, sans-serif'
      }}>
        <div className="text-center">
          <div className="text-xl font-light tracking-widest">PIN-ANON</div>
          <div className="text-xs tracking-widest mt-2" style={{ color: dark ? '#999' : '#666' }}>
            LOADING...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh',
      backgroundColor: dark ? '#000' : '#fff',
      color: dark ? '#fff' : '#000',
      fontFamily: 'Helvetica Neue, Arial, sans-serif',
      transition: 'background-color 0.3s, color 0.3s',
      overflowX: 'hidden'
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: windowWidth < 768 ? '20px 10px' : '40px 20px' }}>
        {/* Header */}
        <header style={{ 
          marginBottom: '60px', 
          paddingBottom: '30px', 
          borderBottom: `1px solid ${dark ? '#333' : '#e5e5e5'}` 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '30px', flexWrap: 'wrap', gap: '20px' }}>
            <div>
              <div style={{ 
                fontSize: '24px', 
                fontWeight: '300', 
                letterSpacing: '0.15em',
                marginBottom: '8px'
              }}>
                PIN-ANON
              </div>
              <div style={{ 
                fontSize: '10px', 
                letterSpacing: '0.2em',
                color: dark ? '#999' : '#666'
              }}>
                ANONYMOUS ARCHIVE
              </div>
            </div>

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

          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
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
              onSelectRoom={setRoom}
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
        </header>

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
                  />
                </div>
              </article>
            ))}
          </section>
        </main>
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
          onCreate={(n, isPrivate) => {
            const r = createRoom(n, isPrivate);
            setRoom(r.id);
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
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

// ---------- UI Subcomponents ----------

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
  const [uploading, setUploading] = useState(false);

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

  function submit() {
    if (!text.trim() && !img) return;
    onPost({ text: text.trim(), image: img || null });
    onClose();
    setText("");
    setImg("");
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
            <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
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

function CommentBlock({ post, addComment, removeComment, whisper, dark, user, isRoomMod }) {
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

function CommentThread({ comment, postId, addComment, removeComment, dark, user, isRoomMod, depth }) {
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
                <span style={{
                  fontSize: '10px',
                  letterSpacing: '0.05em',
                  fontWeight: '400',
                  color: dark ? '#999' : '#666',
                  wordBreak: 'break-all'
                }}>
                  {comment.author.toUpperCase()}
                </span>
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
              onClick={() => onCreate(name, isPrivate)}
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
          PRIVATE ROOMS: INVITE-ONLY VIA CODE • PUBLIC ROOMS: VISIBLE TO ALL USERS
        </div>
      </div>
    </div>
  );
}
function SettingsModal({ dark, setDark, onClose }) {
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
        maxWidth: '400px',
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
        </div>
      </div>
    </div>
  );
}
