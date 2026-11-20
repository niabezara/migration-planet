import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Research admin",
  robots: { index: false, follow: false },
};

/** The root body hides overflow for the globe; admin pages scroll inside this wrapper. */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <div className="h-full overflow-y-auto bg-[#02040a] text-white">{children}</div>;
}
