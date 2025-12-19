# Handoff Instructions - v2.5.1 (Dev)

## Project Status
**Current Version:** v2.5.1
**Stability:** Beta (Autocomplete in debugging phase)
**Last Action:** Implemented Tab Renaming, Theme Switcher Fix, and Autocomplete Backend Fixes.

## Key Changes Implemented (Session 2024-12-17 - Phase 7 & 8)
1.  **AI Context & Data Exploration (Completed)**:
    -   **Context Isolation**: Implemented `[SYSTEM: SET_CONTEXT]` and `[SYSTEM: CLEAR_CONTEXT]`. AI now "locks" onto the viewed table (`session.lastTable`) and forgets it when closed.
    -   **Smart Inputs**: UI Column Filters now trigger AI execution on `Enter` ("Filtre tabela X onde Y..."), enabling **Full Table Scans** instead of just local filtering.
    -   **Full Table Scan Rule**: AI System Prompt updated to generate `run_sql` with `WHERE` clauses (including `TO_DATE` for dates) whenever a filter is requested in Data Mode.
    -   **Performance Optimization**: Enforced `WHERE COL = 'VAL'` (Exact Match) for codes to avoid `LIKE` (Full Scan) slowness.
    -   **SQL Integration**: Added "Ver Tudo no Editor SQL" button when AI result is truncated (500 rows).

2.  **Bug Fixes**:
    -   **Empty Data Screen**: Fixed mismatch between `aiService` ("show_data") and `AiBuilder` ("data_view" vs "data").
    -   **Frontend Filter Bias**: Changed frontend prompt from "contém" to "=" to prevent AI from forcing `LIKE` queries.
    -   **Double Execution**: Resolved bug in `aiService.js` causing empty search terms.

## Future Work / Recommendations
> [!IMPORTANT]
> **API Key Management**: Currently, the Groq API Key is loaded from a local `chat_config.json`. The next step should be moving this to a secure, remote configuration (e.g., Supabase `ai_config` table) so the application can fetch it dynamically on startup, removing the need for manual file distribution.

4.  **Autocomplete SQL (Work in Progress)**:
    -   **Backend**: Fixed critical bug in `db.js`. Query was not executing, and `currentUser` reference was broken. Now returns dictionary correctly.
    -   **Frontend**: Updated `SqlRunner.jsx` to fetch schema *after* connection. Implemented case-insensitive alias support (normalizing keys).
    -   **Status**: Code logic is sound, but user reported issues in final test. Needs verification of `db.js` execution logs.
    
5.  **Clarify Tab Connections (Session 2024-12-18)**:
    -   **UI Improvements**: Clear distinction between Global Connection (sidebar) and Tab-specific connection (header).
    -   **Indicators**: Added visual indicators for active/inactive tabs to show which connection is in use.
    -   **Responsiveness**: Refactored header elements to prevent overlap on smaller screens.

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
  "groqApiKey": "<INSIRA_SUA_CHAVE_AQUI>",
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

## CRITICAL INSTRUCTION: API Sync Check
**Always verify the new API synchronization model on startup.**
- Check if the sync mechanism is correctly pulling/pushing data as expected.
- Verify logs for any sync errors immediately after application launch.

---
**Maintainer:** Antigravity (Agent Session ID: 30)
**Date:** 2024-12-19
