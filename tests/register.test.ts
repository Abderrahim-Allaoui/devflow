import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/auth/register/route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { create: vi.fn() },
    loginAttempt: {
      findUnique: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({ count: 1 }),
      upsert: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));
vi.mock("@/lib/auth", () => ({
  hashPassword: vi.fn(async () => "hash"),
  setSessionCookie: vi.fn(async () => {}),
}));

const create = (prisma as unknown as { user: { create: ReturnType<typeof vi.fn> } }).user.create;
const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  }));

beforeEach(() => vi.clearAllMocks());

describe("register", () => {
  it("creates an account and returns 201", async () => {
    create.mockResolvedValue({ id: "u1", name: "Ada", email: "ada@x.co" });
    const res = await post({ name: "Ada", email: "ada@x.co", password: "longenough" });
    expect(res.status).toBe(201);
  });

  it("duplicate email returns the same generic 400 (no enumeration)", async () => {
    create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    const res = await post({ name: "Ada", email: "taken@x.co", password: "longenough" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Could not create account with these details");
  });

  it("rejects passwords above the max length before hashing", async () => {
    const res = await post({ name: "Ada", email: "ada@x.co", password: "a".repeat(129) });
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});
