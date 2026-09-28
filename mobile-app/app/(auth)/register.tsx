import React from "react";
import { z } from "zod";

import { AuthForm } from "../../components/auth/AuthForm";
import { authService } from "../../services/registry";

const schema = z
  .object({
    name: z.string().trim().min(2, { error: "Enter your name." }),
    email: z.email({ error: "Enter a valid email address." }),
    password: z.string().min(12, { error: "Use at least 12 characters." }),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], error: "Passwords do not match." });

export default function RegisterScreen() {
  return (
    <AuthForm
      title="Register"
      intro="Request an account on a COCOON backend."
      schema={schema}
      fields={[
        { name: "name", label: "Full name" },
        { name: "email", label: "Email", placeholder: "name@unit.example" },
        { name: "password", label: "Password", secure: true },
        { name: "confirm", label: "Confirm password", secure: true },
      ]}
      submitLabel="Register"
      onSubmit={(v) => authService.register({ name: v.name, email: v.email, password: v.password })}
      successMessage="Registration submitted."
      links={[{ href: "/(auth)/login", label: "Back to sign in" }]}
    />
  );
}
