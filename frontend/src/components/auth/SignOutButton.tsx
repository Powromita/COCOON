"use client";

import { useRouter } from "next/navigation";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton({ initials }: { initials: string }) {
  const router = useRouter();
  async function signOut() {
    await createClient().auth.signOut();
    router.replace(ROUTES.login);
    router.refresh();
  }
  return <button type="button" onClick={signOut} title="Sign out" aria-label="Sign out" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-container font-bold text-on-primary ring-2 ring-surface-container-low transition-shadow hover:ring-primary-fixed">{initials}</button>;
}
