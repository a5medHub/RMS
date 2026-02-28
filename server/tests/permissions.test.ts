import { SharePermission } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { canEditRecipe, canViewRecipe, statusFromInput } from "../src/utils/permissions.js";

describe("permissions", () => {
  it("allows owner to view and edit", () => {
    expect(canViewRecipe("u1", "u1")).toBe(true);
    expect(canEditRecipe("u1", "u1")).toBe(true);
  });

  it("allows viewer to view but not edit", () => {
    expect(canViewRecipe("owner", "viewer", SharePermission.VIEWER)).toBe(true);
    expect(canEditRecipe("owner", "viewer", SharePermission.VIEWER)).toBe(false);
  });

  it("maps user-facing statuses", () => {
    expect(statusFromInput("to try")).toBe("TO_TRY");
    expect(statusFromInput("favorite")).toBe("FAVORITE");
  });
});

