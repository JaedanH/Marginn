import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import { useAuth } from "../../context/AuthContext";

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function WaitlistPage() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizeEmail(email);
    if (!isValidEmail(normalized)) {
      setStatus("error");
      setMessage("Please enter a valid email address.");
      return;
    }
    setStatus("loading");
    setMessage("");
    const { error } = await supabase.from("waitlist").insert({ email: normalized });
    if (error) {
      if (error.code === "23505") {
        setStatus("success");
        setMessage("You are already on the list — we will be in touch.");
        return;
      }
      setStatus("error");
      setMessage(error.message || "Something went wrong. Please try again.");
      return;
    }
    setStatus("success");
    setMessage("Thanks — you are on the waitlist.");
    setEmail("");
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-gray-50 to-white">
      <header className="border-b border-gray-100 bg-white/80 backdrop-blur-sm">
        <div className="max-w-lg mx-auto px-6 py-4 flex items-center justify-between">
          <span className="text-lg font-bold text-gray-900">Marginn</span>
          <div className="flex gap-4 text-sm">
            <Link to="/signin" className="text-[#1a3d2b] font-medium hover:underline">
              Sign in
            </Link>
            <Link to="/signup" className="text-gray-600 hover:text-gray-900">
              Sign up
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Coming soon</h1>
          <p className="text-gray-600 text-sm mb-6">
            Marginn is almost here. Leave your email and we will let you know when you can start scanning.
          </p>

          {user ? (
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-900">
              You are signed in.{" "}
              <Link to="/scan" className="font-semibold underline">
                Go to the scanner
              </Link>
              {" · "}
              <Link to="/dashboard" className="font-semibold underline">
                Dashboard
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label htmlFor="waitlist-email" className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Email
                </label>
                <input
                  id="waitlist-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(ev) => setEmail(ev.target.value)}
                  disabled={status === "loading"}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/30 focus:border-[#1a3d2b] disabled:bg-gray-50"
                  placeholder="you@example.com"
                />
              </div>
              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full py-2.5 rounded-md bg-[#1a3d2b] text-white text-sm font-semibold hover:bg-[#2d5a40] disabled:opacity-60 transition-colors"
              >
                {status === "loading" ? "Joining…" : "Join waitlist"}
              </button>
              {message ? (
                <p
                  className={`text-sm ${status === "error" ? "text-red-600" : "text-emerald-700"}`}
                  role="status"
                >
                  {message}
                </p>
              ) : null}
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
