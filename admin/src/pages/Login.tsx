import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import logo from "../assets/flying-transparent-logo.png";
import { apiErrorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      const from = (location.state as { from?: Location })?.from?.pathname ?? "/tours";
      navigate(from, { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-neutral-50 via-white to-red-50/40 p-4">
      <div className="pointer-events-none absolute -top-24 right-0 h-96 w-96 rounded-full bg-red-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-80 w-80 rounded-full bg-neutral-400/10 blur-3xl" />
      <form
        onSubmit={handleSubmit}
        className="page-enter relative w-full max-w-sm rounded-2xl border border-neutral-200/80 bg-white/90 p-8 shadow-xl shadow-neutral-200/50 backdrop-blur"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <img src={logo} alt="Flying Leader" className="mb-5 h-11 w-auto" />
          <h1 className="text-lg font-semibold text-neutral-900">Welcome back</h1>
          <p className="mt-1 text-sm text-neutral-500">Sign in to manage tours, bookings, and content.</p>
        </div>

        {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <label className="mb-3 block text-sm">
          <span className="mb-1 block font-medium text-neutral-700">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 outline-none focus:border-red-500"
          />
        </label>

        <label className="mb-6 block text-sm">
          <span className="mb-1 block font-medium text-neutral-700">Password</span>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 pr-10 outline-none focus:border-red-500"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              title={showPassword ? "Hide password" : "Show password — useful if you're not sure what you typed"}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-neutral-400 hover:text-neutral-600"
            >
              {showPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </label>
        <p className="-mt-4 mb-6 text-xs text-neutral-400">
          Trouble signing in? Use the eye icon to check your password, and confirm your email is correct — contact
          the development team if the problem continues.
        </p>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-gradient-to-b from-red-500 to-red-600 py-2.5 text-sm font-semibold text-white shadow-sm shadow-red-600/30 transition-all hover:from-red-600 hover:to-red-700 hover:shadow-md hover:shadow-red-600/30 active:scale-[.99] disabled:opacity-50"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
