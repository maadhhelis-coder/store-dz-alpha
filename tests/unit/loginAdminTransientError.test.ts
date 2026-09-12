import { describe, expect, it, vi, beforeEach } from "vitest";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";

const signInWithPassword = vi.fn();
vi.mock("@/lib/auth/supabaseServerClient", () => ({
  createSupabaseServerClient: async () => ({ auth: { signInWithPassword, signOut: vi.fn() } }),
}));
vi.mock("@/server/repositories/adminUsersRepository", () => ({ findAdminByAuthUserId: vi.fn(), touchLastLogin: vi.fn() }));

import { loginAdmin, InvalidCredentialsError, AuthUnavailableError } from "@/server/services/authService";

const input = { email: "a@b.c", password: "x" };

describe("loginAdmin — تمييز رفض بيانات الدخول عن عطل Supabase العابر", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    signInWithPassword.mockReset();
  });

  it("400 invalid_credentials → InvalidCredentialsError (401)", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: null }, error: new AuthApiError("Invalid login credentials", 400, "invalid_credentials") });
    await expect(loginAdmin(input)).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it("5xx / شبكة → AuthUnavailableError (503)", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: null }, error: new AuthRetryableFetchError("{}", 502) });
    await expect(loginAdmin(input)).rejects.toBeInstanceOf(AuthUnavailableError);
  });

  it("429 من Supabase نفسه → AuthUnavailableError لا «بيانات خاطئة»", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: null }, error: new AuthApiError("Request rate limit reached", 429, "over_request_rate_limit") });
    await expect(loginAdmin(input)).rejects.toBeInstanceOf(AuthUnavailableError);
  });
});
