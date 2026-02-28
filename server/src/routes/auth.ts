import { Router } from "express";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { asyncHandler } from "../utils/async-handler.js";
import { env } from "../config/env.js";
import { googleEnabled, passport } from "../config/passport.js";
import { prisma } from "../config/db.js";

export const authRouter = Router();

const signupSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

const publicUser = (user: {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  avatarUrl: user.avatarUrl,
});

authRouter.get("/me", (req, res) => {
  if (!req.isAuthenticated?.() || !req.user) {
    return res.json({ authenticated: false, user: null });
  }

  res.json({ authenticated: true, user: publicUser(req.user) });
});

authRouter.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const payload = signupSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: payload.email } });
    if (existing) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    const passwordHash = await hash(payload.password, 12);

    const user = await prisma.user.create({
      data: {
        name: payload.name,
        email: payload.email,
        passwordHash,
      },
    });

    await new Promise<void>((resolve, reject) => {
      req.login(user, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    res.status(201).json({ authenticated: true, user: publicUser(user) });
  }),
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const payload = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: payload.email } });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const valid = await compare(payload.password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    await new Promise<void>((resolve, reject) => {
      req.login(user, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    res.json({ authenticated: true, user: publicUser(user) });
  }),
);

authRouter.get("/google", (req, res, next) => {
  if (!googleEnabled) {
    return res.status(503).json({ message: "Google SSO is not configured." });
  }

  return passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});

authRouter.get("/google/callback", (req, res, next) => {
  if (!googleEnabled) {
    return res.redirect(`${env.CLIENT_URL}/login?error=sso_not_configured`);
  }

  return passport.authenticate("google", {
    failureRedirect: `${env.CLIENT_URL}/login?error=google_auth_failed`,
    successRedirect: `${env.CLIENT_URL}/app`,
  })(req, res, next);
});

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    await new Promise<void>((resolve, reject) => {
      req.logout((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    req.session.destroy(() => {
      res.clearCookie("rms.sid");
      res.json({ message: "Logged out." });
    });
  }),
);

authRouter.post(
  "/dev-login",
  asyncHandler(async (req, res) => {
    if (!env.ALLOW_DEV_AUTH) {
      return res.status(403).json({ message: "Dev auth is disabled." });
    }

    const email = (req.body?.email as string | undefined) ?? "demo@rms.local";

    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name: "Demo User",
      },
    });

    await new Promise<void>((resolve, reject) => {
      req.login(user, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    res.json({ authenticated: true, user: publicUser(user) });
  }),
);
