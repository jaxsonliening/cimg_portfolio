import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 py-24 text-center">
      <div className="text-7xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
        404
      </div>
      <p className="mt-3 text-base text-gray-500 dark:text-gray-400">
        That page doesn&apos;t exist.
      </p>
      <Link
        href="/"
        className="mt-8 rounded-lg bg-gray-900 dark:bg-gray-100 px-4 py-2 text-sm font-medium text-white dark:text-gray-900 shadow-sm transition-all hover:bg-gray-800 dark:hover:bg-gray-200"
      >
        Back to Portfolio
      </Link>
    </main>
  );
}
