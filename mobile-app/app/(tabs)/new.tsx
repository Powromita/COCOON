/**
 * Placeholder route for the "New shelter" tab. The tab's press handler
 * (app/(tabs)/_layout.tsx) opens /project/new instead, so this only renders
 * if the route is reached directly (e.g. a deep link) — then it redirects.
 */
import { Redirect } from "expo-router";
import React from "react";

export default function NewShelterTab() {
  return <Redirect href="/project/new" />;
}
