import React, { useState } from "react";
import { generateUsername } from "../utils";

export function InviteGate({ onSignUp, onLogin, getColor }) {
  const [mode, setMode] = useState("signup");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");

  const handleGenerate = () => {
    setUsername(generateUsername());
  };

  const handleSubmit = async () => {
    setError("");
    
    if (mode === "signup") {
      if (!username.trim() || !password.trim()) {
        setError("PLEASE FILL IN ALL FIELDS");
        return;
      }
      const success = await onSignUp(username, password, "");
      if (!success) {
        // Error already shown by onSignUp
      }
    } else {
      if (!username.trim() || !password.trim()) {
        setError("PLEASE ENTER USERNAME AND PASSWORD");
        return;
      }
      const success = await onLogin(username, password);
      if (!success) {
        // Error already shown by onLogin
      }
    }
  };

  const handleAdminBypass = () => {
    const password = prompt("ENTER ADMIN PASSWORD:");
    if (password === "EpicMan101") {
      const event = new CustomEvent('adminBypass');
      window.dispatchEvent(event);
    } else if (password) {
      alert("INCORRECT PASSWORD");
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: getColor('bg'),
      color: getColor('text'),
      fontFamily: 'Helvetica Neue, Arial, sans-serif',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '420px',
        width: '100%'
      }}>
        {/* Header */}
        <div style={{
          textAlign: 'center',
          marginBottom: '60px'
        }}>
          <div style={{
            fontSize: '32px',
            fontWeight: '300',
            letterSpacing: '0.15em',
            marginBottom: '10px'
          }}>
            CARLISLE
          </div>
          <div style={{
            fontSize: '10px',
            letterSpacing: '0.2em',
            color: getColor('textMuted')
          }}>
            ANONYMOUS ARCHIVE
          </div>
        </div>

        {/* Mode Tabs */}
        <div style={{
          display: 'flex',
          marginBottom: '30px',
          border: `1px solid ${getColor('border')}`,
          overflow: 'hidden'
        }}>
          <button
            onClick={() => {
              setMode("signup");
              setError("");
            }}
            style={{
              flex: 1,
              fontSize: '10px',
              letterSpacing: '0.1em',
              padding: '12px',
              backgroundColor: mode === "signup" ? getColor('text') : 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: mode === "signup" ? getColor('bg') : getColor('textMuted'),
              transition: 'all 0.2s',
              fontFamily: 'Helvetica Neue, Arial, sans-serif'
            }}
          >
            SIGN UP
          </button>
          <button
            onClick={() => {
              setMode("login");
              setError("");
            }}
            style={{
              flex: 1,
              fontSize: '10px',
              letterSpacing: '0.1em',
              padding: '12px',
              backgroundColor: mode === "login" ? getColor('text') : 'transparent',
              border: 'none',
              borderLeft: `1px solid ${getColor('border')}`,
              cursor: 'pointer',
              color: mode === "login" ? getColor('bg') : getColor('textMuted'),
              transition: 'all 0.2s',
              fontFamily: 'Helvetica Neue, Arial, sans-serif'
            }}
          >
            LOGIN
          </button>
        </div>

        {/* Info Text */}
        <div style={{
          fontSize: '10px',
          letterSpacing: '0.05em',
          color: getColor('textMuted'),
          marginBottom: '25px',
          lineHeight: '1.5',
          textAlign: 'center'
        }}>
          {mode === "signup" ? (
            <>
              Pick a username or generate a random one.
              <br />
              No emails. No recovery. Remember your password.
            </>
          ) : (
            <>
              Enter your username and password.
            </>
          )}
        </div>

        {/* Form Fields */}
        <div style={{ marginBottom: '20px' }}>


          {/* Username */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              fontSize: '9px',
              letterSpacing: '0.1em',
              color: getColor('textMuted'),
              marginBottom: '8px'
            }}>
              USERNAME
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="HalfKitty28"
                style={{
                  width: '100%',
                  fontSize: '16px',
                  letterSpacing: '0.05em',
                  padding: '12px',
                  paddingRight: mode === "signup" ? '50px' : '12px',
                  background: 'none',
                  border: `1px solid ${getColor('border')}`,
                  outline: 'none',
                  color: getColor('text'),
                  fontFamily: 'Helvetica Neue, Arial, sans-serif',
                  boxSizing: 'border-box'
                }}
              />
              {mode === "signup" && (
                <button
                  onClick={handleGenerate}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '18px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: getColor('textMuted'),
                    padding: '4px 8px',
                    transition: 'opacity 0.2s'
                  }}
                  onMouseEnter={(e) => e.target.style.opacity = '0.5'}
                  onMouseLeave={(e) => e.target.style.opacity = '1'}
                  title="Generate random username"
                >
                  🎲
                </button>
              )}
            </div>
            {mode === "signup" && (
              <div style={{
                fontSize: '9px',
                letterSpacing: '0.05em',
                color: getColor('textMuted'),
                marginTop: '6px'
              }}>
                Click the dice to generate random names
              </div>
            )}
          </div>

          {/* Password */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              fontSize: '9px',
              letterSpacing: '0.1em',
              color: getColor('textMuted'),
              marginBottom: '8px'
            }}>
              PASSWORD
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit();
              }}
              placeholder="••••••••••"
              style={{
                width: '100%',
                fontSize: '16px',
                letterSpacing: '0.1em',
                padding: '12px',
                background: 'none',
                border: `1px solid ${getColor('border')}`,
                outline: 'none',
                color: getColor('text'),
                fontFamily: 'Helvetica Neue, Arial, sans-serif',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Warning (signup only) */}
          {mode === "signup" && (
            <div style={{
              fontSize: '9px',
              letterSpacing: '0.05em',
              color: '#ff4444',
              lineHeight: '1.4',
              padding: '10px',
              backgroundColor: getColor('bg') === '#000' ? '#1a0a0a' : '#fff5f5',
              border: `1px solid #ff4444`,
              marginBottom: '20px'
            }}>
              ⚠️ No password recovery. Write it down.
            </div>
          )}

          {error && (
            <div style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              color: '#ff4444',
              marginBottom: '20px',
              textAlign: 'center'
            }}>
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            style={{
              width: '100%',
              fontSize: '11px',
              letterSpacing: '0.1em',
              padding: '15px',
              backgroundColor: getColor('text'),
              border: 'none',
              cursor: 'pointer',
              color: getColor('bg'),
              transition: 'opacity 0.2s',
              fontFamily: 'Helvetica Neue, Arial, sans-serif'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.8'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
          >
            {mode === "signup" ? "CREATE ACCOUNT" : "LOGIN"}
          </button>
        </div>

        {/* Hidden admin login - triple click */}
        <div 
          onClick={(e) => {
            if (e.detail === 3) {
              handleAdminBypass();
            }
          }}
          style={{
            marginTop: '40px',
            fontSize: '9px',
            letterSpacing: '0.1em',
            color: getColor('borderDim'),
            cursor: 'default',
            userSelect: 'none',
            textAlign: 'center'
          }}
        >
          •
        </div>

        {/* Example Usernames */}
        <div style={{
          marginTop: '60px',
          textAlign: 'center',
          fontSize: '9px',
          letterSpacing: '0.1em',
          color: getColor('textMuted')
        }}>
          <div style={{ marginBottom: '10px' }}>EXAMPLE USERNAMES:</div>
          <div style={{ lineHeight: '1.8' }}>
            HalfKitty28 • BigFrog12 • TinyMoon99
            <br />
            SadRock45 • FastCheese03 • OldBox71
          </div>
        </div>
      </div>
    </div>
  );
}

