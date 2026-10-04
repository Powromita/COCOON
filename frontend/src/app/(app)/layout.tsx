import { redirect } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect(ROUTES.login);

  const userName = String(user.user_metadata.display_name || user.email || "User");
  return (
    <div className="bg-surface font-body-md text-on-surface antialiased min-h-screen flex flex-col">
      <AppHeader userName={userName} userEmail={user.email ?? ""} />
      <main className="w-full flex-1 pt-16 bg-surface min-h-[calc(100vh-56px)]">{children}</main>
    </div>
  );
}
