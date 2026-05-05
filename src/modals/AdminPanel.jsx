import React from "react";

export function AdminPanel({ onClose, dark, user }) {
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
          border: `1px solid ${dark ? '#ff4444' : '#ff0000'}`,
          maxWidth: '500px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '40px'
        }}
      >
        <div style={{
          fontSize: '16px',
          letterSpacing: '0.15em',
          marginBottom: '30px',
          color: dark ? '#ff4444' : '#ff0000'
        }}>
          🛡️ ADMIN PANEL
        </div>

        <div style={{
          fontSize: '11px',
          letterSpacing: '0.05em',
          lineHeight: '1.8',
          color: dark ? '#fff' : '#000',
          marginBottom: '30px'
        }}>
          <div>USERNAME: {user.username}</div>
          <div>ADMIN STATUS: ACTIVE</div>
          <div>INVITE CODES: UNLIMITED</div>
        </div>

        <div style={{
          padding: '20px',
          border: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
          marginBottom: '20px'
        }}>
          <div style={{
            fontSize: '10px',
            letterSpacing: '0.1em',
            color: dark ? '#999' : '#666',
            marginBottom: '12px'
          }}>
            ADMIN PRIVILEGES
          </div>
          <div style={{
            fontSize: '11px',
            letterSpacing: '0.05em',
            lineHeight: '1.8',
            color: dark ? '#fff' : '#000'
          }}>
            • DELETE ANY POST OR COMMENT<br />
            • DELETE ANY ROOM<br />
            • UNLIMITED INVITE CODES<br />
            • BYPASS ALL RESTRICTIONS
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            width: '100%',
            fontSize: '10px',
            letterSpacing: '0.1em',
            padding: '12px',
            backgroundColor: dark ? '#ff4444' : '#ff0000',
            border: 'none',
            cursor: 'pointer',
            color: '#fff',
            transition: 'opacity 0.2s'
          }}
          onMouseEnter={(e) => e.target.style.opacity = '0.8'}
          onMouseLeave={(e) => e.target.style.opacity = '1'}
        >
          CLOSE
        </button>
      </div>
    </div>
  );
}

// Pattern Library Component - Save/load/export/import patterns
