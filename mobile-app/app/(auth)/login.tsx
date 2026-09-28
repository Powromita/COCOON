import { useRouter } from "expo-router";
import React from "react";
import { z } from "zod";

import { writeAccessToken } from "../../auth/tokenStore";
import { AuthForm } from "../../components/auth/AuthForm";
import { authService } from "../../services/registry";

const schema = z.object({
  email: z.email({ error: "Enter a valid email address." }),
  password: z.string().min(1, { error: "Enter your password." }),
});

export default function LoginScreen() {
  const router = useRouter();
  return (
    <AuthForm
      title="Sign in"
      intro="Sign in to a COCOON backend that requires authentication."
      schema={schema}
      fields={[
        { name: "email", label: "Email", placeholder: "name@unit.example" },
        { name: "password", label: "Password", secure: true },
      ]}
      submitLabel="Sign in"
      onSubmit={async (v) => {
        const { accessToken } = await authService.signIn(v.email, v.password);
        // Reached only if a real backend accepted the credentials.
        await writeAccessToken(accessToken);
        router.replace("/(tabs)");
      }}
      links={[
        { href: "/(auth)/register", label: "Create an account" },
        { href: "/(auth)/forgot-password", label: "Forgot password?" },
      ]}
    />
  );
}
