import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../app/store/authStore';
import {
  Compass,
  Lock,
  Mail,
  ArrowRight,
  Satellite,
  Waves,
  Ship,
  Shield,
  CheckCircle2,
  Radio,
  Sparkles,
} from 'lucide-react';
import ErrorMessage from '../components/common/ErrorMessage';

export default function Login() {
  const [email, setEmail] = useState('analyst@oil-spill.dev');
  const [password, setPassword] = useState('Password@123');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState(null);
  const { login, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    }
  };

  const setDemoCredentials = () => {
    setEmail('analyst@oil-spill.dev');
    setPassword('Password@123');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--og-bg-base)',
        backgroundImage: `
          radial-gradient(circle at 20% 30%, rgba(20, 56, 46, 0.25) 0%, transparent 40%),
          radial-gradient(circle at 80% 70%, rgba(16, 27, 24, 0.4) 0%, transparent 50%),
          linear-gradient(to right, rgba(24, 39, 34, 0.15) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(24, 39, 34, 0.15) 1px, transparent 1px)
        `,
        backgroundSize: '100% 100%, 100% 100%, 40px 40px, 40px 40px',
        padding: '24px',
      }}
    >
      <div
        className="og-panel-elevated"
        style={{
          width: '100%',
          maxWidth: '920px',
          display: 'grid',
          gridTemplateColumns: '1.1fr 1fr',
          borderRadius: 'var(--og-radius-lg)',
          overflow: 'hidden',
          border: '1px solid var(--og-border-strong)',
        }}
      >
        {/* Left Side: System Information & Evidence Pipeline Stages */}
        <div
          style={{
            padding: '40px 32px',
            backgroundColor: 'var(--og-bg-surface)',
            borderRight: '1px solid var(--og-border-default)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            {/* Brand Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: 'var(--og-radius-sm)',
                  backgroundColor: '#14382e',
                  border: '1px solid #2a6152',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--og-observed)',
                }}
              >
                <Compass size={20} />
              </div>
              <div>
                <h1 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--og-text-primary)', margin: 0 }}>
                  Ocean Guard AI
                </h1>
                <div style={{ fontSize: '0.75rem', color: 'var(--og-text-muted)' }}>
                  Maritime Spill Intelligence <span style={{ color: 'var(--og-observed)', fontFamily: 'var(--og-font-mono)' }}>v0.9 Beta</span>
                </div>
              </div>
            </div>

            <p style={{ fontSize: '0.875rem', color: 'var(--og-text-secondary)', marginBottom: '24px', lineHeight: 1.5 }}>
              Satellite evidence. Drift reconstruction. Vessel correlation.
            </p>

            {/* 3 Evidence Pipeline Stages */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div
                className="og-panel"
                style={{
                  padding: '10px 12px',
                  backgroundColor: 'var(--og-bg-base)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: 'var(--og-radius-sm)',
                    backgroundColor: 'var(--og-observed-bg)',
                    border: '1px solid var(--og-observed-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--og-observed)',
                    flexShrink: 0,
                  }}
                >
                  <Satellite size={14} />
                </div>
                <div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--og-text-primary)' }}>
                    1. SAR Detection
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--og-text-muted)' }}>
                    Sentinel-1 C-Band dual-pol (VV+VH) segmentation & slick polygonization.
                  </div>
                </div>
              </div>

              <div
                className="og-panel"
                style={{
                  padding: '10px 12px',
                  backgroundColor: 'var(--og-bg-base)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: 'var(--og-radius-sm)',
                    backgroundColor: 'var(--og-modelled-bg)',
                    border: '1px solid var(--og-modelled-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--og-modelled)',
                    flexShrink: 0,
                  }}
                >
                  <Waves size={14} />
                </div>
                <div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--og-text-primary)' }}>
                    2. Drift Reconstruction
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--og-text-muted)' }}>
                    24h Lagrangian reverse hindcast to determine Modelled Spill Origin.
                  </div>
                </div>
              </div>

              <div
                className="og-panel"
                style={{
                  padding: '10px 12px',
                  backgroundColor: 'var(--og-bg-base)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: 'var(--og-radius-sm)',
                    backgroundColor: 'var(--og-ais-bg)',
                    border: '1px solid var(--og-ais-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--og-ais)',
                    flexShrink: 0,
                  }}
                >
                  <Ship size={14} />
                </div>
                <div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--og-text-primary)' }}>
                    3. AIS Attribution
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--og-text-muted)' }}>
                    Multi-criteria spatiotemporal proximity, trajectory CPA, and anomaly scoring.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '28px', paddingTop: '14px', borderTop: '1px solid var(--og-border-subtle)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Radio size={12} style={{ color: 'var(--og-operational)' }} />
            <span style={{ fontSize: '0.72rem', color: 'var(--og-text-muted)' }}>
              Operational Station Node — SIH26143 Verification Suite
            </span>
          </div>
        </div>

        {/* Right Side: Station Authentication Form */}
        <div
          style={{
            padding: '40px 32px',
            backgroundColor: 'var(--og-bg-panel)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--og-text-primary)', margin: 0 }}>
              Station Authentication
            </h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--og-text-muted)', marginTop: '4px' }}>
              Sign in with authorized investigator credentials.
            </p>
          </div>

          {error && (
            <div style={{ marginBottom: '16px' }}>
              <ErrorMessage title="Authentication Failed" message={error} />
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, color: 'var(--og-text-secondary)', marginBottom: '5px' }}>
                Analyst Email
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--og-text-muted)' }} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="analyst@oil-spill.dev"
                  className="og-input"
                  style={{ paddingLeft: '32px' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, color: 'var(--og-text-secondary)', marginBottom: '5px' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--og-text-muted)' }} />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="og-input"
                  style={{ paddingLeft: '32px' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '2px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--og-text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{ accentColor: 'var(--og-observed)' }}
                />
                <span>Remember session</span>
              </label>

              <button
                type="button"
                onClick={setDemoCredentials}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--og-observed)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                Use Demo Credentials
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="og-btn og-btn-primary"
              style={{ width: '100%', padding: '10px', marginTop: '8px', fontSize: '0.875rem' }}
            >
              {isLoading ? (
                <span>Authenticating Station...</span>
              ) : (
                <>
                  <span>Sign In to Workstation</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>

          <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '0.72rem', color: 'var(--og-text-muted)' }}>
            Preset: <code className="font-mono" style={{ color: 'var(--og-text-secondary)' }}>analyst@oil-spill.dev</code> / <code className="font-mono" style={{ color: 'var(--og-text-secondary)' }}>Password@123</code>
          </div>
        </div>
      </div>
    </div>
  );
}
