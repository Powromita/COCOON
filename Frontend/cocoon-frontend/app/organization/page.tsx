import { redirect } from "next/navigation";

/**
 * The Organization flow has no separate landing page — choosing "Organization"
 * on the mode picker goes straight to the configuration screen, mirroring the
 * Individual flow. Any direct hit on /organization is sent there too.
 */
export default function OrganizationIndexPage() {
  redirect("/organization/configure");
}
