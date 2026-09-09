import { weatherProfiles } from "@/mock/weather";

export const getWeatherProfiles = () => weatherProfiles;

export const getWeatherProfile = (region: string) =>
  weatherProfiles.find((profile) => profile.region === region) ?? weatherProfiles[0];
