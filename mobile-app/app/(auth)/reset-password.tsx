import React from "react";
import { z } from "zod";

import { AuthForm } from "../../components/auth/AuthForm";
import { authService } from "../../services/registry";

const schema = z
  .object({
    token: z.string().trim().min(1, { error: "Enter the reset code." }),
    password: z.string().min(12, { error: "Use at least 12 characters." }),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], error: "Passwords do not match." });

export default function ResetPasswordScreen() {
  return (
    <AuthForm
      title="Reset password"
      intro="Set a new password using the code you received."
      schema={schema}
      fields={[
        { name: "token", label: "Reset code" },
        { name: "password", label: "New password", secure: true },
        { name: "confirm", label: "Confirm new password", secure: true },
      ]}
      submitLabel="Reset password"
      onSubmit={(v) => authService.resetPassword(v.token, v.password)}
      successMessage="Password updated."
      links={[{ href: "/(auth)/login", label: "Back to sign in" }]}
    />
  );
}
