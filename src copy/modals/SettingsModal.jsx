import React, { useState } from "react";

export function SettingsModal({ dark, setDark, theme, setTheme, user, onGenerateInvite, onLogout, onClose }) {
  const [newCode, setNewCode] = useState(null);

  const themes = ['default', 'serika', 'retrocast', 'botanical', 'ocean', 'rose'];

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
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '40px'
        }}
      >
        <div style={{
          fontSize: '16px',
          letterSpacing: '0.15em',
          marginBottom: '40px',
          color: dark ? '#fff' : '#000'
        }}>
          SETTINGS
        </div>

        <div style={{ marginBottom: '30px' }}>
          <div style={{
            fontSize: '10px',
            letterSpacing: '0.1em',
            color: dark ? '#999' : '#666',
            marginBottom: '12px'
          }}>
            APPEARANCE
          </div>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '11px',
            letterSpacing: '0.05em',
            color: dark ? '#fff' : '#000',
            cursor: 'pointer'
          }}>
            <input
              type="checkbox"
              checked={dark}
              onChange={(e) => setDark(e.target.checked)}
            />
            DARK MODE
          </label>
        </div>

        <div style={{ marginBottom: '30px' }}>
          <div style={{
            fontSize: '10px',
            letterSpacing: '0.1em',
            color: dark ? '#999' : '#666',
            marginBottom: '12px'
          }}>
            THEME
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {themes.map(t => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                style={{
                  fontSize: '9px',
                  letterSpacing: '0.1em',
                  padding: '8px 16px',
                  background: theme === t ? (dark ? '#fff' : '#000') : 'none',
                  border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                  cursor: 'pointer',
                  color: theme === t ? (dark ? '#000' : '#fff') : (dark ? '#fff' : '#000'),
                  transition: 'all 0.2s',
                  textTransform: 'uppercase'
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '30px' }}>
          <div style={{
            fontSize: '10px',
            letterSpacing: '0.1em',
            color: dark ? '#999' : '#666',
            marginBottom: '12px'
          }}>
            INVITE CODES
          </div>
          <div style={{
            fontSize: '11px',
            letterSpacing: '0.05em',
            color: dark ? '#fff' : '#000',
            marginBottom: '12px'
          }}>
            REMAINING: {user.inviteCodesRemaining}
          </div>
          <button
            onClick={() => {
              const code = onGenerateInvite();
              if (code) setNewCode(code);
            }}
            disabled={user.inviteCodesRemaining <= 0 && !user.isAdmin}
            style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              padding: '10px 20px',
              background: 'none',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              cursor: user.inviteCodesRemaining <= 0 && !user.isAdmin ? 'not-allowed' : 'pointer',
              color: dark ? '#fff' : '#000',
              opacity: user.inviteCodesRemaining <= 0 && !user.isAdmin ? 0.5 : 1,
              transition: 'border-color 0.2s'
            }}
            onMouseEnter={(e) => {
              if (user.inviteCodesRemaining > 0 || user.isAdmin) {
                e.target.style.borderColor = dark ? '#666' : '#999';
              }
            }}
            onMouseLeave={(e) => {
              if (user.inviteCodesRemaining > 0 || user.isAdmin) {
                e.target.style.borderColor = dark ? '#333' : '#e5e5e5';
              }
            }}
          >
            GENERATE CODE
          </button>
          {newCode && (
            <div style={{
              marginTop: '12px',
              padding: '12px',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              fontSize: '14px',
              letterSpacing: '0.2em',
              color: dark ? '#fff' : '#000',
              fontFamily: 'monospace'
            }}>
              {newCode}
            </div>
          )}
        </div>

        <div style={{ 
          borderTop: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
          paddingTop: '30px',
          marginTop: '40px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <button
            onClick={onLogout}
            style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              padding: '12px 24px',
              background: 'none',
              border: `1px solid ${dark ? '#ff4444' : '#ff0000'}`,
              cursor: 'pointer',
              color: dark ? '#ff4444' : '#ff0000',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = dark ? '#ff4444' : '#ff0000';
              e.target.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = 'transparent';
              e.target.style.color = dark ? '#ff4444' : '#ff0000';
            }}
          >
            LOGOUT
          </button>

          <button
            onClick={onClose}
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
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}

