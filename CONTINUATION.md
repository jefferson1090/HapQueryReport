# Project Continuation Instructions

## Overview
This document provides instructions for resuming work on the **Hap Assistente de Dados** project on a new machine.

## Prerequisites
- Node.js (v18+)
- Git
- Oracle Instant Client (if connecting to Oracle DB)

## Setup Steps

1.  **Clone the Repository**
    ```bash
    git clone <repository-url>
    cd oracle-lowcode
    ```

2.  **Install Dependencies**
    *   **Client:**
        ```bash
        cd client
        npm install
        ```
    *   **Server:**
        ```bash
        cd ../server
        npm install
        ```

3.  **Environment Configuration (.env)**
    Create a `.env` file in the `server` directory with the following content:

    ```env
    # Server Configuration
    PORT=3001
    
    # API Keys
    # A chave foi salva codificada no arquivo 'backup_config.txt' na raiz do projeto.
    # Decodifique-a antes de usar ou insira sua chave aqui.
    GROQ_API_KEY=<VER_BACKUP_CONFIG_TXT>
    
    # Electron Configuration (IMPORTANT)
    # Ensure this is NOT set to 1, or remove it entirely.
    # ELECTRON_RUN_AS_NODE=0 
    ```

    > **Note:** The `GROQ_API_KEY` included above is the one used in the previous session.

4.  **Database Setup**
    The application uses SQLite (`chat.db`). This file is generated automatically in the user's AppData folder (`%APPDATA%/HapAssistenteDeDados/chat.db`) upon first run. You do not need to copy the database file unless you want to preserve chat history (in which case, copy `chat.db` from the old machine's AppData).

5.  **Running the Application**
    *   **Development Mode:**
        Open two terminals:
        1.  Client: `cd client && npm run dev`
        2.  Server: `cd server && npm start`

## Known Issues
- **Server Start:** If the server fails to start with `ipcMain is undefined`, check your `.env` file and ensure `ELECTRON_RUN_AS_NODE` is **NOT** set to `1`.

## Recent Changes
- Restored `TeamChat.jsx`, `SqlRunner.jsx`, and `AiBuilder.jsx`.
- Fixed lint errors and component definitions.
- Client build verified successfully.
