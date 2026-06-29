import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-click backup: a JSON dump of everything the signed-in account owns.
// RLS scopes each query to the user automatically.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [students, parents, teachers, links, interactions, followUps] =
    await Promise.all([
      supabase.from("students").select("*"),
      supabase.from("parents").select("*"),
      supabase.from("teachers").select("*"),
      supabase.from("student_parents").select("*"),
      supabase
        .from("interactions")
        .select("*, action_items(*)")
        .order("occurred_at", { ascending: false }),
      supabase.from("follow_ups").select("*").order("due_at"),
    ]);

  const backup = {
    exported_at: new Date().toISOString(),
    account: user.email,
    students: students.data ?? [],
    parents: parents.data ?? [],
    teachers: teachers.data ?? [],
    student_parents: links.data ?? [],
    interactions: interactions.data ?? [],
    follow_ups: followUps.data ?? [],
  };

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="parent-notes-backup-${stamp}.json"`,
    },
  });
}
