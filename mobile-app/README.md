# COCOON Mobile

React Native client for the COCOON thermal shelter design platform. The app accepts mission, site and design requirements, submits them to the COCOON service, and displays the resulting candidate designs, RC thermal simulation, lifecycle economics and 3D building model.

The app does not substitute sample outputs for a user's requirements. A design run requires a reachable COCOON backend with the M2 candidate generator, M4 RC solver, M6 ranking and M7 economics pipeline enabled.

## Run the app

1. Start the COCOON backend from the repository root:

   ```bash
   PYTHONPATH=.:packages/contracts/python python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
   ```

2. In `mobile-app/.env.local`, set the backend address. For the Android emulator:

   ```env
   EXPO_PUBLIC_API_URL=http://10.0.2.2:8000
   ```

   For a physical device, use the computer's LAN address instead. The device and computer must be on a network that permits access between them.

3. Start Expo:

   ```bash
   npm install
   npx expo start
   ```

   Press `a` to launch an Android emulator or scan the QR code from a development build.

## Verification commands

```bash
npm run typecheck
npm run lint
npm test
```

## Calculation and result provenance

- The location picker uses sites for which the backend has archived weather records. Selecting a location fills its coordinates and elevation for the API request; the UI does not ask users to enter coordinates.
- Candidate geometry, thermal outputs, cost and optimizer recommendations are read from the backend response for the submitted requirements.
- The app's 3D viewer visualizes the returned candidate building model. It does not create alternative geometry locally.
- A failed or interrupted request remains a failed or interrupted request; it is not replaced by a saved example result.
- Draft requirements are stored on the device. Completed runs are loaded from the COCOON service and recent run IDs are indexed locally for navigation.

## Build details

Expo SDK 57, React Native 0.86, TypeScript, Expo Router, React Query, React Hook Form + Zod, Expo SQLite and a three.js WebView viewer.
