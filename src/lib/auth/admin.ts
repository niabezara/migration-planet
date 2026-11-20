import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SessionUser {
  id: string;
  email: string | null;
  isAdmin: boolean;
}

/**
 * The signed-in user, verified with Supabase Auth (not just decoded from the
 * cookie), and whether they are an administrator according to the database.
 * Null when nobody is signed in. Data Access Layer: every admin page and
 * action authorises through here.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const { data: isAdmin, error: rpcError } = await supabase.rpc("is_admin");
  if (rpcError) throw new Error(`Admin check failed: ${rpcError.message}`);
  return { id: data.user.id, email: data.user.email ?? null, isAdmin: isAdmin === true };
}

/** For admin-only pages and actions: redirects anyone who is not an administrator. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!user.isAdmin) redirect("/admin/login?error=not-admin");
  return user;
}
