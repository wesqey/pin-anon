import React, { useEffect, useMemo, useState } from "react";
import "../App.css"; // make sure global CSS is imported

// ---------- Config & utils ----------
const LS_KEY = "pinanon_v3_state";
const LS_USER = "pinanon_v3_user";
const DEFAULT_ROOM = "main";

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

function generateColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = hash % 360;
  return `hsl(${h}, 70%, 60%)`;
}

function save(state) {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}
function load() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || null;
  } catch (e) {
    return null;
  }
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
  const [user, setUser] = useState(() => {
    const existing = loadUser();
    if (existing) return existing;
    const u = { id: genAnonId() };
    saveUser(u);
    return u;
  });

  const [state, setState] = useState(load() || EMPTY);
  const [room, setRoom] = useState(DEFAULT_ROOM);
  const [showNew, setShowNew] = useState(false);
  const [profileView, setProfileView] = useState(null);
  const [filterTag, setFilterTag] = useState("");
  const [sort, setSort] = useState("newest");
  const [whisper, setWhisper] = useState(state.settings.whisper || false);
  const [search, setSearch] = useState("");
  const [inviteModal, setInviteModal] = useState(false);
  const [gridView, setGridView] = useState(true);

  useEffect(() => save(state), [state]);
  useEffect(() => saveUser(user), [user]);
  useEffect(() => setWhisper(state.settings.whisper || false), []);

  // derived
  const postsInRoom = useMemo(
    () => state.posts.filter((p) => p.room === room),
    [state.posts, room]
  );

  const tagList = useMemo(() => {
    const tags = new Set();
    state.posts.forEach((p) => (p.tags || []).forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [state.posts]);

  const visible = postsInRoom
    .filter((p) => {
      if (filterTag && !(p.tags || []).includes(filterTag)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !(p.text || "").toLowerCase().includes(q) &&
          !(p.tags || []).some((t) => t.includes(q)) &&
          !(p.author || "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sort === "newest") return b.created - a.created;
      if (sort === "top")
        return (
          b.votes - a.votes ||
          (b.comments?.length || 0) - (a.comments?.length || 0) ||
          (b.created - a.created)
        );
      return b.created - a.created;
    });

  // helpers
  function createRoom(name = "room") {
    const invite = genAnonId(6);
    const r = { id: invite, name: name || `room-${invite}`, invite };
    setState((prev) => ({ ...prev, rooms: [r, ...prev.rooms] }));
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

  function postNew({ text, image, tags = [] }) {
    const p = {
      id: uid("p"),
      author: user.display || user.id,
      created: now(),
      text: text || "",
      image: image || null,
      tags: tags.filter(Boolean).map((t) => t.toLowerCase()),
      votes: 0,
      voters: {},
      comments: [],
      room,
    };
    setState((prev) => {
      const ns = { ...prev, posts: [p, ...prev.posts] };
      save(ns);
      return ns;
    });
  }

  function vote(postId, delta) {
    setState((prev) => {
      const posts = prev.posts.map((p) => {
        if (p.id !== postId) return p;
        const vmap = { ...(p.voters || {}) };
        const prevVote = vmap[user.id] || 0;
        const newVote = prevVote === delta ? 0 : delta;
        vmap[user.id] = newVote;
        const votes = Object.values(vmap).reduce((s, x) => s + x, 0);
        return { ...p, voters: vmap, votes };
      });
      const ns = { ...prev, posts };
      save(ns);
      return ns;
    });
  }

  function addComment(postId, text) {
    if (!text) return;
    setState((prev) => {
      const posts = prev.posts.map((p) =>
        p.id === postId
          ? {
              ...p,
              comments: [
                ...p.comments,
                { id: uid("c"), author: user.display || user.id, text, created: now() },
              ],
            }
          : p
      );
      const ns = { ...prev, posts };
      save(ns);
      return ns;
    });
  }

  function toggleWhisper() {
    setWhisper((w) => {
      const nw = !w;
      setState((prev) => ({ ...prev, settings: { ...prev.settings, whisper: nw } }));
      return nw;
    });
  }

  // ---------- UI ----------
  return (
    <div className="vh-100 bg-white black-90 sans-serif pa3">
      <div className="mw7 center">

        {/* header */}
        <header className="flex justify-between items-center mb4">
          <div>
            <div className="f3 fw1 lh-title">pin-anon</div>
            <div className="f5 gray mt1">anonymous archive</div>
          </div>

          <div className="flex items-center gap2">
            <div className="f6 gray dn-s">room:</div>
            <div className="pa2 br2 ba f6">{room}</div>

            {/* Top buttons */}
            <button onClick={() => setInviteModal(true)} className="button-text f6">rooms</button>
            <button onClick={() => setGridView(!gridView)} className="button-text f6">{gridView ? '━' : '☰'}</button>
            <button onClick={() => setShowNew(true)} className="button-text f6">new</button>
            <button onClick={toggleWhisper} className="button-text f6">
              whisper
            </button>
          </div>
        </header>

        {/* Meta controls */}
        <div className="flex justify-between items-center mb4 gap2">
          <div className="flex items-center gap2">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="pa2 br2 ba f6"
            >
              <option value="newest">newest</option>
              <option value="top">top</option>
            </select>

            <select
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              className="pa2 br2 ba f6"
            >
              <option value="">all tags</option>
              {tagList.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search text, tag, author"
              className="pa2 br2 ba f6"
            />
          </div>

          <div className="f6 gray">{visible.length} posts</div>
        </div>

        {/* Content */}
        <div className="flex flex-wrap">
          {/* User list sidebar */}
          <aside className="w-100 w-20-l pr3-l mb4 mb0-l">
            <div className="f5 mb3 fw6">Active Users</div>
            <div className="flex flex-column gap2">
              {(() => {
                const roomUsers = new Set();
                postsInRoom.forEach(p => roomUsers.add(p.author));
                return Array.from(roomUsers).sort().map(author => (
                  <div key={author} className="flex items-center gap2 pv2">
                    <div 
                      className="br-100" 
                      style={{
                        width: '32px',
                        height: '32px',
                        background: `linear-gradient(135deg, ${generateColor(author)}, ${generateColor(author + 'b')})`,
                        flexShrink: 0
                      }}
                    />
                    <button
                      onClick={() => setProfileView(author)}
                      className="button-text f6 hover-gray"
                    >
                      {author}
                    </button>
                  </div>
                ));
              })()}
            </div>
          </aside>

          {/* feed */}
          <main className="flex-auto w-100 w-60-l" style={gridView ? {display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '40px'} : {}}>
            {visible.map((post) => (
              <article key={post.id} className="mb4 pb3 bb">
                <div className="flex justify-between items-start mb2">
                  <div className="flex items-center gap2">
                    <div 
                      className="br-100" 
                      style={{
                        width: '40px',
                        height: '40px',
                        background: `linear-gradient(135deg, ${generateColor(post.author)}, ${generateColor(post.author + 'b')})`,
                        flexShrink: 0
                      }}
                    />
                    <div>
                      <button
                        onClick={() => {}}
                        className="button-text f6 fw6 hover-gray"
                      >
                        {post.author}
                      </button>
                      <div className="f7 gray">{new Date(post.created).toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap2">
                    <button
                      onClick={() => vote(post.id, 1)}
                      className="button-text f7 fw6 hover-gray"
                    >
                      ▲
                    </button>
                    <div className="f7">{post.votes}</div>
                    <button
                      onClick={() => vote(post.id, -1)}
                      className="button-text f7 fw6 hover-gray"
                    >
                      ▼
                    </button>
                  </div>
                </div>
                {post.image && <img src={post.image} className="w-100 mb2 br2" />}
                <div className="f6" style={{wordBreak: 'break-word', overflowWrap: 'anywhere'}}>{post.text}</div>
                {post.tags?.length && <div className="f7 gray mt2">#{post.tags.join("  #")}</div>}
              </article>
            ))}
          </main>
        </div>
      </div>
    </div>
  );
}
