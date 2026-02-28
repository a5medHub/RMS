import { compare, hash } from "bcryptjs";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findUniqueMock = vi.fn();
const createMock = vi.fn();
const upsertMock = vi.fn();

vi.mock("../src/config/db.js", () => ({
  prisma: {
    user: {
      findUnique: findUniqueMock,
      create: createMock,
      upsert: upsertMock,
    },
  },
}));

vi.mock("../src/config/env.js", () => ({
  env: {
    CLIENT_URL: "http://localhost:5173",
    ALLOW_DEV_AUTH: true,
  },
  isProduction: false,
}));

vi.mock("../src/config/passport.js", () => ({
  googleEnabled: false,
  passport: {
    authenticate: () => () => undefined,
  },
}));

const buildTestApp = async () => {
  const { authRouter } = await import("../src/routes/auth.js");
  const app = express();

  app.use(express.json());
  app.use((req, _res, next) => {
    const mutableReq = req as express.Request & {
      user?: unknown;
      login?: (user: unknown, done: (err?: unknown) => void) => void;
      logout?: (done: (err?: unknown) => void) => void;
      isAuthenticated?: () => boolean;
      session?: { destroy: (done: () => void) => void };
    };

    mutableReq.login = (user, done) => {
      mutableReq.user = user;
      done();
    };

    mutableReq.logout = (done) => done();
    mutableReq.isAuthenticated = () => Boolean(mutableReq.user);
    mutableReq.session = {
      destroy: (done) => done(),
    };

    next();
  });

  app.use("/api/auth", authRouter);
  return app;
};

describe("auth hashing flow", () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    createMock.mockReset();
    upsertMock.mockReset();
  });

  it("signup stores hashed password", async () => {
    findUniqueMock.mockResolvedValue(null);
    createMock.mockImplementation(async ({ data }: { data: { name: string; email: string; passwordHash: string } }) => ({
      id: "u1",
      name: data.name,
      email: data.email,
      passwordHash: data.passwordHash,
      avatarUrl: null,
      role: "USER",
    }));

    const app = await buildTestApp();
    const response = await request(app).post("/api/auth/signup").send({
      name: "Ahmad",
      email: "ahmad@example.com",
      password: "password@123",
    });

    expect(response.status).toBe(201);
    expect(createMock).toHaveBeenCalledTimes(1);

    const createArg = createMock.mock.calls[0]?.[0] as { data: { passwordHash: string } };
    expect(createArg.data.passwordHash).not.toBe("password@123");
    await expect(compare("password@123", createArg.data.passwordHash)).resolves.toBe(true);
  });

  it("login validates hashed password", async () => {
    const passwordHash = await hash("password@123", 12);
    findUniqueMock.mockResolvedValue({
      id: "u1",
      name: "Ahmad",
      email: "ahmad@example.com",
      avatarUrl: null,
      role: "USER",
      passwordHash,
    });

    const app = await buildTestApp();
    const response = await request(app).post("/api/auth/login").send({
      email: "ahmad@example.com",
      password: "password@123",
    });

    expect(response.status).toBe(200);
    expect(response.body.authenticated).toBe(true);
    expect(response.body.user.email).toBe("ahmad@example.com");
  });
});
