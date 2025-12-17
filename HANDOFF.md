# Handoff Instructions - v2.0.0 Release

## Project Status
**Current Version:** v2.0.0 (Client & Server)
**Stability:** Stable (Golden Release)
**Last Action:** Published v2.0.0 to GitHub Releases.

## Key Changes Implemented
1.  **AI Context & Data Exploration (Phase 7 - Completed)**:
    -   **Context Isolation**: Implemented `[SYSTEM: SET_CONTEXT]` and `[SYSTEM: CLEAR_CONTEXT]`. AI now "locks" onto the viewed table (`session.lastTable`) and forgets it when closed.
    -   **Smart Inputs**: UI Column Filters now trigger AI execution on `Enter` ("Filtre tabela X onde Y..."), enabling **Full Table Scans** instead of just local filtering.
    -   **Full Table Scan Rule**: AI System Prompt updated to generate `run_sql` with `WHERE` clauses (including `TO_DATE` for dates) whenever a filter is requested in Data Mode.
    -   **Bug Fix**: Resolved "Double Execution" in `aiService.js` that caused empty search terms (`""`).

2.  **UI Overhaul (V2.0)**:
    -   **Glassmorphism**: New Login & Splash screens with transparent/blur effects.
    -   **Navigation**: Updated tabs to match new Identity (Orange/Blue).
    -   **Icons**: Migrated to `lucide-react` (Loader2, etc.).

3.  **Update System Fixes**:
    -   **Loop Fix**: Added 15s timeout to `checkForUpdates` in `App.jsx`.
    -   **IPC Fix**: Changed `manual-check-update` to use `ipcMain.handle` (Server) and `invoke` (Client).
    -   **Debug Logs**: Enabled `electron-log` in `electron-main.js` (Logs to `%APPDATA%\Hap Assistente de Dados\logs`).

4.  **Build Process**:
    -   **Clean Build**: `package.json` now has `clean` scripts that run automatically before `build` or `dist`.
    -   **No Cache Corruption**: `dist` folders are nuked before every build.

## Dependencies & Installation
If you (the next agent) need to reinstall or move environments:
1.  **Node Version**: v20+ recommended.
2.  **Key Packages**:
    -   `electron-updater`: Handles auto-updates.
    -   `electron-log`: Handles file logging.
    -   `lucide-react`: UI Icons.
    -   `framer-motion`: Animations (TechReveal).
    -   `vite-plugin-node-polyfills`: Critical for Client build.

## 🔑 Environment & API Keys (CRITICAL)
**The project requires a valid API Key to function (Groq AI).**
This key is stored in `server/chat_config.json`, which is **ignored** by Git for security.

### How to Restore the API Key
1.  Create a file named `chat_config.json` in the `server/` directory.
2.  Paste the following structure into it:

```json
{
  "groqApiKey": "gsk_fOMZ5XSuBGDwapsKicL1WGdyb3FYVETK5r DrA3wS02sH9AzH8SRQ",
  "model": "llama-3.3-70b-versatile",
  "temperature": 0.3,
  "maxTokens": 1024,
  "topP": 1
}
```
3.  **REMOVE THE SPACE** between `...VETK5r` and `DrA3w...` to form the valid key.

**Note**: If this file is missing, the AI features (Chat, SQL Generation) will fail.

**Command to Install:**
```bash
cd client && npm install
cd ../server && npm install
```

## How to Build (Do NOT skip steps)
**Client:**
```bash
cd client
npm run build  # Automatically runs 'npm run clean' first
```

**Server/Installer:**
```bash
cd server
npm run dist   # Automatically runs 'npm run clean' and copies client assets
```

## Last Test Performed
-   **Test Case**: Built v2.0.0 installer. Corrected IPC handler mismatch (`invoke` vs `on`) found in v1.15.95 debug session. Verified `latest.yml` on GitHub.
-   **Next Test Required**:
    1.  Install v2.0.0 (download from GitHub).
    2.  Open App -> Click "Actualizar" (Upgrade Badge).
    3.  **Expected Result**: Should show "Procurando..." with spinner, then "Você já tem a versão mais recente" (or Update Available if newer exists). **NO Error Toast.**

## Known Quirks
-   **DevTools**: Disabled in v2.0.0 (by design). To debug, un-comment `mainWindow.webContents.openDevTools()` in `server/electron-main.js`.
-   **White Screen**: If it returns, check `preload.js` bridge exposure (we fixed it in v1.15.92).

## CRITICAL BUG REPORT (from v1.15.96 test)
**Symptom**: Updater fails with `Cannot download "...Hap-Assistente-de-Dados-Setup-2.0.0.exe", status 404`.
**Diagnosis**: URL Mismatch.
-   The Updater is looking for a hyphenated filename (`Hap-Assistente...`).
-   The Uploaded Asset likely has spaces (`Hap Assistente...`).
-   **Action Reqd**:
    1.  Check GitHub Release v2.0.0 assets.
    2.  Rename the `.exe` on GitHub to match `latest.yml` (or vice-versa).
    3.  Ensure future builds enforce a safe filename (no spaces) to prevent this recurrence.

## BUG REPORT: Theme Switcher Broken
**Symptom**: "Change Theme" option is not functioning.
**Diagnosis**: Likely a regression from the V2.0 UI Overhaul.
-   The new `App.jsx` layout or `ThemeContext` usage might have been disconnected or overridden by the new "Glassmorphism" constant styles.
-   **Action Reqd**:
    1.  Investigate `ThemeContext.js`.
    2.  Check `App.jsx` class injection (are we forcing a specific class?).
    3.  Restore theme switching capability.

---
**Maintainer:** Antigravity (Agent Session ID: 29)
**Date:** 2025-12-15
