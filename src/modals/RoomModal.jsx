import React, { useState } from "react";

export default function RoomModal({ onClose, onCreate, onJoin, dark }) {
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

