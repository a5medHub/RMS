import { UserRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { canDeleteRecipe, canEditRecipe, canViewRecipe, statusFromInput } from "../src/utils/permissions.js";

describe("permissions", () => {
  it("allows authenticated users to view recipes", () => {
    expect(canViewRecipe(true)).toBe(true);
    expect(canViewRecipe(false)).toBe(false);
  });

  it("allows user to edit own non-system recipe", () => {
    expect(
      canEditRecipe({
        ownerId: "u1",
        userId: "u1",
        userRole: UserRole.USER,
        isSystem: false,
      }),
    ).toBe(true);
  });

  it("prevents user from editing someone else recipe", () => {
    expect(
      canEditRecipe({
        ownerId: "owner",
        userId: "viewer",
        userRole: UserRole.USER,
        isSystem: false,
      }),
    ).toBe(false);
  });

  it("prevents user from editing system recipe", () => {
    expect(
      canDeleteRecipe({
        ownerId: "u1",
        userId: "u1",
        userRole: UserRole.USER,
        isSystem: true,
      }),
    ).toBe(false);
  });

  it("allows admin to edit/delete any recipe", () => {
    expect(
      canEditRecipe({
        ownerId: "owner",
        userId: "admin",
        userRole: UserRole.ADMIN,
        isSystem: true,
      }),
    ).toBe(true);

    expect(
      canDeleteRecipe({
        ownerId: "owner",
        userId: "admin",
        userRole: UserRole.ADMIN,
        isSystem: false,
      }),
    ).toBe(true);
  });

  it("maps user-facing statuses", () => {
    expect(statusFromInput("to try")).toBe("TO_TRY");
    expect(statusFromInput("favorite")).toBe("FAVORITE");
  });
});