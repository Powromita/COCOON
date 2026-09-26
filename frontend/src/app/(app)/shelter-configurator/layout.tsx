import { WizardProvider } from "@/components/configurator/WizardProvider";

/** Shares one requirements draft across all wizard steps. */
export default function ShelterConfiguratorLayout({ children }: { children: React.ReactNode }) {
  return <WizardProvider>{children}</WizardProvider>;
}
