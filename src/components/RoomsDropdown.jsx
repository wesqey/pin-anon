import React, { useState } from "react";

export default function RoomsDropdown({ rooms, currentRoom, currentRoomName, onSelectRoom, onCreateRoom, onJoinRoom, onDeleteRoom, dark, isAdmin, userJoinedRooms = [], userCreatedRooms = [] }) {
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

