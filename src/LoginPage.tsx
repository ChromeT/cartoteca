import React, { useState } from 'react';
import { auth } from './firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'firebase/auth';

// Username dikonversi ke fake email untuk Firebase Auth
const toEmail = (username: string) =>
  username.trim().toLowerCase().replace(/[^a-z0-9_\-]/g, '') + '@cartoteca.app';

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Username and password cannot be empty.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    setError('');
    const email = toEmail(username);

    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      const code = err.code || '';
      if (code === 'auth/user-not-found' || code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        setError('Invalid username or password.');
      } else if (code === 'auth/email-already-in-use') {
        setError('This username is already taken. Please log in.');
      } else if (code === 'auth/weak-password') {
        setError('Password is too weak, must be at least 6 characters.');
      } else if (code === 'auth/network-request-failed') {
        setError('Connection failed. Please check your internet connection.');
      } else {
        setError('An error occurred: ' + (err.message || code));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      background: `
        radial-gradient(circle at 12% 4%, rgba(216,146,62,0.08), transparent 45%),
        radial-gradient(circle at 88% 92%, rgba(94,163,150,0.06), transparent 42%),
        repeating-linear-gradient(0deg, rgba(237,227,206,0.015) 0px, transparent 1px, transparent 2px),
        #17140f`
    }}>
      <div style={{
        width: '100%',
        maxWidth: '380px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '28px'
      }}>

        {/* Brand */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '72px', height: '72px', borderRadius: '14px',
            background: '#d8923e',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 4px 0 #b87a2e, 0 10px 24px rgba(0,0,0,0.4)',
            transform: 'rotate(-3deg)'
          }}>
            <div style={{
              width: '36px',
              height: '52px',
              background: '#13110d',
              border: '2px solid #d8923e',
              borderRadius: '6px',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 3px 6px rgba(0,0,0,0.5)',
              overflow: 'hidden'
            }}>
              <div style={{
                position: 'absolute',
                top: '8px',
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                background: '#c14e4e',
                boxShadow: '0 0 8px rgba(193, 78, 78, 0.4)'
              }}></div>
              <div style={{
                position: 'absolute',
                bottom: '-2px',
                left: '-2px',
                right: '-2px',
                height: '18px',
                background: '#d8923e',
                borderRadius: '16px 16px 0 0'
              }}></div>
            </div>
          </div>
          <h1 style={{
            fontFamily: "'Spectral', serif", fontSize: '36px',
            fontWeight: 800, color: '#ede3ce', margin: '0 0 4px',
            letterSpacing: '0.01em'
          }}>Cartoteca</h1>
          <p style={{
            fontFamily: "'IBM Plex Sans', sans-serif",
            fontSize: '13px', color: '#9c8f76', margin: 0
          }}>Karuta collection companion</p>
        </div>

        {/* Card */}
        <div style={{
          width: '100%',
          background: '#1c1812',
          border: '1px solid #3a3327',
          borderRadius: '14px',
          padding: '28px 24px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
        }}>
          {/* Mode Toggle */}
          <div style={{
            display: 'flex', gap: '0',
            background: '#17140f', borderRadius: '8px',
            padding: '3px', marginBottom: '24px',
            border: '1px solid #3a3327'
          }}>
            {(['login', 'register'] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setError(''); }}
                style={{
                  flex: 1, padding: '8px', border: 'none', borderRadius: '6px',
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  fontWeight: 600, fontSize: '13px', cursor: 'pointer',
                  transition: 'all 0.15s',
                  background: mode === m ? '#d8923e' : 'transparent',
                  color: mode === m ? '#fff' : '#9c8f76'
                }}>
                {m === 'login' ? 'Log In' : 'Sign Up'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Username */}
            <div>
              <label style={{
                display: 'block', fontFamily: "'IBM Plex Sans', sans-serif",
                fontSize: '11px', fontWeight: 700, color: '#9c8f76',
                letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px'
              }}>Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: '#0f0d0a', color: '#ede3ce',
                  border: '1px solid #3a3327', borderRadius: '8px',
                  padding: '11px 14px',
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: '14px',
                  outline: 'none', transition: 'border-color 0.2s'
                }}
                onFocus={e => e.target.style.borderColor = '#5ea396'}
                onBlur={e => e.target.style.borderColor = '#3a3327'}
              />
            </div>

            {/* Password */}
            <div>
              <label style={{
                display: 'block', fontFamily: "'IBM Plex Sans', sans-serif",
                fontSize: '11px', fontWeight: 700, color: '#9c8f76',
                letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px'
              }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="at least 6 characters"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: '#0f0d0a', color: '#ede3ce',
                  border: '1px solid #3a3327', borderRadius: '8px',
                  padding: '11px 14px',
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: '14px',
                  outline: 'none', transition: 'border-color 0.2s'
                }}
                onFocus={e => e.target.style.borderColor = '#5ea396'}
                onBlur={e => e.target.style.borderColor = '#3a3327'}
              />
            </div>

            {/* Error */}
            {error && (
              <div style={{
                background: 'rgba(216, 92, 92, 0.1)', border: '1px solid rgba(216,92,92,0.3)',
                borderRadius: '8px', padding: '10px 14px',
                fontFamily: "'IBM Plex Sans', sans-serif",
                fontSize: '13px', color: '#d26464'
              }}>
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '12px',
                background: loading ? '#9c8f76' : '#d8923e',
                color: '#fff', border: 'none', borderRadius: '8px',
                fontFamily: "'IBM Plex Sans', sans-serif",
                fontWeight: 700, fontSize: '14px', cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s', marginTop: '4px',
                boxShadow: loading ? 'none' : '0 2px 0 #b87a2e'
              }}
            >
              {loading ? '⏳ Processing...' : mode === 'login' ? '🎴 Log In to Binder' : '✨ Create Account'}
            </button>
          </form>
        </div>

        <p style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '11px', color: '#9c8f76', textAlign: 'center',
          letterSpacing: '0.04em', margin: 0
        }}>
          © 2026 ChromeT · Cartoteca
        </p>
      </div>
    </div>
  );
}
