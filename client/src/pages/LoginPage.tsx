import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { authApi } from "../api";

export const LoginPage = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const enableDevLogin = import.meta.env.VITE_ENABLE_DEV_LOGIN === "true";

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      if (mode === "signup") {
        return authApi.signup({ name, email, password });
      }

      return authApi.login({ email, password });
    },
    onSuccess: async () => {
      setError(null);
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
      <section className="login-card">
        <h1>Recipe Management System</h1>
        <p>Plan meals, share recipes, and cook smarter with pantry-aware AI.</p>

        <div className="chip-row" aria-label="Authentication mode">
          <button className={mode === "signin" ? "chip active" : "chip"} onClick={() => setMode("signin")}>
            Sign In
          </button>
          <button className={mode === "signup" ? "chip active" : "chip"} onClick={() => setMode("signup")}>
            Sign Up
          </button>
        </div>

        <form
          className="pantry-form"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            authMutation.mutate();
          }}
        >
          {mode === "signup" ? (
            <input
              placeholder="Full name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          ) : null}
          <input
            placeholder="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
          />
          <button type="submit">{authMutation.isPending ? "Please wait..." : mode === "signup" ? "Create account" : "Sign in"}</button>
        </form>

        {error ? <p className="meta-line">{error}</p> : null}

        <button className="secondary" onClick={() => authApi.startGoogle()}>
          Option 2: Continue with Google
        </button>

        {enableDevLogin ? (
          <button className="ghost" onClick={() => devLogin.mutate()}>
            {devLogin.isPending ? "Signing in..." : "Dev login"}
          </button>
        ) : null}
      </section>
    </main>
  );
};
