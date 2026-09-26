import AppHeader from "@/components/layout/AppHeader";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface font-body-md text-on-surface antialiased min-h-screen flex flex-col">
      <AppHeader />
      <main className="w-full flex-1 pt-16 bg-surface min-h-[calc(100vh-56px)]">{children}</main>
    </div>
  );
}
