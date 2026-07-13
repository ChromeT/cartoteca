import React, { useState } from 'react';
import { auth, db } from './firebase';
import { doc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { Browser } from '@capacitor/browser';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithCustomToken
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

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const customToken = params.get('token');
    if (customToken) {
      setLoading(true);
      signInWithCustomToken(auth, customToken)
        .then(() => {
          window.history.replaceState({}, document.title, window.location.pathname);
        })
        .catch(err => {
          setError('Discord Login Failed: ' + err.message);
          setLoading(false);
        });
    }
  }, []);

  const handleDiscordLogin = async () => {
    const isCapacitor = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform();

    if (isCapacitor) {
      setLoading(true);
      const sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      
      await Browser.open({ url: `https://cartoteca.vercel.app/api/login?session=${sessionId}` });

      const sessionRef = doc(db, 'auth_sessions', sessionId);
      const unsubscribe = onSnapshot(sessionRef, async (snap) => {
        if (snap.exists() && snap.data().token) {
          unsubscribe();
          await Browser.close().catch(() => {});
          try {
            await signInWithCustomToken(auth, snap.data().token);
            await deleteDoc(sessionRef).catch(() => {});
          } catch (err: any) {
            setError('Discord Login Failed: ' + err.message);
            setLoading(false);
          }
        }
      }, (err) => {
        setError('Session error: ' + err.message);
        setLoading(false);
        unsubscribe();
      });

      // Timeout setelah 5 menit jika tidak login
      setTimeout(() => {
        unsubscribe();
        setLoading(false);
      }, 5 * 60 * 1000);

    } else {
      // Arahkan ke Vercel Serverless Function (Web)
      window.location.href = '/api/login';
    }
  };

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
      padding: 'calc(20px + env(safe-area-inset-top)) 20px 20px',
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
            fontSize: '44px', margin: '0 auto 16px',
            boxShadow: '0 4px 0 #b87a2e, 0 10px 24px rgba(0,0,0,0.4)',
            transform: 'rotate(-3deg)'
          }}>🎴</div>
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

          {/* DISCORD LOGIN BUTTON */}
          <button
            type="button"
            onClick={handleDiscordLogin}
            disabled={loading}
            style={{
              width: '100%', padding: '12px', marginBottom: '20px',
              background: '#5865F2', color: '#fff', border: 'none', borderRadius: '8px',
              fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: '14px',
              cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              boxShadow: loading ? 'none' : '0 2px 0 #4752C4'
            }}
          >
            {loading ? '⏳ Please wait...' : (
              <>
                <svg width="20" height="20" viewBox="0 0 127.14 96.36" fill="currentColor">
                  <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1,105.25,105.25,0,0,0,32.19-16.14c0,0,.04-.06.09-.09C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.31,60,73.31,53s5-12.74,11.43-12.74S96.1,46,96,53,91.08,65.69,84.69,65.69Z"/>
                </svg>
                Continue with Discord
              </>
            )}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{ flex: 1, height: '1px', background: '#3a3327' }}></div>
            <span style={{ fontSize: '11px', color: '#9c8f76', fontFamily: "'IBM Plex Sans', sans-serif", letterSpacing: '0.05em' }}>OR</span>
            <div style={{ flex: 1, height: '1px', background: '#3a3327' }}></div>
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
