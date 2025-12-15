// config.js
export const getApiUrl = async () => {
    let url = 'http://localhost:3001';
    if (window.electronAPI) {
        try {
            const port = await window.electronAPI.getServerPort();
            console.log("Using dynamic server port:", port);
            if (port) url = `http://localhost:${port}`;
        } catch (e) {
            console.error("Failed to get server port from Electron:", e);
        }
    }
    console.log("[DEBUG] Final API URL:", url);
    return url;
};
