import React, { useState } from "react";
import { Link } from "react-router-dom";
import { AdminScreen } from "@/screens/AdminScreen";
import { supabase } from "@/supabase";
import {
  ADMIN_PASSWORD_FROZEN,
  ADMIN_PASSWORD,
  ADMIN_NO_PASSWORD,
} from "@/config/admin";

const Admin: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(ADMIN_NO_PASSWORD ? true : false);
  const [loading, setLoading] = useState(false);

  // On mount: if user is already signed in, ensure they are admin
  React.useEffect(() => {
    if (ADMIN_NO_PASSWORD) return;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const user = data?.user ?? null;
        if (user) {
          const { data: hasRole } = await supabase.rpc("has_role", {
            _user_id: user.id,
            _role: "admin",
          });
          if (Boolean(hasRole) === true) setAuthed(true);
        }
      } catch (err) {
        console.debug("Could not verify current user's admin role", err);
      }
    })();
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        throw error;
      }
      if (!data.user) {
        throw new Error("No user returned from supabase auth");
      }
      // check role via RPC; function has_role(user_uuid, role)
      const { data: hasRole, error: roleErr } = await supabase.rpc("has_role", {
        _user_id: data.user.id,
        _role: "admin",
      });
      if (roleErr) {
        console.error("role rpc error", roleErr);
        throw roleErr;
      }
      // hasRole is an array response from RPC; ensure it's truthy
      const isAdmin = Boolean(hasRole);
      if (isAdmin) {
        setAuthed(true);
      } else {
        // fallback, not allowed
        alert("Unauthorized: you are not an admin");
        try {
          await supabase.auth.signOut();
        } catch (e) {
          console.debug("Sign-out failed during unauthorized fallback", e);
        }
      }
    } catch (err: unknown) {
      console.error(err);
      if (err instanceof Error) {
        alert(err.message ?? "Sign-in failed");
      } else {
        alert("Sign-in failed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020f0b] flex items-center justify-center px-4">
      <div className="rounded-[32px] border border-[#183325] bg-[#03160f] px-8 py-10 md:px-12 md:py-12 text-slate-50 shadow-[0_24px_80px_rgba(0,0,0,0.75)] w-full max-w-3xl">
        <h1 className="text-center text-3xl md:text-4xl font-semibold text-[#facc15] font-['Playfair_Display',serif] flex items-center justify-center gap-3">
          🎄 Admin Access
        </h1>

        {ADMIN_NO_PASSWORD && (
          <div className="mt-3 mb-2 text-sm text-yellow-300 text-center">
            ⚠️ Admin authentication is disabled for development/testing. This
            should not be enabled in production.
          </div>
        )}

        {!authed ? (
          <div className="mt-8 max-w-md mx-auto">
            {ADMIN_PASSWORD_FROZEN ? (
              <>
                <label className="block text-slate-200 mb-2">
                  Admin Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-3xl bg-[#020f0b] border border-[#183325] px-4 py-3 text-slate-50 mb-4"
                />
              </>
            ) : (
              <>
                <label className="block text-slate-200 mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-3xl bg-[#020f0b] border border-[#183325] px-4 py-3 text-slate-50 mb-4"
                />
                <label className="block text-slate-200 mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-3xl bg-[#020f0b] border border-[#183325] px-4 py-3 text-slate-50 mb-4"
                />
              </>
            )}
            <div className="flex gap-4">
              {ADMIN_PASSWORD_FROZEN ? (
                <button
                  onClick={async () => {
                    // Validate frozen admin password locally
                    setLoading(true);
                    try {
                      if (password === ADMIN_PASSWORD) {
                        setAuthed(true);
                      } else {
                        alert("Invalid admin password");
                      }
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="flex-1 bg-[#e11d48] hover:bg-[#be123c] rounded-[32px] px-6 py-3 text-lg font-semibold"
                  disabled={loading}
                >
                  {loading ? "Verifying..." : "Verify"}
                </button>
              ) : (
                <button
                  onClick={handleLogin}
                  className="flex-1 bg-[#e11d48] hover:bg-[#be123c] rounded-[32px] px-6 py-3 text-lg font-semibold"
                  disabled={loading}
                >
                  {loading ? "Signing in..." : "Login"}
                </button>
              )}
              <Link
                to="/"
                className="flex-1 text-center bg-[#e11d48] hover:bg-[#be123c] rounded-[32px] px-6 py-3 text-lg font-semibold"
              >
                Back to Home
              </Link>
            </div>
          </div>
        ) : (
          <AdminScreen
            room={null}
            onBackHome={async () => {
              setAuthed(false);
              try {
                await supabase.auth.signOut();
              } catch (e) {
                console.debug("Sign-out failed", e);
              }
            }}
          />
        )}
      </div>
    </div>
  );
};

export default Admin;
