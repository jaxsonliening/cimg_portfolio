export default function Loading() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-8 flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="skeleton h-9 w-56 sm:h-10 sm:w-72" />
          <div className="skeleton h-4 w-40" />
        </div>
        <div className="flex items-center gap-2">
          <div className="skeleton h-9 w-32" />
          <div className="skeleton h-9 w-28" />
          <div className="skeleton h-9 w-9" />
        </div>
      </div>

      <section className="mb-8 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="skeleton h-[520px] w-full rounded-2xl" />
        </div>
        <div className="lg:col-span-1 space-y-4">
          <div className="skeleton h-28 w-full rounded-2xl" />
          <div className="skeleton h-44 w-full rounded-2xl" />
          <div className="skeleton h-44 w-full rounded-2xl" />
        </div>
      </section>

      <div className="skeleton mb-8 h-[440px] w-full rounded-2xl" />
      <div className="skeleton h-96 w-full rounded-2xl" />
    </main>
  );
}
