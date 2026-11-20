import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

const ERRORS: Record<string, string> = {
  "not-admin": "This account is not an administrator.",
  "link-invalid": "The sign-in link is invalid or has expired. Request a new one.",
};

export default function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  return (
    <main className="mx-auto max-w-sm px-4 pt-[18vh]">
      <h1 className="text-[11px] font-medium uppercase tracking-[0.55em] text-white/75">Research admin</h1>
      <div className="mt-1 h-px w-10 bg-linear-to-r from-[#e8e3d8]/70 to-transparent" />
      <p className="mt-6 text-[13px] leading-relaxed text-white/55">
        Sign in with a one-time link sent to the administrator&apos;s email.
      </p>
      <Suspense>
        <LoginError searchParams={searchParams} />
      </Suspense>
      <LoginForm />
    </main>
  );
}

async function LoginError({ searchParams }: Pick<PageProps<"/admin/login">, "searchParams">) {
  const { error } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;
  return message ? <p className="mt-4 text-[12.5px] text-[#ffb4a0]">{message}</p> : null;
}
