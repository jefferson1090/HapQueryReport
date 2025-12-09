// config.js
export const getApiUrl = async () => {
    if (window.electronAPI) {
        try {
            const port = await window.electronAPI.getServerPort();
            console.log("Using dynamic server port:", port);
            return `http://localhost:${port}`;
        } catch (e) {
            console.error("Failed to get server port from Electron:", e);
            return 'http://localhost:3001'; // Fallback
        }
    }
    return 'http://localhost:3001'; // Dev mode fallback
};
