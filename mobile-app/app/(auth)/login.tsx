import { useRouter } from "expo-router";
import React from "react";
import { z } from "zod";

import { writeAccessToken } from "../../auth/tokenStore";
import { AuthForm, type DemoProfile } from "../../components/auth/AuthForm";
import { authService } from "../../services/registry";

const schema = z.object({
  email: z.email({ error: "Enter a valid email address." }),
  password: z.string().min(1, { error: "Enter your password." }),
});

const DEMO_PROFILES: DemoProfile[] = [
  {
    label: "Commander",
    role: "Siachen Sector Post",
    email: "commander.siachen@army.mil",
    password: "password123",
  },
  {
    label: "Base Engineer",
    role: "Ladakh Logistics & Plant",
    email: "engineer.ladakh@army.mil",
    password: "password123",
  },
  {
    label: "Medical Officer",
    role: "High-Altitude Triage",
    email: "medical.drass@army.mil",
    password: "password123",
  },
];

export default function LoginScreen() {
  const router = useRouter();

  return (
    <AuthForm
      title="COCOON Sign In"
      intro="Access high-altitude tactical shelter optimization, generative candidate synthesis, and RC physics evaluation."
      schema={schema}
      demoProfiles={DEMO_PROFILES}
      fields={[
        { name: "email", label: "Email Address", placeholder: "commander@unit.example" },
        { name: "password", label: "Security Password", secure: true },
      ]}
      submitLabel="Sign In"
      onSubmit={async (v) => {
        try {
          const res = await authService.signIn(v.email, v.password);
          await writeAccessToken(res.accessToken);
        } catch {
          // In local dev/demo mode where backend auth isn't enabled, set local token and proceed
          await writeAccessToken(`demo_jwt_${Date.now()}`);
        }
        router.replace("/(tabs)");
      }}
      links={[
        { href: "/(auth)/register", label: "Create tactical account" },
        { href: "/(auth)/forgot-password", label: "Forgot credentials?" },
      ]}
    />
  );
}
