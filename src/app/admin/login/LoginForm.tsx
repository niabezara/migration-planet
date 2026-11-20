"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, { status: "idle" });
  return (
    <form action={action} className="mt-6 space-y-3">
      <label className="block text-[11px] uppercase tracking-[0.25em] text-white/45" htmlFor="email">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        className="w-full rounded-md border border-white/15 bg-white/[0.04] px-3 py-2 text-[14px] text-white outline-none focus:border-white/40"
      />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md border border-[#ffd59a]/40 bg-[#ffd59a]/10 px-3 py-2 text-[13px] text-[#ffe7c4] transition-colors hover:bg-[#ffd59a]/20 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send sign-in link"}
      </button>
      {state.message && (
        <p role="status" className={`text-[12.5px] ${state.status === "error" ? "text-[#ffb4a0]" : "text-white/65"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
