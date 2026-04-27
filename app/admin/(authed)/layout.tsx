import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "./sign-out-button";

export default async function AdminAuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name")
    .eq("user_id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    redirect("/admin/login?unauthorized=1");
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800">
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-4">
            <Link href="/admin" className="text-lg font-semibold">
              CIMG Admin
            </Link>
            <nav className="flex items-baseline gap-3 text-sm text-gray-500 dark:text-gray-400">
              <Link href="/admin/cash" className="hover:text-gray-900 dark:hover:text-gray-100">
                Cash
              </Link>
              <Link href="/admin/tickers" className="hover:text-gray-900 dark:hover:text-gray-100">
                Tickers
              </Link>
              <Link href="/admin/trades" className="hover:text-gray-900 dark:hover:text-gray-100">
                Trades
              </Link>
              <Link href="/admin/team" className="hover:text-gray-900 dark:hover:text-gray-100">
                Team
              </Link>
              <Link href="/admin/audit" className="hover:text-gray-900 dark:hover:text-gray-100">
                Audit
              </Link>
            </nav>
            <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
              {profile.display_name ?? user.email}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 shadow-sm transition-all hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              View Portfolio
            </Link>
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
