import React, { useEffect, useMemo, useState } from "react";

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
  const [state, setState] = useState(() => load() || EMPTY);
  const [user, setUser] = useState(() => {
    const existing = loadUser();
    if (existing?.id) return existing;
    const newUser = { id: genAnonId(7), display: null };
    localStorage.setItem(LS_USER, JSON.stringify(newUser));
    return newUser;
  });

  const [room, setRoom] = useState(DEFAULT_ROOM);
  const [showNew, setShowNew] = useState(false);
  const [profileView, setProfileView] = useState(null);
  const [sort, setSort] = useState("newest");
  const [whisper, setWhisper] = useState(state.settings.whisper || false);
  const [search, setSearch] = useState("");
  const [inviteModal, setInviteModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [dark, setDark] = useState(() => {
    return localStorage.getItem("pinanon_dark") === "1";
  });

  useEffect(() => {
    save(state);
  }, [state]);
  useEffect(() => {
    saveUser(user);
  }, [user]);
  useEffect(() => {
    setWhisper(state.settings.whisper || false);
  }, []);
  useEffect(() => {
    localStorage.setItem("pinanon_dark", dark ? "1" : "0");
  }, [dark]);

  const postsInRoom = useMemo(
    () => state.posts.filter((p) => p.room === room),
    [state.posts, room]
  );

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
                {
                  id: uid("c"),
                  author: user.display || user.id,
                  text,
                  created: now(),
                },
              ],
            }
          : p
      );
      const ns = { ...prev, posts };
      save(ns);
      return ns;
    });
  }

  function removePost(postId) {
    setState((prev) => {
      const posts = prev.posts.filter((p) => p.id !== postId);
      const ns = { ...prev, posts };
      save(ns);
      return ns;
    });
  }

  function toggleWhisper() {
    setWhisper((w) => {
      const nw = !w;
      setState((prev) => ({
        ...prev,
        settings: { ...prev.settings, whisper: nw },
      }));
      return nw;
    });
  }

  function setDisplayName(name) {
    setUser((prev) => {
      const u = { ...prev, display: (name || "").toLowerCase() || null };
      saveUser(u);
      return u;
    });
  }

  const visible = postsInRoom
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

    setState((s) => ({
      ...s,
      posts: [post, ...s.posts],
    }));
  }

  return (
    <div
      className={
        "min-h-screen antialiased lowercase transition-colors duration-200 " +
        (dark ? "bg-slate-950 text-slate-100" : "bg-white text-slate-900")
      }
    >
      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* header */}
        <header className="flex items-center justify-between mb-10">
          <div>
            <div className="text-2xl font-light tracking-tight">pin-anon</div>
            <div className={dark ? "text-slate-400" : "text-slate-500"}>
              anonymous archive
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Menu
              dark={dark}
              items={[
                { label: "new post", onClick: () => setShowNew(true) },
                { divider: true },
                { label: "settings", onClick: () => setShowSettings(true) },
                { divider: true },
                {
                  label: "rooms",
                  children: [
                    {
                      label: "create room",
                      onClick: () => setInviteModal(true),
                    },
                    {
                      label: "join room",
                      onClick: () => {
                        const code = prompt("paste invite code");
                        if (code) joinRoom(code);
                      },
                    },
                    ...state.rooms.map((r) => ({
                      label: `open ${r.name}`,
                      onClick: () => setRoom(r.id),
                    })),
                  ],
                },
                { divider: true },
                {
                  label: "copy link",
                  onClick: () =>
                    navigator.clipboard.writeText(window.location.href),
                },
                {
                  label: "reset local data",
                  onClick: () => {
                    if (confirm("reset local data?")) {
                      setState(EMPTY);
                      localStorage.removeItem(LS_USER);
                      window.location.reload();
                    }
                  },
                },
              ]}
            />
          </div>
        </header>

        {/* meta controls */}
        <div className="flex items-center justify-between mb-6 gap-4">
          <div className="flex items-center gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search"
              className={
                "text-sm rounded px-2 py-1 " +
                (dark
                  ? "bg-slate-800 border-slate-700 text-slate-100"
                  : "bg-white border-slate-300 text-slate-900")
              }
            />
          </div>
          <div className={dark ? "text-slate-400" : "text-slate-500"}>
            {visible.length} posts
          </div>
        </div>

        {/* content area */}
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
                    "pb-6 " +
                    (dark ? "border-b border-slate-800" : "border-b")
                  }
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => setProfileView(post.author)}
                        className="text-sm font-medium hover:underline lowercase"
                      >
                        {post.author}
                      </button>
                      <div
                        className={
                          "text-xs " +
                          (dark ? "text-slate-500" : "text-slate-400")
                        }
                      >
                        {!whisper && `${new Date(post.created).toLocaleString()}`}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => vote(post.id, 1)}
                        className={
                          "px-2 py-1 text-sm rounded " +
                          (post.voters && post.voters[user.id] === 1
                            ? dark
                              ? "bg-slate-100 text-slate-900"
                              : "bg-slate-900 text-white"
                            : dark
                            ? "border border-slate-700 hover:bg-slate-800"
                            : "border hover:bg-slate-50")
                        }
                      >
                        ▲
                      </button>
                      <div className="text-sm px-1">{post.votes}</div>
                      <button
                        onClick={() => vote(post.id, -1)}
                        className={
                          "px-2 py-1 text-sm rounded " +
                          (post.voters && post.voters[user.id] === -1
                            ? dark
                              ? "bg-slate-100 text-slate-900"
                              : "bg-slate-900 text-white"
                            : dark
                            ? "border border-slate-700 hover:bg-slate-800"
                            : "border hover:bg-slate-50")
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
                        className="w-full rounded-lg mb-3 object-cover"
                        alt="post"
                      />
                    )}
                    <div className="text-lg leading-relaxed">{post.text}</div>
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
              <div
                className={
                  "mt-3 text-xs " +
                  (dark ? "text-slate-500" : "text-slate-400")
                }
              >
                local only — stored in your browser
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
function Menu({ items, dark }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xl px-2 hover:opacity-70"
        aria-label="menu"
      >
        ☰
      </button>

      {open && (
        <div
          className={
            "absolute right-0 mt-2 rounded-xl shadow-lg p-2 z-50 min-w-[180px] " +
            (dark
              ? "bg-slate-900 border border-slate-800"
              : "bg-white border border-slate-200")
          }
        >
          {items.map((item, i) => {
            if (item.divider) {
              return (
                <div
                  key={i}
                  className={
                    "my-1 " + (dark ? "border-t border-slate-800" : "border-t")
                  }
                />
              );
            }

            if (item.children) {
              return (
                <div key={i} className="mb-2">
                  <div
                    className={
                      "text-xs px-2 mb-1 " +
                      (dark ? "text-slate-500" : "text-slate-400")
                    }
                  >
                    {item.label}
                  </div>
                  {item.children.map((child, j) => (
                    <button
                      key={j}
                      onClick={() => {
                        child.onClick();
                        setOpen(false);
                      }}
                      className={
                        "block w-full text-left text-sm px-2 py-1 rounded " +
                        (dark ? "hover:bg-slate-800" : "hover:bg-slate-50")
                      }
                    >
                      {child.label}
                    </button>
                  ))}
                </div>
              );
            }

            return (
              <button
                key={i}
                onClick={() => {
                  item.onClick();
                  setOpen(false);
                }}
                className={
                  "block w-full text-left text-sm px-2 py-1 rounded " +
                  (dark ? "hover:bg-slate-800" : "hover:bg-slate-50")
                }
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Panel({ title, children, dark }) {
  return (
    <div
      className={
        "rounded-lg p-4 " +
        (dark
          ? "bg-slate-900 border border-slate-800"
          : "bg-white border border-slate-200")
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

  function handleFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setImg(URL.createObjectURL(f));
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
            "w-full rounded p-3 mb-3 h-28 " +
            (dark
              ? "bg-slate-800 border-slate-700 text-slate-100"
              : "bg-white border text-slate-900")
          }
        ></textarea>

        <div className="flex gap-3 items-center mb-3">
          <input
            type="file"
            accept="image/*"
            onChange={handleFile}
            className="text-sm"
          />
          <input
            value={img}
            onChange={(e) => setImg(e.target.value)}
            placeholder="or paste image url"
            className={
              "flex-1 rounded px-3 py-2 text-sm " +
              (dark
                ? "bg-slate-800 border-slate-700 text-slate-100"
                : "bg-white border text-slate-900")
            }
          />
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className={
              "px-3 py-1 rounded " +
              (dark
                ? "border border-slate-700 hover:bg-slate-800"
                : "border hover:bg-slate-50")
            }
          >
            cancel
          </button>
          <button
            onClick={submit}
            className={
              "px-4 py-1 rounded " +
              (dark
                ? "bg-slate-100 text-slate-900"
                : "bg-slate-900 text-white")
            }
          >
            post
          </button>
        </div>
      </div>
    </div>
  );
}

function CommentBlock({ post, addComment, whisper, dark, user }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setOpen((o) => !o)}
          className={
            "text-xs px-2 py-1 rounded " +
            (dark
              ? "border border-slate-700 hover:bg-slate-800"
              : "border hover:bg-slate-50")
          }
        >
          {open ? "hide" : `comments (${(post.comments || []).length})`}
        </button>
        {!whisper && (
          <div
            className={
              "text-xs " + (dark ? "text-slate-500" : "text-slate-400")
            }
          >
            {post.comments?.length
              ? `${post.comments.length} replies`
              : "no replies"}
          </div>
        )}
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          {post.comments?.map((c) => (
            <div
              key={c.id}
              className={
                "text-sm rounded p-2 " +
                (dark
                  ? "bg-slate-800 border border-slate-700"
                  : "bg-slate-50 border")
              }
            >
              <div
                className={
                  "text-xs lowercase " +
                  (dark ? "text-slate-500" : "text-slate-400")
                }
              >
                {c.author} • {new Date(c.created).toLocaleString()}
              </div>
              <div>{c.text}</div>
            </div>
          ))}

          <div className="flex gap-2 mt-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="reply..."
              className={
                "flex-1 rounded px-2 py-1 " +
                (dark
                  ? "bg-slate-800 border-slate-700 text-slate-100"
                  : "bg-white border text-slate-900")
              }
            />
            <button
              onClick={() => {
                addComment(post.id, text);
                setText("");
              }}
              className={
                "px-3 py-1 rounded " +
                (dark
                  ? "border border-slate-700 hover:bg-slate-800"
                  : "border hover:bg-slate-50")
              }
            >
              reply
            </button>
          </div>
        </div>
      )}
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
                  className="w-full rounded mb-2 object-cover"
                  alt="post"
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
              "w-full rounded px-3 py-2 mb-2 " +
              (dark
                ? "bg-slate-800 border-slate-700 text-slate-100"
                : "bg-white border text-slate-900")
            }
          />
          <div className="flex gap-2">
            <button
              onClick={() => onCreate(name)}
              className={
                "px-3 py-1 rounded " +
                (dark
                  ? "bg-slate-100 text-slate-900"
                  : "bg-slate-900 text-white")
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
                "px-3 py-1 rounded " +
                (dark
                  ? "border border-slate-700 hover:bg-slate-800"
                  : "border hover:bg-slate-50")
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
                "px-3 py-1 rounded " +
                (dark
                  ? "bg-slate-800 hover:bg-slate-700"
                  : "bg-slate-200 hover:bg-slate-300")
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