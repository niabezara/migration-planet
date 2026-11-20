import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabasePublicEnv } from "@/lib/supabase/env";

/**
 * Keeps the Supabase session cookie fresh on admin routes only. The public
 * globe never runs this. Authorisation itself happens in the pages and
 * actions (src/lib/auth/admin.ts), not here.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = supabasePublicEnv();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });
  // Refreshes an expired access token (writes new cookies through setAll).
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
