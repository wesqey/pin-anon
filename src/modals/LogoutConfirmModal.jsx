import React from "react";

export default function LogoutConfirmModal({ onConfirm, onCancel, dark }) {
  return (
    <div
      onClick={onCancel}
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
          maxWidth: '400px',
          width: '100%',
          padding: '40px'
        }}
      >
        <div style={{
          fontSize: '16px',
          letterSpacing: '0.15em',
          marginBottom: '20px',
          color: dark ? '#fff' : '#000'
        }}>
          LOGOUT
        </div>

        <div style={{
          fontSize: '12px',
          lineHeight: '1.6',
          letterSpacing: '0.02em',
          color: dark ? '#999' : '#666',
          marginBottom: '30px'
        }}>
          Are you sure you want to logout? You'll need your username and password to log back in.
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
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
            onClick={onConfirm}
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
        </div>
      </div>
    </div>
  );
}

