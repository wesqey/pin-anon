import React from "react";

export default function HomePage({ rooms, posts, onEnterRoom, onCreateRoom, onJoinRoom, dark, userJoinedRooms = [] }) {
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

