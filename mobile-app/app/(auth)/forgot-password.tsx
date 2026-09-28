import React from "react";
import { z } from "zod";

import { AuthForm } from "../../components/auth/AuthForm";
import { authService } from "../../services/registry";

const schema = z.object({ email: z.email({ error: "Enter a valid email address." }) });

export default function ForgotPasswordScreen() {
  return (
    <AuthForm
      title="Forgot password"
      intro="Request a password-reset code for your COCOON account."
      schema={schema}
      fields={[{ name: "email", label: "Email", placeholder: "name@unit.example" }]}
      submitLabel="Send reset code"
      onSubmit={(v) => authService.requestPasswordReset(v.email)}
      successMessage="If the account exists, a reset code has been sent."
      links={[
        { href: "/(auth)/reset-password", label: "I have a reset code" },
        { href: "/(auth)/login", label: "Back to sign in" },
      ]}
    />
  );
}
