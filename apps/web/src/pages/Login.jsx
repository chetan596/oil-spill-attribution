import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../app/store/authStore';
import { Lock, Mail, Shield, Smartphone, AtSign, X, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('analyst@oil-spill.dev');
  const [password, setPassword] = useState('Password@123');
  const [error, setError] = useState(null);
  const [infoNotice, setInfoNotice] = useState(null);
  const [emailFocused, setEmailFocused] = useState(false);
  const [pwdFocused, setPwdFocused] = useState(false);

  const { login, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setInfoNotice(null);

    if (!email.trim()) {
      setError('Please enter your operational email address.');
      return;
    }
    if (!password) {
      setError('Please enter your account password.');
      return;
    }

    try {
      await login(email.trim(), password);
      navigate('/dashboard');
    } catch (err) {
      // Map raw errors to clean, professional operational console messages
      const rawMsg = err?.response?.data?.message || err?.message || '';
      if (rawMsg.includes('Network Error') || rawMsg.includes('Failed to fetch') || err?.code === 'ERR_NETWORK') {
        setError('Unable to reach authentication service. Try again.');
      } else if (err?.response?.status >= 500) {
        setError('Authentication service unavailable. Try again.');
      } else if (err?.response?.status === 401 || rawMsg.toLowerCase().includes('credential') || rawMsg.toLowerCase().includes('invalid')) {
        setError('Invalid credentials provided. Verify your email and password.');
      } else {
        setError(rawMsg || 'Authentication failed. Please check your credentials.');
      }
    }
  };

  const handleProviderClick = (providerName) => {
    setError(null);
    setInfoNotice(`${providerName} gateway is managed via organization identity federation. Please use authorized credentials below.`);
  };

  const handleForgotPassword = () => {
    setError(null);
    setInfoNotice('Password recovery is restricted. Please contact your agency security administrator for a credential reset.');
  };

  const setDemoCredentials = () => {
    setEmail('analyst@oil-spill.dev');
    setPassword('Password@123');
    setError(null);
    setInfoNotice('Seeded demo credentials loaded: analyst@oil-spill.dev');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0A0B0D',
        color: '#FFFFFF',
        fontFamily: "'Schibsted Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        padding: '24px 16px',
        boxSizing: 'border-box',
      }}
    >
      {/* Central Auth Container */}
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          background: '#121417',
          border: '1px solid rgba(255, 255, 255, 0.055)',
          borderRadius: '8px',
          padding: '32px 36px',
          boxSizing: 'border-box',
          position: 'relative',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Top Header: Brand Left, Back to console Right */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '28px',
          }}
        >
          {/* Brand Mark */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                background: '#1D2025',
                border: '1px solid #343940',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: '11px',
                color: '#ECEEF1',
                letterSpacing: '-0.02em',
                flexShrink: 0,
              }}
            >
              OG
            </div>
            <span
              style={{
                fontFamily: "'Hanken Grotesk', sans-serif",
                fontWeight: 600,
                fontSize: '14px',
                letterSpacing: '-0.01em',
                color: '#ECEEF1',
              }}
            >
              Blue Forensic AI
            </span>
          </div>

          {/* Back to console */}
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#777E87',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 8px',
              borderRadius: '6px',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#ECEEF1';
              e.currentTarget.style.background = '#171A1E';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#777E87';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <X size={14} />
            <span>Back to console</span>
          </button>
        </div>

        {/* Center Title & Subtitle */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h1
            style={{
              fontFamily: "'Hanken Grotesk', sans-serif",
              fontSize: '22px',
              fontWeight: 600,
              letterSpacing: '-0.02em',
              color: '#ECEEF1',
              margin: '0 0 8px 0',
              lineHeight: 1.2,
            }}
          >
            Sign in to Tidal Console
          </h1>
          <p
            style={{
              fontSize: '12px',
              color: '#B1B6BD',
              margin: '0 auto',
              maxWidth: '420px',
              lineHeight: 1.45,
            }}
          >
            Authenticated access to slick detections, mission runs, and dossiers for your operational team.
          </p>
        </div>

        {/* Informational / SSO Notice */}
        {infoNotice && (
          <div
            style={{
              background: 'rgba(231, 166, 58, 0.08)',
              border: '1px solid rgba(231, 166, 58, 0.25)',
              borderRadius: '8px',
              padding: '10px 14px',
              marginBottom: '18px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '12px',
              color: '#E7A63A',
            }}
          >
            <AlertTriangle size={15} style={{ flexShrink: 0 }} />
            <span>{infoNotice}</span>
          </div>
        )}

        {/* Error Notice */}
        {error && (
          <div
            role="alert"
            style={{
              background: 'rgba(248, 113, 113, 0.08)',
              border: '1px solid rgba(248, 113, 113, 0.25)',
              borderRadius: '8px',
              padding: '10px 14px',
              marginBottom: '18px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '12px',
              color: '#F87171',
            }}
          >
            <AlertTriangle size={15} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Provider Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px' }}>
          {/* Google Workspace */}
          <button
            type="button"
            onClick={() => handleProviderClick('Google Workspace')}
            disabled={isLoading}
            style={{
              width: '100%',
              height: '36px',
              background: '#171A1E',
              border: '1px solid #343940',
              borderRadius: '8px',
              color: '#ECEEF1',
              fontSize: '12px',
              fontWeight: 500,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.15s ease',
              outline: 'none',
            }}
            onMouseEnter={(e) => {
              if (!isLoading) e.currentTarget.style.background = '#1D2025';
            }}
            onMouseLeave={(e) => {
              if (!isLoading) e.currentTarget.style.background = '#171A1E';
            }}
          >
            <AtSign size={14} style={{ color: '#777E87' }} />
            <span>
              Continue with <span style={{ color: '#B1B6BD' }}>Google Workspace</span>
            </span>
          </button>

          {/* Agency SSO */}
          <button
            type="button"
            onClick={() => handleProviderClick('Agency SSO')}
            disabled={isLoading}
            style={{
              width: '100%',
              height: '36px',
              background: '#171A1E',
              border: '1px solid #343940',
              borderRadius: '8px',
              color: '#ECEEF1',
              fontSize: '12px',
              fontWeight: 500,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.15s ease',
              outline: 'none',
            }}
            onMouseEnter={(e) => {
              if (!isLoading) e.currentTarget.style.background = '#1D2025';
            }}
            onMouseLeave={(e) => {
              if (!isLoading) e.currentTarget.style.background = '#171A1E';
            }}
          >
            <Shield size={14} style={{ color: '#777E87' }} />
            <span>
              Continue with <span style={{ color: '#B1B6BD' }}>Agency SSO</span>
            </span>
          </button>

          {/* Phone number */}
          <button
            type="button"
            onClick={() => handleProviderClick('Phone number')}
            disabled={isLoading}
            style={{
              width: '100%',
              height: '36px',
              background: '#171A1E',
              border: '1px solid #343940',
              borderRadius: '8px',
              color: '#ECEEF1',
              fontSize: '12px',
              fontWeight: 500,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.15s ease',
              outline: 'none',
            }}
            onMouseEnter={(e) => {
              if (!isLoading) e.currentTarget.style.background = '#1D2025';
            }}
            onMouseLeave={(e) => {
              if (!isLoading) e.currentTarget.style.background = '#171A1E';
            }}
          >
            <Smartphone size={14} style={{ color: '#777E87' }} />
            <span>
              Continue with <span style={{ color: '#B1B6BD' }}>Phone number</span>
            </span>
          </button>
        </div>

        {/* Divider */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            margin: '18px 0',
          }}
        >
          <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.055)' }} />
          <span style={{ fontSize: '11px', color: '#777E87' }}>or</span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.055)' }} />
        </div>

        {/* Email/Password Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Email field */}
          <div>
            <label
              htmlFor="login-email"
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 600,
                color: '#777E87',
                letterSpacing: '0.06em',
                marginBottom: '6px',
                textTransform: 'uppercase',
              }}
            >
              EMAIL
            </label>
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                background: '#0C0E11',
                border: emailFocused ? '1px solid #343940' : '1px solid #25292F',
                borderRadius: '8px',
                transition: 'border-color 0.15s ease',
              }}
            >
              <Mail
                size={14}
                style={{
                  position: 'absolute',
                  left: '12px',
                  color: emailFocused ? '#A855F7' : '#777E87',
                  pointerEvents: 'none',
                }}
              />
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                placeholder="analyst@agency.org"
                disabled={isLoading}
                style={{
                  width: '100%',
                  height: '36px',
                  padding: '0 12px 0 36px',
                  background: 'transparent',
                  border: 'none',
                  color: '#ECEEF1',
                  fontSize: '13px',
                  outline: 'none',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Password field */}
          <div>
            <label
              htmlFor="login-password"
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 600,
                color: '#777E87',
                letterSpacing: '0.06em',
                marginBottom: '6px',
                textTransform: 'uppercase',
              }}
            >
              PASSWORD
            </label>
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                background: '#0C0E11',
                border: pwdFocused ? '1px solid #343940' : '1px solid #25292F',
                borderRadius: '8px',
                transition: 'border-color 0.15s ease',
              }}
            >
              <Lock
                size={14}
                style={{
                  position: 'absolute',
                  left: '12px',
                  color: pwdFocused ? '#A855F7' : '#777E87',
                  pointerEvents: 'none',
                }}
              />
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setPwdFocused(true)}
                onBlur={() => setPwdFocused(false)}
                placeholder="••••••••••••"
                disabled={isLoading}
                style={{
                  width: '100%',
                  height: '36px',
                  padding: '0 12px 0 36px',
                  background: 'transparent',
                  border: 'none',
                  color: '#ECEEF1',
                  fontSize: '13px',
                  outline: 'none',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Forgot password */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
              <button
                type="button"
                onClick={handleForgotPassword}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#777E87',
                  fontSize: '11px',
                  cursor: 'pointer',
                  padding: '2px 0',
                  transition: 'color 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#ECEEF1')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#777E87')}
              >
                Forgot password?
              </button>
            </div>
          </div>

          {/* Primary Submit Button */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '8px' }}>
            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                height: '34px',
                padding: '0 20px',
                background: '#A855F7',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 500,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                opacity: isLoading ? 0.7 : 1,
                transition: 'background 0.15s ease',
                outline: 'none',
              }}
              onMouseEnter={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.background = '#C084FC';
                }
              }}
              onMouseLeave={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.background = '#A855F7';
                }
              }}
            >
              {isLoading ? (
                <>
                  <Loader2 size={14} className="animate-spin" style={{ color: '#FFFFFF' }} />
                  <span>Signing in…</span>
                </>
              ) : (
                <>
                  <Mail size={14} style={{ color: '#FFFFFF' }} />
                  <span>Continue with email</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Footer Access / Restriction Notice */}
        <div
          style={{
            marginTop: '24px',
            textAlign: 'center',
            fontSize: '11px',
            color: '#777E87',
            lineHeight: 1.5,
            maxWidth: '440px',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          Console access is restricted to authorized analysts and environmental ops personnel. Sign-in activity is logged against your organization's monitoring agreement.{' '}
          <button
            type="button"
            onClick={() => setInfoNotice('Access requests must be submitted through your departmental security liaison or IT administrator.')}
            style={{
              background: 'none',
              border: 'none',
              color: '#ECEEF1',
              fontWeight: 500,
              fontSize: '11px',
              padding: 0,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Need access?
          </button>
        </div>

        {/* Demo Fast Fill Seed Helper */}
        <div
          style={{
            marginTop: '18px',
            paddingTop: '14px',
            borderTop: '1px solid rgba(255, 255, 255, 0.055)',
            textAlign: 'center',
          }}
        >
          <button
            type="button"
            onClick={setDemoCredentials}
            style={{
              background: 'rgba(168, 85, 247, 0.08)',
              border: '1px dashed rgba(168, 85, 247, 0.3)',
              color: '#C084FC',
              borderRadius: '6px',
              padding: '6px 14px',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(168, 85, 247, 0.15)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(168, 85, 247, 0.08)')}
          >
            <CheckCircle2 size={13} />
            <span>Load Seeded Demo Analyst Credentials</span>
          </button>
        </div>
      </div>
    </div>
  );
}
