import { Suspense } from "react";

import AuthForm from "@/app/auth/_components/AuthForm";

export default function IndividualAuthPage() {
  return (
    <Suspense>
      <AuthForm role="individual" />
    </Suspense>
  );
}
