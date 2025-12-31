---
description: Start the application in PC DEV mode (Vite + Electron)
---

1. Start the React Frontend (Vite)
   - Change directory to `client`
   - Run `npm run dev` in background
   - This serves the frontend with Hot Module Replacement (HMR)

```powershell
cd client
$env:PORT=5173
Start-Process npm -ArgumentList "run dev" -NoNewWindow
```

2. Wait for Vite to initialize
   - Wait 5 seconds to ensure port 5173 is ready

3. Start the Electron Backend
   - Change directory to `server`
   - Set `ELECTRON_START_URL` to `http://localhost:5173`
   - Run `npm start`

```powershell
cd server
$env:ELECTRON_START_URL="http://localhost:5173"
npm start
```
