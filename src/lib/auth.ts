import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { User } from "@supabase/supabase-js";

// Returns the signed-in user or redirects to /login. Also ensures an
// app_users row exists (a backstop for users created before the DB trigger).
export async function requireUser(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  await supabase
    .from("app_users")
    .upsert(
      { id: user.id, email: user.email ?? "" },
      { onConflict: "id", ignoreDuplicates: true },
    );

  return user;
}

export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
