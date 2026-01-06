# Handoff Instructions - v3.0.7

## Project Status
**Current Version:** v3.0.7
**Stability:** Stable (AI Autonomy Restored, UI Integration Fixed, Credentials Check Active)
**Last Action:** Restored full AI functionality, enabling it to autonomously find tables, describe schemas, and locate records using natural language. Fixed "Failed to fetch" crashes by implementing proactive credential checks.

## Key Changes Implemented (Session 2026-01-06 - v3.0.7)

### 1. AI "Brain" & Autonomy Restoration
The core focus was transitioning the AI from a rigid "Chatbot" to an "Autonomous Data Agent".

-   **Natural Language Processing (NLP) Upgrade**:
    -   **Problem**: AI was strict, expecting specific commands like "Listar tabelas de usuario".
    -   **Solution**: Relaxed regex patterns in `aiService.js`. Now understands variations like:
        -   "Buscar registro onde cpf 123..."
        -   "Encontre o id 5 em usuarios"
        -   "Me mostra o valor X na tabela Y"
    
-   **Context Inference**:
    -   **Column Resolution**: If the user provides a value (e.g., a CPF) without a column name, the AI now heuristically scans the table columns to find the most likely match (looking for 'CPF', 'ID', 'CODIGO', 'CNPJ' fields) automatically.
    -   **Table Resolution**: Improved fuzzy matching to find tables even if the user types a partial or slightly incorrect name.

-   **Safety Nets (Crash Protection)**:
    -   **Credential Check**: Before attempting any DB operation, the AI now verifies connection status. If disconnected, it politely asks the user to connect instead of throwing a generic "Failed to fetch".
    -   **Try/Catch Wrapping**: The `performFindRecord` method is now fully wrapped in error handling to catch database exceptions and return them as friendly chat messages.

### 2. UI/AI Integration (The "Nervous System")
Fixed the disconnection where the AI would "think" but the UI wouldn't "react".

-   **Event Bus Strategy**:
    -   Implemented a custom Event Bus (`window.dispatchEvent`) in `AiChat.jsx`.
    -   **Events Created**:
        -   `hap-show-search-results`: Triggers Table List View.
        -   `hap-show-schema`: Triggers Schema/Column View.
        -   `hap-show-data`: Triggers Data Grid View.
        -   `hap-draft-table`: Triggers Table Creation Wizard.

-   **Reaction Logic**:
    -   `AiBuilder.jsx` now listens for these events and updates `activeView` and `viewData` instantaneously.

### 3. What the AI Learned (Technical Summary)
*This section details the specific logic injected into the "Brain" (`aiService.js`).*

#### A. The "Autonomous Agent" Persona
We updated the System Prompt to enforce:
> "VOCÊ É UM AGENTE DE DADOS AUTÔNOMO... Se o usuário pede 'ver o cliente 123', você NÃO pergunta 'qual tabela?'. Você TENTA DESCOBRIR."

#### B. New Regex Patterns
The AI now "hears" differently. It has unlearned rigid syntax and learned flexible patterns:
```javascript
// Old: Rigid
// regex: /(?:encontre|busque)\s+([a-zA-Z0-9]+)\s+na\s+([a-zA-Z0-9]+)/

// New: Flexible
// regex: /(?:encontre|busque|ache|visualizar|olhar|ver|me mostra|traz)\s+(?:o\s+)?(?:registro|id|código|o\s+dado|a\s+linha)?\s*(?:onde|com|cujo|que\s+tenha)?\s*(?:o|a)?\s*(?:cpf|cnpj|id|código|nome|valor)?\s*[:=]?\s*([a-zA-Z0-9_\-,\.\s]+)\s+(?:na|em|da|do)\s+(?:tabela\s+(?:de|do|da)?\s*)?([a-zA-Z0-9_$#\.]+)/i
```

#### C. Heuristic Logic (The "Intuition")
When executing `find_record`:
1.  **Check 0**: Is DB connected? If not -> Return "Acesso Negado".
2.  **Check 1**: Does Table Exist? If not -> Fuzzy Search & Suggest alternatives.
3.  **Check 2**: Did user give column?
    -   **Yes**: Search in that column.
    -   **No (Ambiguous)**:
        -   Is value a CPF/CNPJ (length > 11)? -> Search `*CPF*` or `*CNPJ*` columns.
        -   Is value a Number? -> Search `ID` or `CODIGO` or number columns.
        -   Fallback -> Search first string column.

## Verification Checklist (for next session)
1.  **Connect to DB**: Ensure "Conectado" status.
2.  **Natural Search**: Type "Achar cliente com cpf 12345678900".
    -   Expect: AI finds table `CLIENTES`, identifies column `NR_CPF`, searches, and shows Grid.
3.  **Disconnect Test**: Disconnect DB and type "Buscar tabelas".
    -   Expect: AI says "⚠️ Acesso Negado".

## Dependencies
No new npm packages. Relies on existing `oracledb` and `groq-sdk`.

---
**Maintainer:** Antigravity (Agent Session ID: 156)
**Date:** 2026-01-06

