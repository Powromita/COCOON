# COCOON Mobile

React Native client for the COCOON thermal shelter design platform. The app accepts mission, site and design requirements, submits them to the COCOON service, and displays the resulting candidate designs, RC thermal simulation, lifecycle economics and 3D building model.

The app does not substitute sample outputs for a user's requirements. A design run requires a reachable COCOON backend with the M2 candidate generator, M4 RC solver, M6 ranking and M7 economics pipeline enabled.

## Fresh-clone Android setup

The app and backend both run locally. Keep the backend running while using the app.

### Prerequisites

- Git
- Python 3.10 or newer
- Node.js 20 or newer and npm
- Android Studio with the Android SDK and an Android emulator, or a USB-connected Android device with USB debugging enabled

For iOS, use macOS with Xcode and replace the Android commands below with `npm run ios`.

### 1. Clone the mobile branch

```bash
git clone --branch feature/mobile-app --single-branch https://github.com/Powromita/COCOON.git
cd COCOON
```

### 2. Install and start the backend

Create a virtual environment and install the mobile backend dependencies from the repository root:

```bash
python -m venv .venv
```

Activate it, then install requirements and start the API:

```powershell
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
```

```bash
# macOS / Linux
source .venv/bin/activate
```

```bash
python -m pip install --upgrade pip
python -m pip install -r requirements-mobile.txt
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

Leave this terminal running. Confirm the API is up at `http://localhost:8000/api/health`.

### 3. Configure the app's backend URL

Create `mobile-app/.env.local` by copying `mobile-app/.env.example`, then set `EXPO_PUBLIC_API_URL` for the device you are using:

| Device | Backend URL |
|---|---|
| Android emulator | `http://10.0.2.2:8000` |
| iOS simulator | `http://localhost:8000` |
| Physical phone | `http://<computer-LAN-IP>:8000` |

For a physical phone, allow inbound connections to port 8000 in the computer's firewall and ensure both devices are on a network that allows them to communicate. Do not use `localhost` on a phone; it refers to the phone itself.

### 4. Install and launch the app

In a second terminal:

```bash
cd mobile-app
npm ci
npm run android
```

The first Android launch builds and installs the native development app; it can take several minutes. Start an emulator first, or connect and authorize a physical Android device. On later runs, use `npm start` and press `a` to launch the Android app.

### Troubleshooting

- If the app cannot reach the API, check `mobile-app/.env.local`, the `/api/health` URL from the computer, the device's network connection, and firewall access to port 8000.
- If using a physical Android device, the configured API URL must use the computer's LAN IP address, not `10.0.2.2` or `localhost`.
- The app performs real calculations through the backend; successful installation alone does not provide results while the backend is stopped or unreachable.

## Verification commands

Run from `mobile-app/`:

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
