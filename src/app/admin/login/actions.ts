"use server";

import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface LoginState {
  status: "idle" | "sent" | "error";
  message?: string;
}

const SENT: LoginState = {
  status: "sent",
  message: "If this address is allowed, a sign-in link is on its way. Open it in this browser.",
};

/**
 * Sends a magic link, but only to the configured administrator address
 * (ADMIN_EMAIL, server-side). Any other address gets the same neutral reply,
 * so the form does not reveal which address is the admin's.
 */
export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: "error", message: "Enter a valid email address." };

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail) return { status: "error", message: "Sign-in is not configured (ADMIN_EMAIL is missing)." };
  if (email !== adminEmail) return SENT;

  const origin = (await headers()).get("origin") ?? process.env.SITE_URL ?? "http://localhost:3000";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });
  if (error) return { status: "error", message: `Could not send the link: ${error.message}` };
  return SENT;
}
