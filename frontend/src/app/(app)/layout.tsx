import AppHeader from "@/components/layout/AppHeader";
import { CURRENT_USER } from "@/lib/session";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface font-body-md text-on-surface antialiased min-h-screen flex flex-col">
      <AppHeader userName={CURRENT_USER.name} userEmail={CURRENT_USER.email} />
      <main className="w-full flex-1 pt-16 bg-surface min-h-[calc(100vh-56px)]">{children}</main>
    </div>
  );
}
