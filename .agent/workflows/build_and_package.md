---
description: Build and Package Oracle Low-Code Builder
---

This workflow describes how to build the React frontend and package the Node.js backend into a standalone executable.

1.  **Build Frontend**:
    Navigate to the `client` directory and run the build command.
    ```bash
    cd client
    npm run build
    ```

2.  **Prepare Server Assets**:
    Copy the built frontend files to the server's public directory.
    ```bash
    cd ../server
    mkdir public
    xcopy /E /I /Y ..\client\dist public
    ```

3.  **Package Application**:
    Use `pkg` to create the executable.
    ```bash
    npm install -g pkg
    pkg . -t node18-win-x64 --out oracle-builder.exe
    ```

4.  **Run**:
    The executable `oracle-builder.exe` will be in the `server` directory. Double-click it to start the server. Access the app at `http://localhost:3001`.
