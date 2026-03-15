import React, { useState } from 'react';

// Xbox 360-style goofy username generator
const adjectives = [
  "Big", "Small", "Fast", "Slow", "Dead", "Sad", "Happy", "Angry",
  "Quiet", "Loud", "Cold", "Hot", "Wet", "Dry", "Old", "New",
  "Half", "Full", "Empty", "Broken", "Fixed", "Lost", "Found", "Hidden",
  "Dizzy", "Sleepy", "Grumpy", "Fancy", "Plain", "Shiny", "Dull", "Tiny",
  "Giant", "Mini", "Mega", "Ultra", "Super", "Hyper", "Turbo", "Extreme",
  "Fuzzy", "Smooth", "Rough", "Sharp", "Blunt", "Thick", "Thin", "Wide"
];

const nouns = [
  "Dog", "Cat", "Fish", "Bird", "Mouse", "Frog", "Bear", "Wolf",
  "Fox", "Deer", "Duck", "Goose", "Cow", "Pig", "Sheep", "Goat",
  "Turtle", "Snail", "Crab", "Shrimp", "Clam", "Squid", "Whale", "Shark",
  "Tree", "Rock", "Cloud", "Moon", "Star", "Sun", "Wind", "Rain",
  "Box", "Cup", "Lamp", "Chair", "Table", "Door", "Window", "Wall",
  "Car", "Truck", "Bike", "Boat", "Plane", "Train", "Bus", "Van",
  "Pizza", "Taco", "Bread", "Cheese", "Apple", "Grape", "Melon", "Berry"
];

function generateUsername() {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj}${noun}${num}`;
}

export default function CarlisleSignupMockup() {
  const [dark, setDark] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [mode, setMode] = useState("signup"); // "signup" or "login"

  const bg = dark ? '#000' : '#fff';
  const text = dark ? '#fff' : '#000';
  const textMuted = dark ? '#999' : '#666';
  const border = dark ? '#333' : '#e5e5e5';

  const handleGenerate = () => {
    setUsername(generateUsername());
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: bg,
      color: text,
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
            color: textMuted
          }}>
            ANONYMOUS ARCHIVE
          </div>
        </div>

        {/* Mode Tabs */}
        <div style={{
          display: 'flex',
          marginBottom: '30px',
          border: `1px solid ${border}`,
          overflow: 'hidden'
        }}>
          <button
            onClick={() => setMode("signup")}
            style={{
              flex: 1,
              fontSize: '10px',
              letterSpacing: '0.1em',
              padding: '12px',
              backgroundColor: mode === "signup" ? text : 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: mode === "signup" ? bg : textMuted,
              transition: 'all 0.2s',
              fontFamily: 'Helvetica Neue, Arial, sans-serif'
            }}
          >
            SIGN UP
          </button>
          <button
            onClick={() => setMode("login")}
            style={{
              flex: 1,
              fontSize: '10px',
              letterSpacing: '0.1em',
              padding: '12px',
              backgroundColor: mode === "login" ? text : 'transparent',
              border: 'none',
              borderLeft: `1px solid ${border}`,
              cursor: 'pointer',
              color: mode === "login" ? bg : textMuted,
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
          color: textMuted,
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
          {/* Invite Code (signup only) */}
          {mode === "signup" && (
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                fontSize: '9px',
                letterSpacing: '0.1em',
                color: textMuted,
                marginBottom: '8px'
              }}>
                INVITE CODE
              </label>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="ABC123XYZ"
                style={{
                  width: '100%',
                  fontSize: '14px',
                  letterSpacing: '0.1em',
                  padding: '12px',
                  background: 'none',
                  border: `1px solid ${border}`,
                  outline: 'none',
                  color: text,
                  fontFamily: 'Helvetica Neue, Arial, sans-serif',
                  boxSizing: 'border-box',
                  textTransform: 'uppercase'
                }}
              />
            </div>
          )}

          {/* Username */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              fontSize: '9px',
              letterSpacing: '0.1em',
              color: textMuted,
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
                  border: `1px solid ${border}`,
                  outline: 'none',
                  color: text,
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
                    color: textMuted,
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
                color: textMuted,
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
              color: textMuted,
              marginBottom: '8px'
            }}>
              PASSWORD
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••"
              style={{
                width: '100%',
                fontSize: '16px',
                letterSpacing: '0.1em',
                padding: '12px',
                background: 'none',
                border: `1px solid ${border}`,
                outline: 'none',
                color: text,
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
              backgroundColor: dark ? '#1a0a0a' : '#fff5f5',
              border: `1px solid #ff4444`,
              marginBottom: '20px'
            }}>
              ⚠️ No password recovery. Write it down.
            </div>
          )}

          {/* Submit Button */}
          <button
            style={{
              width: '100%',
              fontSize: '11px',
              letterSpacing: '0.1em',
              padding: '15px',
              backgroundColor: text,
              border: 'none',
              cursor: 'pointer',
              color: bg,
              transition: 'opacity 0.2s',
              fontFamily: 'Helvetica Neue, Arial, sans-serif'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.8'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
          >
            {mode === "signup" ? "CREATE ACCOUNT" : "LOGIN"}
          </button>
        </div>

        {/* Theme Toggle */}
        <div style={{
          textAlign: 'center',
          marginTop: '40px'
        }}>
          <button
            onClick={() => setDark(!dark)}
            style={{
              fontSize: '9px',
              letterSpacing: '0.1em',
              background: 'none',
              border: `1px solid ${border}`,
              cursor: 'pointer',
              color: textMuted,
              padding: '8px 16px',
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.5'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
          >
            {dark ? "LIGHT MODE" : "DARK MODE"}
          </button>
        </div>

        {/* Example Usernames */}
        <div style={{
          marginTop: '60px',
          textAlign: 'center',
          fontSize: '9px',
          letterSpacing: '0.1em',
          color: textMuted
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