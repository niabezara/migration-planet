import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/admin";
import { signOut } from "./actions";

export default function AdminPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-[11px] font-medium uppercase tracking-[0.55em] text-white/75">Research admin</h1>
      <div className="mt-1 h-px w-10 bg-linear-to-r from-[#e8e3d8]/70 to-transparent" />
      <Suspense fallback={<p className="mt-8 text-[13px] text-white/45">Checking access…</p>}>
        <Dashboard />
      </Suspense>
    </main>
  );
}

async function Dashboard() {
  const user = await requireAdmin();
  return (
    <section className="mt-8">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[13px] text-white/60">
          Signed in as <span className="text-white/85">{user.email}</span>
        </p>
        <form action={signOut}>
          <button className="rounded-md border border-white/15 px-3 py-1.5 text-[12px] text-white/70 hover:bg-white/[0.06]">
            Sign out
          </button>
        </form>
      </div>
      <p className="mt-8 text-[13px] leading-relaxed text-white/50">
        The research dashboard (discovered publications, proposed changes, review) arrives in a later phase.
      </p>
    </section>
  );
}
