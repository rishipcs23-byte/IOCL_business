'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Fuel, Lock, User, AlertCircle, Eye, EyeOff, ShieldCheck, ArrowRight, CheckCircle2 } from 'lucide-react';
import { loginAction } from '@/lib/actions';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoFilledRole, setAutoFilledRole] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);

    try {
      const res = await loginAction(null, formData);
      if (res.error) {
        setError(res.error);
        setLoading(false);
      } else if (res.success) {
        window.location.href = '/dashboard';
      }
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  const handleFillCredentials = (u: string, p: string, roleName: string) => {
    setUsername(u);
    setPassword(p);
    setError(null);
    setAutoFilledRole(roleName);
    setTimeout(() => setAutoFilledRole(null), 2500);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 dark:bg-slate-950 px-4 py-12 sm:px-6 lg:px-8 relative overflow-hidden font-sans">
      {/* Dynamic Ambient Background Glow Elements */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-40 pointer-events-none" />

      <div className="w-full max-w-md space-y-6 z-10">
        {/* Header Section */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-blue-500 shadow-xl shadow-blue-500/20 border border-blue-400/30">
            <Fuel className="h-9 w-9 text-white" />
          </div>
          <h1 className="mt-4 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            IOCL Fuel Station Portal
          </h1>
          <p className="mt-1.5 text-xs sm:text-sm text-slate-400 font-medium max-w-xs">
            Automated Shift Settlement, Fuel Inventory &amp; Ledger Operations
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-900/90 border border-slate-800 backdrop-blur-xl p-6 sm:p-8 rounded-3xl shadow-2xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-400" />
              <span className="text-sm font-bold text-white uppercase tracking-wider">System Authentication</span>
            </div>
            <span className="text-[10px] font-mono font-semibold text-slate-400 bg-slate-800 px-2.5 py-1 rounded-full border border-slate-700">
              v2.4 Production
            </span>
          </div>

          {/* Quick Autofill Alert Badge */}
          {autoFilledRole && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 p-3 text-xs text-emerald-300 font-semibold animate-in fade-in duration-200">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>Loaded demo credentials for <strong className="text-white">{autoFilledRole}</strong>!</span>
            </div>
          )}

          {/* Error Alert */}
          {error && (
            <div className="flex items-center gap-2.5 rounded-xl bg-red-500/15 border border-red-500/30 p-3.5 text-xs text-red-300 font-medium">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            {/* Username Input */}
            <div>
              <label htmlFor="username" className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Username
              </label>
              <div className="relative rounded-2xl shadow-sm">
                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none z-10">
                  <User className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  style={{ paddingLeft: '3.25rem' }}
                  className="block w-full rounded-2xl border border-slate-700 bg-slate-950 py-3.5 pr-4 text-sm text-white font-medium placeholder-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all"
                  placeholder="Enter username (e.g. owner)"
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label htmlFor="password" className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative rounded-2xl shadow-sm">
                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none z-10">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ paddingLeft: '3.25rem', paddingRight: '3.75rem' }}
                  className="block w-full rounded-2xl border border-slate-700 bg-slate-950 py-3.5 text-sm text-white font-medium placeholder-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all"
                  placeholder="Enter password"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowPassword((prev) => !prev);
                  }}
                  className="absolute inset-y-0 right-0 z-20 flex items-center justify-center px-4 text-slate-400 hover:text-white transition-colors focus:outline-none touch-target-44 cursor-pointer"
                  title={showPassword ? "Hide password" : "Show password"}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-5 w-5 pointer-events-none" /> : <Eye className="h-5 w-5 pointer-events-none" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-extrabold text-sm uppercase tracking-wider shadow-lg shadow-blue-600/25 active:scale-[0.99] transition-all flex items-center justify-center gap-2 border border-blue-400/20 cursor-pointer"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Verifying Credentials...</span>
                  </div>
                ) : (
                  <>
                    <span>Sign In to System</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Quick Demo Access Grid */}
          <div className="pt-4 border-t border-slate-800">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center mb-3">
              Click Below to Quick Fill Demo Login
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleFillCredentials('owner', 'owner123', 'Station Owner')}
                className="group p-3 rounded-2xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-blue-500/40 text-left transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-400 group-hover:text-blue-300">Station Owner</span>
                  <User className="h-3.5 w-3.5 text-slate-500 group-hover:text-blue-400" />
                </div>
                <p className="text-[11px] font-mono text-slate-400 mt-1">owner / owner123</p>
              </button>

              <button
                type="button"
                onClick={() => handleFillCredentials('manager', 'manager123', 'Shift Manager')}
                className="group p-3 rounded-2xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-emerald-500/40 text-left transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400 group-hover:text-emerald-300">Shift Manager</span>
                  <User className="h-3.5 w-3.5 text-slate-500 group-hover:text-emerald-400" />
                </div>
                <p className="text-[11px] font-mono text-slate-400 mt-1">manager / manager123</p>
              </button>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-[11px] text-slate-500 font-medium">
          IndianOil Automated Retail Outlet Operations &amp; Ledger System
        </p>
      </div>
    </div>
  );
}
