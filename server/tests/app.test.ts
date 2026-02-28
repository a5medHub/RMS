import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";

describe("auth route", () => {
  it("returns unauthenticated state when no session", async () => {
    const response = await request(app).get("/api/auth/me");
    expect(response.status).toBe(200);
    expect(response.body.authenticated).toBe(false);
  });

  it("returns health status", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });
});

