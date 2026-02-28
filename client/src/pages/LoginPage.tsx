import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { authApi } from "../api";

type AuthMode = "signin" | "signup";

type PrefillState = {
  remember: boolean;
  email: string;
  name: string;
};

const PREFILL_KEY = "rms_auth_prefill";

const signinSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const signupSchema = signinSchema.extend({
  name: z.string().min(2, "Name must be at least 2 characters.").max(80, "Name is too long."),
});

const loadPrefill = (): PrefillState => {
  try {
    const raw = window.localStorage.getItem(PREFILL_KEY);
    if (!raw) {
      return { remember: true, email: "", name: "" };
    }

    const parsed = JSON.parse(raw) as Partial<PrefillState>;
    return {
      remember: parsed.remember ?? true,
      email: parsed.email ?? "",
      name: parsed.name ?? "",
    };
  } catch {
    return { remember: true, email: "", name: "" };
  }
};

const persistPrefill = (state: PrefillState) => {
  if (!state.remember) {
    window.localStorage.removeItem(PREFILL_KEY);
    return;
  }

  window.localStorage.setItem(PREFILL_KEY, JSON.stringify(state));
};

export const LoginPage = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const enableDevLogin = import.meta.env.VITE_ENABLE_DEV_LOGIN === "true";

  const prefill = useMemo(() => loadPrefill(), []);

  const [mode, setMode] = useState<AuthMode>("signin");
  const [name, setName] = useState(prefill.name);
  const [email, setEmail] = useState(prefill.email);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(prefill.remember);
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["me"],
    queryFn: authApi.me,
  });

  useEffect(() => {
    if (data?.authenticated) {
      navigate("/app", { replace: true });
    }
  }, [data, navigate]);

  const authMutation = useMutation({
    mutationFn: async () => {
      const trimmedEmail = email.trim();
      const trimmedName = name.trim();

      if (mode === "signup") {
        const parsed = signupSchema.safeParse({ name: trimmedName, email: trimmedEmail, password });
        if (!parsed.success) {
          throw new Error(parsed.error.issues[0]?.message ?? "Invalid sign up form.");
        }

        return authApi.signup(parsed.data);
      }

      const parsed = signinSchema.safeParse({ email: trimmedEmail, password });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "Invalid sign in form.");
      }

      return authApi.login(parsed.data);
    },
    onSuccess: async () => {
      persistPrefill({ remember, email: email.trim(), name: name.trim() });
      setError(null);
      setPassword("");
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate("/app", { replace: true });
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message);
    },
  });

  const devLogin = useMutation({
    mutationFn: () => authApi.devLogin("demo@rms.local"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate("/app");
    },
  });

  return (
    <main className="login-shell">
      <section className="login-card login-card-polished">
        <div>
          <p className="eyebrow">Recipe Management System</p>
          <h1>{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
          <p>
            Save your recipes, review community dishes, and get AI-powered cooking suggestions based on your pantry.
          </p>
        </div>

        <div className="mode-switch" aria-label="Authentication mode">
          <button
            className={mode === "signin" ? "active" : ""}
            onClick={() => {
              setMode("signin");
              setError(null);
            }}
            type="button"
          >
            Sign In
          </button>
          <button
            className={mode === "signup" ? "active" : ""}
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
            type="button"
          >
            Sign Up
          </button>
        </div>

        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            authMutation.mutate();
          }}
        >
          {mode === "signup" ? (
            <label>
              Full name
              <input
                placeholder="Your full name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                required
              />
            </label>
          ) : null}

          <label>
            Email
            <input
              placeholder="you@example.com"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label>
            Password
            <input
              placeholder="At least 8 characters"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
            />
          </label>

          <label className="remember-row">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            Remember my name/email on this device
          </label>

          <button type="submit" disabled={authMutation.isPending}>
            {authMutation.isPending ? "Please wait..." : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        {error ? <p className="error-line">{error}</p> : null}

        <div className="divider">
          <span>Option 2</span>
        </div>

        <button className="secondary" onClick={() => authApi.startGoogle()} type="button">
          Continue with Google
        </button>

        {enableDevLogin ? (
          <button className="ghost" onClick={() => devLogin.mutate()} type="button">
            {devLogin.isPending ? "Signing in..." : "Dev login"}
          </button>
        ) : null}
      </section>
    </main>
  );
};
