import React, { useState } from 'react';
import {
  Home,
  Lock,
  Mail,
  User,
  Phone,
  Building,
  KeyRound,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Send,
} from 'lucide-react';
import { supabase } from '../services/supabase';

interface AuthScreenProps {
  onAuthSuccess: () => void;
  initialMode?: 'login' | 'register' | 'forgot' | 'reset-password';
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  onAuthSuccess,
  initialMode = 'login',
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'confirm-email' | 'reset-password'>(initialMode);

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regCompound, setRegCompound] = useState('');

  // Forgot password & reset password state
  const [forgotEmail, setForgotEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Confirmation email / resend state
  const [pendingConfirmEmail, setPendingConfirmEmail] = useState('');
  const [resendingEmail, setResendingEmail] = useState(false);

  // Loading & status feedback
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Friendly error message mapper for Supabase Auth errors
  const mapSupabaseError = (err: any): string => {
    const message = err?.message || '';
    const lower = message.toLowerCase();

    if (lower.includes('invalid login credentials') || lower.includes('invalid_grant')) {
      return 'Incorrect email or password. Please double check and try again.';
    }
    if (lower.includes('user already registered') || lower.includes('already exists')) {
      return 'An account with this email address already exists. Please sign in instead.';
    }
    if (lower.includes('email not confirmed')) {
      return 'Please confirm your email address. Check your inbox for the verification email.';
    }
    if (lower.includes('rate limit') || lower.includes('over_email_send_rate_limit')) {
      return 'Too many attempts in a short time. Please wait a minute before trying again.';
    }
    if (lower.includes('password should be at least')) {
      return 'Password must be at least 8 characters long.';
    }
    return message || 'An error occurred during authentication. Please try again.';
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim().toLowerCase(),
        password: loginPassword,
      });

      if (error) {
        setErrorMsg(mapSupabaseError(error));
        return;
      }

      if (data?.session) {
        setSuccessMsg('Signed in successfully! Loading your compound...');
        setTimeout(() => {
          onAuthSuccess();
        }, 300);
      }
    } catch (err: any) {
      setErrorMsg(mapSupabaseError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (regPassword.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.');
      return;
    }

    setLoading(true);

    try {
      const cleanEmail = regEmail.trim().toLowerCase();
      const cleanName = regName.trim();
      const cleanCompound = regCompound.trim() || 'My Compound';
      const cleanPhone = regPhone.trim();

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: regPassword,
        options: {
          data: {
            name: cleanName,
            compound_name: cleanCompound,
            phone: cleanPhone,
          },
        },
      });

      if (error) {
        setErrorMsg(mapSupabaseError(error));
        return;
      }

      // Check if session was returned directly (Email confirmation is OFF)
      if (data?.session && data?.user) {
        // Update owners row with phone and compound_name (allowed by RLS for user's own row)
        await supabase
          .from('owners')
          .update({
            phone: cleanPhone,
            compound_name: cleanCompound,
          })
          .eq('id', data.user.id);

        setSuccessMsg('Account created successfully! Welcome to RentEase.');
        setTimeout(() => {
          onAuthSuccess();
        }, 500);
        return;
      }

      // If session is null, email confirmation is ON
      setPendingConfirmEmail(cleanEmail);
      setMode('confirm-email');
      setSuccessMsg('Verification link sent! Please check your email inbox.');
    } catch (err: any) {
      setErrorMsg(mapSupabaseError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResendConfirm = async () => {
    if (!pendingConfirmEmail) return;
    setResendingEmail(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: pendingConfirmEmail,
      });

      if (error) {
        setErrorMsg(mapSupabaseError(error));
      } else {
        setSuccessMsg(`Confirmation email resent to ${pendingConfirmEmail}`);
      }
    } catch (err: any) {
      setErrorMsg(mapSupabaseError(err));
    } finally {
      setResendingEmail(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const cleanEmail = forgotEmail.trim().toLowerCase();
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}`,
      });

      if (error) {
        setErrorMsg(mapSupabaseError(error));
        return;
      }

      setSuccessMsg(
        'Password reset link sent! Check your inbox and click the link to choose a new password.'
      );
    } catch (err: any) {
      setErrorMsg(mapSupabaseError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (newPassword.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setErrorMsg('Passwords do not match. Please re-enter.');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setErrorMsg(mapSupabaseError(error));
        return;
      }

      setSuccessMsg('Your password has been updated successfully!');
      setTimeout(() => {
        onAuthSuccess();
      }, 1000);
    } catch (err: any) {
      setErrorMsg(mapSupabaseError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F2EBDC] p-4 sm:p-6">
      <div className="w-full max-w-md rounded-3xl border border-[#DDD2B4] bg-[#F7F3E8] p-6 shadow-xl sm:p-8">
        {/* Brand Header */}
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#2E6B4A] text-white shadow-md">
            <Home className="h-7 w-7" />
          </div>
          <h1 className="mt-4 font-heading text-2xl font-bold tracking-tight text-[#2C2C2C]">
            RentEase
          </h1>
          <p className="mt-1 text-xs text-[#6B6B6B]">
            Compound & Rental Management Ledger
          </p>
        </div>

        {/* Tab Switcher (Visible in Login & Register modes) */}
        {(mode === 'login' || mode === 'register') && (
          <div className="mt-6 flex rounded-xl border border-[#DDD2B4] bg-white p-1 text-xs">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`flex-1 rounded-lg py-2 font-bold transition-all ${
                mode === 'login'
                  ? 'bg-[#2E6B4A] text-white shadow-xs'
                  : 'text-[#6B6B6B] hover:text-[#2C2C2C]'
              }`}
            >
              Owner Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`flex-1 rounded-lg py-2 font-bold transition-all ${
                mode === 'register'
                  ? 'bg-[#2E6B4A] text-white shadow-xs'
                  : 'text-[#6B6B6B] hover:text-[#2C2C2C]'
              }`}
            >
              Register Compound
            </button>
          </div>
        )}

        {/* Notification Alerts */}
        {errorMsg && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#A9D3B7] bg-[#A9D3B7]/20 p-3 text-xs text-[#2E6B4A]">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[#2E6B4A]" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* FORM 1: LOGIN */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="mt-5 space-y-4">
            <div>
              <label className="text-xs font-semibold text-[#2C2C2C]">Registered Email</label>
              <div className="relative mt-1">
                <Mail className="absolute top-2.5 left-3 h-4 w-4 text-[#9A9A9A]" />
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="owner@example.com"
                  className="w-full rounded-xl border border-[#DDD2B4] bg-white py-2 pr-3 pl-9 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[#2C2C2C]">Password</label>
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot');
                    setForgotEmail(loginEmail);
                    setErrorMsg(null);
                    setSuccessMsg(null);
                  }}
                  className="text-[11px] font-semibold text-[#2E6B4A] hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative mt-1">
                <Lock className="absolute top-2.5 left-3 h-4 w-4 text-[#9A9A9A]" />
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-[#DDD2B4] bg-white py-2 pr-3 pl-9 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2E6B4A] py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-[#3F7F5C] disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              <span>{loading ? 'Authenticating...' : 'Sign In to Your Compound'}</span>
            </button>
          </form>
        )}

        {/* FORM 2: REGISTRATION */}
        {mode === 'register' && (
          <form onSubmit={handleRegister} className="mt-5 space-y-3">
            <div>
              <label className="text-xs font-semibold text-[#2C2C2C]">Owner Full Name *</label>
              <div className="relative mt-1">
                <User className="absolute top-2.5 left-3 h-4 w-4 text-[#9A9A9A]" />
                <input
                  type="text"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="e.g. R. S. Narayanan"
                  className="w-full rounded-xl border border-[#DDD2B4] bg-white py-2 pr-3 pl-9 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-[#2C2C2C]">Email Address *</label>
              <div className="relative mt-1">
                <Mail className="absolute top-2.5 left-3 h-4 w-4 text-[#9A9A9A]" />
                <input
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="landlord@example.com"
                  className="w-full rounded-xl border border-[#DDD2B4] bg-white py-2 pr-3 pl-9 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-[#2C2C2C]">Password (Min. 8 characters) *</label>
              <div className="relative mt-1">
                <Lock className="absolute top-2.5 left-3 h-4 w-4 text-[#9A9A9A]" />
                <input
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  minLength={8}
                  className="w-full rounded-xl border border-[#DDD2B4] bg-white py-2 pr-3 pl-9 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-[#2C2C2C]">Phone Number *</label>
              <div className="relative mt-1">
                <Phone className="absolute top-2.5 left-3 h-4 w-4 text-[#9A9A9A]" />
                <input
                  type="text"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  placeholder="+91 94440 12345"
                  className="w-full rounded-xl border border-[#DDD2B4] bg-white py-2 pr-3 pl-9 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-[#2C2C2C]">Compound / Property Name *</label>
              <div className="relative mt-1">
                <Building className="absolute top-2.5 left-3 h-4 w-4 text-[#9A9A9A]" />
                <input
                  type="text"
                  value={regCompound}
                  onChange={(e) => setRegCompound(e.target.value)}
                  placeholder="e.g. Shanti Nilayam Compound"
                  className="w-full rounded-xl border border-[#DDD2B4] bg-white py-2 pr-3 pl-9 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2E6B4A] py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-[#3F7F5C] disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              <span>{loading ? 'Creating Account...' : 'Create Account & Start Management'}</span>
            </button>
          </form>
        )}

        {/* SCREEN 3: CONFIRM EMAIL SCREEN (When Email Confirmation is ON) */}
        {mode === 'confirm-email' && (
          <div className="mt-5 space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
              <Mail className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-heading text-base font-bold text-[#2C2C2C]">
                Check Your Email
              </h3>
              <p className="mt-1.5 text-xs text-[#6B6B6B]">
                We sent a confirmation link to <span className="font-bold text-[#2C2C2C]">{pendingConfirmEmail}</span>. Please click the link in your email to verify your account.
              </p>
            </div>

            <div className="rounded-xl border border-[#DDD2B4] bg-white p-3.5 text-left text-xs text-[#6B6B6B]">
              <p className="font-semibold text-[#2C2C2C]">Next steps:</p>
              <ol className="mt-1 list-decimal pl-4 space-y-1 text-[11px]">
                <li>Open your email provider and check inbox / spam.</li>
                <li>Click the confirmation button from Supabase.</li>
                <li>Return here to log into your compound ledger.</li>
              </ol>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={handleResendConfirm}
                disabled={resendingEmail}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#2E6B4A] bg-[#2E6B4A] py-2 text-xs font-bold text-white shadow-xs hover:bg-[#3F7F5C] disabled:opacity-60"
              >
                {resendingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                <span>{resendingEmail ? 'Resending Link...' : 'Resend Confirmation Email'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setLoginEmail(pendingConfirmEmail);
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className="text-xs font-semibold text-[#6B6B6B] hover:text-[#2C2C2C] py-1"
              >
                Back to Sign In
              </button>
            </div>
          </div>
        )}

        {/* SCREEN 4: FORGOT PASSWORD */}
        {mode === 'forgot' && (
          <form onSubmit={handleForgot} className="mt-5 space-y-4">
            <div>
              <h3 className="text-xs font-bold text-[#2C2C2C]">Reset Your Password</h3>
              <p className="mt-1 text-[11px] text-[#6B6B6B]">
                Enter your registered owner email address and we will send a secure link to reset your password.
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-[#2C2C2C]">Registered Email</label>
              <div className="relative mt-1">
                <Mail className="absolute top-2.5 left-3 h-4 w-4 text-[#9A9A9A]" />
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="owner@example.com"
                  className="w-full rounded-xl border border-[#DDD2B4] bg-white py-2 pr-3 pl-9 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className="text-xs font-semibold text-[#6B6B6B] hover:text-[#2C2C2C]"
              >
                Back to Sign In
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-1.5 rounded-xl bg-[#2E6B4A] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#3F7F5C] disabled:opacity-60"
              >
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Send Reset Link</span>
              </button>
            </div>
          </form>
        )}

        {/* SCREEN 5: SET NEW PASSWORD (Triggered via PASSWORD_RECOVERY event) */}
        {mode === 'reset-password' && (
          <form onSubmit={handleUpdatePassword} className="mt-5 space-y-4">
            <div>
              <h3 className="text-xs font-bold text-[#2C2C2C]">Choose a New Password</h3>
              <p className="mt-1 text-[11px] text-[#6B6B6B]">
                Enter and confirm your new account password (at least 8 characters).
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-[#2C2C2C]">New Password</label>
              <div className="relative mt-1">
                <KeyRound className="absolute top-2.5 left-3 h-4 w-4 text-[#9A9A9A]" />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  minLength={8}
                  className="w-full rounded-xl border border-[#DDD2B4] bg-white py-2 pr-3 pl-9 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-[#2C2C2C]">Confirm New Password</label>
              <div className="relative mt-1">
                <KeyRound className="absolute top-2.5 left-3 h-4 w-4 text-[#9A9A9A]" />
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  minLength={8}
                  className="w-full rounded-xl border border-[#DDD2B4] bg-white py-2 pr-3 pl-9 text-xs text-[#2C2C2C] focus:border-[#2E6B4A] focus:outline-hidden"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2E6B4A] py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-[#3F7F5C] disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>Update Password & Open Ledger</span>
            </button>
          </form>
        )}

        {/* Security Trust Marker */}
        <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-[#6B6B6B]">
          <ShieldCheck className="h-4 w-4 text-[#2E6B4A]" />
          <span>Strict Supabase Row Level Security (RLS) Enforced</span>
        </div>
      </div>
    </div>
  );
};
