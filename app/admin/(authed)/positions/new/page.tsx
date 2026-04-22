import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AddPositionForm } from "./add-position-form";

export default async function NewPositionPage() {
  const supabase = await createClient();

  const { data: committees, error } = await supabase
    .from("committees")
    .select("id, name, display_order")
    .order("display_order", { ascending: true });

  if (error || !committees || committees.length === 0) {
    // No committees seeded yet — the schema migration hasn't been run.
    redirect("/admin");
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Add position</h1>
        <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-700">
          ← Back to admin
        </Link>
      </div>
      <AddPositionForm
        committees={committees.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
