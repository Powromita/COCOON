import Link from "next/link";
import LanguageToggle from "@/components/i18n/LanguageToggle";
import BrandMark from "@/components/layout/BrandMark";
import { ROUTES } from "@/lib/routes";
import { T } from "@/lib/i18n";

/** Minimal shell for the authentication gate — brand mark + compliance footer, no AppHeader. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative bg-background font-body-md text-on-surface antialiased min-h-screen flex flex-col justify-between selection:bg-primary selection:text-on-primary">
      <LanguageToggle className="absolute top-4 right-4" />
      <header className="w-full pt-margin-lg pb-margin flex flex-col items-center justify-center">
        <Link href={ROUTES.login} className="flex flex-col items-center text-center gap-space-xs">
          <div className="flex items-center gap-space-sm mb-space-xs">
            <BrandMark className="h-8 w-8" />
            <span className="font-headline-sm text-headline-sm uppercase tracking-wider text-primary font-semibold"><T>COCOON</T></span>
          </div>
          <p className="font-label-mono-xs text-label-mono-xs uppercase text-on-surface-variant tracking-wider">
            <T>MIL-PRF-32535 THERMAL DECISION PLATFORM</T>
          </p>
        </Link>
      </header>
      <main className="w-full flex-1 flex flex-col items-center justify-center px-margin-sm py-space-md">
        <div className="w-full max-w-[440px]">{children}</div>
      </main>
    </div>
  );
}
