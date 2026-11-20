/**
 * Minimal declarations of the Supabase Edge Runtime (Deno) globals used by
 * supabase/functions/*, so the root TypeScript check covers that code too.
 * The functions import npm packages as "npm:<name>@<version>"; tsconfig.json
 * maps those specifiers to the same versions in node_modules.
 */
declare namespace Deno {
  const env: { get(key: string): string | undefined };
  function serve(handler: (req: Request) => Response | Promise<Response>): unknown;
}
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };
