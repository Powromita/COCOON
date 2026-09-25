import { Suspense } from "react";

import AuthForm from "@/app/auth/_components/AuthForm";

export default function OrganizationAuthPage() {
  return (
    <Suspense>
      <AuthForm role="organization" />
    </Suspense>
  );
}
