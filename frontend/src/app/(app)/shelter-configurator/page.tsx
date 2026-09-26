import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

export default function ShelterConfiguratorIndex() {
  redirect(ROUTES.shelterConfigurator.step1);
}
