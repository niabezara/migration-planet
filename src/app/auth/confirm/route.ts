import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Landing point of the magic link. Supports both link styles Supabase can
 * send: PKCE (`?code=`, the default template) and `?token_hash=&type=`.
 * Always continues to /admin, which does its own authorisation.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const supabase = await createSupabaseServerClient();
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("missing token") };

  const target = error ? "/admin/login?error=link-invalid" : "/admin";
  return NextResponse.redirect(new URL(target, request.url));
}
