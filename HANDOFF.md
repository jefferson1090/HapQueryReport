# Handoff Instructions - v2.5.2 (Dev)

## Project Status
**Current Version:** v2.5.6 (Dev - Pending Fixes)
**Stability:** Broken (Oracle Client Missing, Theme Switcher UI Glitch, Updater 404)
**Last Action:** Bumped version to v2.5.6. Diagnosed Oracle Client, Theme Switcher, and Updater issues. Registered fixes for this version.

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

## Session Update (2025-12-22) - v2.5.6 Planning
**Agent:** Antigravity
**Action:** Bumped version to v2.5.6. Analysis of pending tasks completed.

### Registered Actions for v2.5.6:
1.  **FIX CRITICAL:** Update server/db.js to point to the correct Oracle Instant Client path (instantclient instead of instantclient_23_4).
2.  **FIX UI:** Restore Theme Switcher functionality in App.jsx. The current dropdown is hidden/broken in the new layout.
3.  **FIX DEPLOY:** Rename productName in package.json to remove spaces or ensure rtifactName is hyphenated to prevent Updater 404 errors.
4.  **SECURITY:** (Pending) Move API Key to Supabase.

## Session Update (2025-12-23) - v2.5.7 (SIGO & Stability Fixes)
**Agent:** Antigravity
**Focus:** SIGO UI Standardization, SQL Import Interaction, and Startup Stability.

### 1. SIGO Menu Standardization (UI/UX)
-   **Visual Parity**: The SIGO menu cards have been resized (`h-[160px]`, `p-6`) and styled to exactly match the "Extração de Carga" cards. This ensures a consistent "premium" look across the application.
-   **Header Removal**: Removed the redundant "SIGO Next" title and subtitle to cleaner interface.
-   **Navigation**: Restored the "Voltar" button as a clean, icon-only element in the top-left, preserving navigation flow without visual clutter.

### 2. SQL Import Functionality
-   **Interaction Fix**: Fixed the "Importar SQL" card's click handler to reliably trigger the hidden file input.
-   **Loading Feedback**: **New Global Feature**. Implemented a "Preparando estrutura...aguarde!" loading overlay that appears immediately when a SQL file is selected. This provides crucial feedback during the parsing phase.
-   **Auto-Navigation**: The interaction is now seamless: Click -> Pick File -> Loading Overlay -> Auto-redirect to "Filtro de SQL" screen upon success.

### 3. Critical Technical Fixes (`AiBuilder.jsx`)
-   **Syntax Corruption Resolved**: Fixed a critical issue where the `AiBuilder.jsx` file contained a nested/duplicate definition of `handleSqlFileUpload` and a premature component closure, causing "Unexpected token" and "Export not at top level" errors.
-   **`forwardRef` Implementation**: Refactored `AiBuilder` to use `React.forwardRef`. This was necessary because parent components use `useImperativeHandle` to reset the builder's state. The component is now correctly defined as:
    ```javascript
    const AiBuilder = React.forwardRef(({...}, ref) => { ... });
    ```
-   **State Management**: Consolidated logic to ensure `menuState` transitions only happen *after* async operations (like SQL parsing) are complete.

### 4. New Files
-   `server/services/sigoSqlParser.js`: New service to parse uploaded SQL files for SIGO filters.
-   `server/test_sigo_parser.js`: Test script for the parser.

### Next Steps for Agent
1.  **Verify Build**: Ensure `npm run build` in `client` passes without warnings related to the new `forwardRef` structure.
2.  **SQL Parsing Extension**: The current parser (`sigoSqlParser.js`) handles basic SELECTs. If user needs more complex SQL support, extend this service.
3.  **Supabase Sync**: Check `server_log.txt` to ensure the new version communicates correctly with Supabase (if active).

