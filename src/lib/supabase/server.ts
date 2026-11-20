import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabasePublicEnv } from "./env";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers,
 * acting as the signed-in user (or anon). Reads the request cookies, so call
 * it only inside a Suspense boundary or a request-time handler.
 *
 * `connection()` keeps everything after it out of prerendering (including
 * runtime prefetches, where cookies are available): the auth client compares
 * token expiry with the current time, which must happen per request.
 */
export async function createSupabaseServerClient() {
  await connection();
  const cookieStore = await cookies();
  const { url, key } = supabasePublicEnv();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components cannot set cookies; the proxy refreshes the session instead.
        }
      },
    },
  });
}
