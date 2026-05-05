import React, { useState } from "react";

export default function RoomSettingsModal({ room, onSave, onClose, dark, user, state }) {
  const [name, setName] = useState(room.name);
  const [isPrivate, setIsPrivate] = useState(room.isPrivate || false);
  const [creatorOnly, setCreatorOnly] = useState(room.creatorOnly || false);
  const [bannedUsers, setBannedUsers] = useState(room.bannedUsers || []);

  const roomPosts = (state.posts || []).filter(p => p.room === room.id);
  const uniqueUsers = [...new Map(
    roomPosts.map(p => [p.author, { id: p.author, username: p.authorDisplayName || p.author }])
  ).values()];

  const toggleBan = (userId) => {
    if (userId === user.id) return;
    setBannedUsers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const overlay = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px'
  };

  return (
    <div onClick={onClose} style={overlay}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: dark ? '#000' : '#fff',
          border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
          maxWidth: '500px', width: '100%',
          maxHeight: '90vh', overflowY: 'auto', padding: '40px'
        }}
      >
        <div style={{ fontSize: '16px', letterSpacing: '0.15em', marginBottom: '30px', color: dark ? '#fff' : '#000' }}>
          ROOM SETTINGS
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '9px', letterSpacing: '0.1em', color: dark ? '#999' : '#666', marginBottom: '8px' }}>
            ROOM NAME
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              width: '100%', fontSize: '13px', padding: '12px', background: 'none',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`, outline: 'none',
              color: dark ? '#fff' : '#000', fontFamily: 'inherit', boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', letterSpacing: '0.05em', color: dark ? '#fff' : '#000', cursor: 'pointer', marginBottom: '12px' }}>
            <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
            PRIVATE (INVITE ONLY)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', letterSpacing: '0.05em', color: dark ? '#fff' : '#000', cursor: 'pointer' }}>
            <input type="checkbox" checked={creatorOnly} onChange={(e) => setCreatorOnly(e.target.checked)} />
            CREATOR ONLY POSTING
          </label>
        </div>

        {uniqueUsers.length > 0 && (
          <div style={{ marginBottom: '30px' }}>
            <div style={{ fontSize: '9px', letterSpacing: '0.1em', color: dark ? '#999' : '#666', marginBottom: '12px' }}>
              MEMBERS ({uniqueUsers.length})
            </div>
            <div style={{ border: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`, maxHeight: '200px', overflowY: 'auto' }}>
              {uniqueUsers.map(u => (
                <div key={u.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 16px', borderBottom: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`
                }}>
                  <div style={{ fontSize: '11px', color: dark ? '#fff' : '#000' }}>
                    {u.username}
                    {u.id === user.id && <span style={{ fontSize: '9px', color: dark ? '#666' : '#999', marginLeft: '8px' }}>YOU</span>}
                  </div>
                  {u.id !== user.id && (
                    <button
                      onClick={() => toggleBan(u.id)}
                      style={{
                        fontSize: '9px', letterSpacing: '0.1em', padding: '4px 10px',
                        background: bannedUsers.includes(u.id) ? '#ef4444' : 'none',
                        border: `1px solid ${bannedUsers.includes(u.id) ? '#ef4444' : (dark ? '#333' : '#e5e5e5')}`,
                        cursor: 'pointer',
                        color: bannedUsers.includes(u.id) ? '#fff' : (dark ? '#fff' : '#000'),
                        transition: 'all 0.2s'
                      }}
                    >
                      {bannedUsers.includes(u.id) ? 'BANNED' : 'BAN'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            fontSize: '10px', letterSpacing: '0.1em', padding: '12px 24px',
            background: 'none', border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
            cursor: 'pointer', color: dark ? '#fff' : '#000'
          }}>
            CANCEL
          </button>
          <button
            onClick={() => onSave({ ...room, name, isPrivate, creatorOnly, bannedUsers })}
            style={{
              fontSize: '10px', letterSpacing: '0.1em', padding: '12px 24px',
              backgroundColor: dark ? '#fff' : '#000', border: 'none',
              cursor: 'pointer', color: dark ? '#000' : '#fff'
            }}
          >
            SAVE
          </button>
        </div>
      </div>
    </div>
  );
}
