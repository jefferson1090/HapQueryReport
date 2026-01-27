import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { io } from "socket.io-client";
import ConnectionForm from './components/ConnectionForm';
import QueryBuilder from './components/QueryBuilder'; // Legacy
import AiBuilder from './components/AiBuilder';
// import SqlRunner from './components/SqlRunner';
const SqlRunner = React.lazy(() => import('./components/SqlRunner'));
import CsvImporter from './components/CsvImporter';
import DocsModule from './components/DocsModule';
import SettingsModal from './components/SettingsModal';
import Reminders from './components/Reminders';
import TeamChat from './components/TeamChat';
import Login from './components/Login';
import SplashScreen from './components/SplashScreen';
import ErrorBoundary from './components/ErrorBoundary';
import hapLogo from './assets/hap_logo_v4.png';
import { getApiUrl } from './config';
import UpdateManager from './components/UpdateManager';
import {
    MessageSquare, Database, Sparkles, FileInput, Calendar, FolderOpen, FileSpreadsheet,
    RefreshCw, ShieldCheck, User as UserIcon, LogOut, Cloud, ArrowLeft
} from 'lucide-react';

// --- Theme Context & Definitions ---
import { ThemeContext, THEMES } from './context/ThemeContext';
import CommandCenter from './components/CommandCenter';
import DataProcessor from './components/DataProcessor';
import { FixedSizeList as List } from 'react-window';
import { useApi } from './context/ApiContext';
import { decryptPassword } from './utils/security';
import Navigation from './components/Navigation'; // New Component
import SmartFindRecord from './components/SmartFindRecord'; // New Smart Find Component
import SmartResolver from './components/SmartResolver'; // Legacy Resolution (Modal)
import SmartAnalysisPanel from './components/SmartAnalysisPanel'; // New Split-View Panel
import AiChat from './components/AiChat'; // Shared Chat Component


import pkg from '../package.json';

const VERSION = pkg.version;

function App() {
    // Chat User State (Main Entry)
    const [chatUser, setChatUser] = useState(() => {
        const saved = localStorage.getItem('chat_user');
        return saved ? JSON.parse(saved) : null;
    });
    const [socket, setSocket] = useState(null);
    const [showSplash, setShowSplash] = useState(true);
    const { apiUrl, isReady } = useApi();

    useEffect(() => {
        const timer = setTimeout(() => setShowSplash(false), 2500);
        return () => clearTimeout(timer);
    }, []);

    // Auto-Connect Socket on Refresh
    useEffect(() => {
        if (chatUser && isReady && apiUrl) {
            console.log("Auto-connecting socket for:", chatUser.username, "to", apiUrl);

            // Disconnect existing if any (though usually null on mount)
            if (socket) {
                console.log("Disconnecting old socket...");
                socket.disconnect();
            }

            const newSocket = io(apiUrl);
            setSocket(newSocket);

            // Robust Join Logic: Emit 'join' on every connection/reconnection
            const handleConnect = () => {
                console.log("Socket connected:", newSocket.id);
                newSocket.emit('join', { username: chatUser.username, team: chatUser.team });
            };

            newSocket.on('connect', handleConnect);

            // Manual check if already connected (rare race condition)
            if (newSocket.connected) {
                handleConnect();
            }

            return () => {
                newSocket.off('connect', handleConnect);
                newSocket.disconnect();
            };
        }
    }, [chatUser, isReady, apiUrl]); // Re-run if apiUrl changes

    // Oracle Connection State (Gated Features)
    const [connection, setConnection] = useState(null);
    const [isConnected, setIsConnected] = useState(false); // Socket.io status
    const [appChannel, setAppChannel] = useState(null); // 'production' | 'beta'

    useEffect(() => {
        // Fetch System Info (Channel)
        fetch(`${apiUrl}/api/config/info`)
            .then(r => r.json())
            .then(data => {
                if (data.channel === 'beta') setAppChannel('beta');
            })
            .catch(err => console.error("Failed to fetch channel info:", err));
    }, [apiUrl]);

    // Handle initial auth check (Local Storage)
    const [activeTab, setActiveTab] = useState('query-builder'); // Default to AI Hub (Home)

    const [pendingDoc, setPendingDoc] = useState(null); // { id, bookId, query }

    // Theme State
    const [currentThemeName, setCurrentThemeName] = useState(() => localStorage.getItem('app_theme') || 'default');
    const theme = THEMES[currentThemeName] || THEMES.default;

    // Interactive Badge State
    const [connectionBadgeExpanded, setConnectionBadgeExpanded] = useState(false);

    const changeTheme = (name) => {
        setCurrentThemeName(name);
        localStorage.setItem('app_theme', name);
    };

    // Navigation Position State
    const [navPosition, setNavPosition] = useState('left'); // 'top', 'left', 'bottom'

    // --- Lifted SQL Runner State ---
    const [sqlTabs, setSqlTabs] = useState(() => {
        const saved = localStorage.getItem('hap_sql_tabs');
        if (saved) {
            try {
                const tabs = JSON.parse(saved);
                return tabs.map(t => ({
                    ...t,
                    loading: false,
                    error: null,
                    // Ensure we don't show stale totals if there are no results
                    totalRecords: t.results ? t.totalRecords : undefined
                }));
            } catch (e) {
                console.error("Failed to parse saved tabs", e);
            }
        }
        return [{ id: 1, title: 'Query 1', sqlContent: '', results: null, error: null, loading: false }];
    });

    const [activeSqlTabId, setActiveSqlTabId] = useState(() => {
        const saved = localStorage.getItem('hap_sql_active_tab');
        return saved ? Number(saved) : 1;
    });

    const [savedSqlQueries, setSavedSqlQueries] = useState(() => {
        const saved = localStorage.getItem('hap_saved_queries');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error("Failed to parse saved queries", e);
            }
        }
        return [];
    });
    // Connection Switcher State
    const [savedConnections, setSavedConnections] = useState([]);
    const [showConnectionSwitcher, setShowConnectionSwitcher] = useState(false);
    const [resolverData, setResolverData] = useState(null); // Data for Smart Resolver
    const dropdownRef = useRef(null);
    const [toast, setToast] = useState(null); // { message, type }

    // Activate Resolver Listener
    useSmartResolverListener(setResolverData, setActiveTab);

    // Auto-dismiss toast
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    // Click outside to close connection switcher
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setConnectionBadgeExpanded(false);
                setShowConnectionSwitcher(false); // Reset to main view
            }
        };

        if (connectionBadgeExpanded) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [connectionBadgeExpanded]);

    // --- Centralized Connection Logic ---
    // Single Source of Truth for all ConnectionForm instances

    // Helper to backup (Server Sync)
    const backupConnections = async (connections) => {
        try {
            if (window.electronAPI) {
                // Or use fetch if server is running separately, but App.jsx uses context.
                // Let's reuse the fetch approach from ConnectionForm for consistency with existing backend
                await fetch(`${apiUrl}/api/config/connections/backup`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(connections)
                });
            } else {
                await fetch(`${apiUrl}/api/config/connections/backup`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(connections)
                });
            }
        } catch (e) {
            console.error("Backup failed", e);
        }
    };

    const initConnections = async () => {
        const saved = localStorage.getItem('oracle_connections');
        // Legacy Cleanup
        const legacyIds = ['default_hml', 'default_prod', 'c_stenio']; // Added c_stenio explicitly here if needed or rely on ID check
        let localConnections = [];

        if (saved) {
            try {
                localConnections = JSON.parse(saved);
            } catch (e) { console.error(e); }
        }

        // Restore from Valid Backup (Server Side)
        try {
            const res = await fetch(`${apiUrl}/api/config/connections/restore`);
            const restored = await res.json();

            if (Array.isArray(restored) && restored.length > 0) {
                if (localConnections.length === 0) {
                    localConnections = restored;
                } else {
                    // Merge unique
                    const localIds = new Set(localConnections.map(c => c.id));
                    restored.forEach(rc => {
                        if (!localIds.has(rc.id)) {
                            localConnections.push(rc);
                        }
                    });
                }
            }
        } catch (e) {
            console.error("Restore failed or offline", e);
        }

        // --- PURGE LEGACY DEFAULTS (Robust) ---
        // Filter out any connection that has specific legacy IDs OR specific user/host combos if needed
        const originalLength = localConnections.length;
        localConnections = localConnections.filter(c => !legacyIds.includes(c.id));

        // Also strictly filter out c_stenio if it has a dynamic ID but specific user
        localConnections = localConnections.filter(c => c.user !== 'c_stenio');

        let hasChanges = localConnections.length !== originalLength;

        // Default Connections Logic (if any DEFAULT_CONNECTIONS were defined globally, they should be imported or defined here)
        // Assuming DEFAULT_CONNECTIONS are empty or not strictly needed given the user request to REMOVE defaults.
        // We will skip adding defaults to ensure cleanliness.

        if (hasChanges || localConnections.length > 0) {
            setSavedConnections(localConnections);
            localStorage.setItem('oracle_connections', JSON.stringify(localConnections));
            backupConnections(localConnections);
        } else {
            setSavedConnections([]);
        }
    };

    const handleSaveConnection = (newConnection) => {
        let newConnections;
        // Check if update or create
        const exists = savedConnections.some(c => c.id === newConnection.id);
        if (exists) {
            newConnections = savedConnections.map(c => c.id === newConnection.id ? newConnection : c);
        } else {
            newConnections = [...savedConnections, newConnection];
        }

        setSavedConnections(newConnections);
        localStorage.setItem('oracle_connections', JSON.stringify(newConnections));
        backupConnections(newConnections);
    };

    const handleDeleteConnection = (id) => {
        const newConnections = savedConnections.filter(c => c.id !== id);
        setSavedConnections(newConnections);
        localStorage.setItem('oracle_connections', JSON.stringify(newConnections));
        backupConnections(newConnections);
    };

    useEffect(() => {
        if (apiUrl) {
            initConnections();
        }
    }, [apiUrl]);

    const handleQuickSwitch = async (conn) => {
        const decryptedConn = {
            ...conn,
            password: decryptPassword(conn.password),
            connectString: conn.isDefault ? decryptPassword(conn.connectString) : conn.connectString
        };

        try {
            // Force Backend Re-connection
            const response = await fetch(`${apiUrl}/api/connect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(decryptedConn)
            });
            const data = await response.json();

            if (data.success) {
                handleConnect(decryptedConn);
                setShowConnectionSwitcher(false);
                setConnectionBadgeExpanded(false);
                setToast({ message: `Conectado a ${conn.connectionName || conn.user}`, type: 'success' });
            } else {
                setToast({ message: 'Falha ao trocar: ' + data.message, type: 'error' });
            }
        } catch (e) {
            console.error(e);
            setToast({ message: 'Erro ao conectar: ' + e.message, type: 'error' });
        }
    };

    // Reminders State (Lifted & User-Scoped)
    // Synchronous Initialization to prevent "Empty Flash" on F5
    const [reminders, setReminders] = useState(() => {
        const rawUser = localStorage.getItem('chat_user');
        if (rawUser) {
            try {
                const u = JSON.parse(rawUser);
                const userKey = `hap_reminders_${u.username}`;
                const saved = localStorage.getItem(userKey);

                // 1. User specific
                if (saved) return JSON.parse(saved).map(r => (!r.status ? { ...r, status: r.completed ? 'COMPLETED' : 'PENDING' } : r));

                // 2. Migration (Startups)
                const legacy = localStorage.getItem('hap_reminders');
                if (legacy) return JSON.parse(legacy).map(r => (!r.status ? { ...r, status: r.completed ? 'COMPLETED' : 'PENDING' } : r));
            } catch (e) { }
        }
        return [];
    });

    // Guard Ref to prevent saving "Old User Data" to "New User Key" during switch
    const remindersLoadedFor = React.useRef(() => {
        const raw = localStorage.getItem('chat_user');
        return raw ? JSON.parse(raw).username : null;
    });

    // 1. Load Reminders when ChatUser changes (Switch Profiles)
    useEffect(() => {
        if (chatUser) {
            // Fix ref init if needed (function check)
            if (typeof remindersLoadedFor.current === 'function') {
                try { remindersLoadedFor.current = remindersLoadedFor.current(); } catch (e) { remindersLoadedFor.current = null; }
            }

            // If switching user (current ref != new user), load.
            if (remindersLoadedFor.current !== chatUser.username) {
                const userKey = `hap_reminders_${chatUser.username}`;
                const legacyKey = 'hap_reminders';

                const saved = localStorage.getItem(userKey);
                if (saved) {
                    try {
                        let parsed = JSON.parse(saved);
                        parsed = parsed.map(r => (!r.status ? { ...r, status: r.completed ? 'COMPLETED' : 'PENDING' } : r));
                        setReminders(parsed);
                    } catch (e) { setReminders([]); }
                } else {
                    // Fallback
                    const legacy = localStorage.getItem(legacyKey);
                    if (legacy && !localStorage.getItem(`migrated_${chatUser.username}`)) {
                        try {
                            let parsed = JSON.parse(legacy);
                            parsed = parsed.map(r => (!r.status ? { ...r, status: r.completed ? 'COMPLETED' : 'PENDING' } : r));
                            setReminders(parsed);
                        } catch (e) { setReminders([]); }
                    } else {
                        setReminders([]);
                    }
                }
                // Mark as loaded for this user
                remindersLoadedFor.current = chatUser.username;
            }
        } else {
            setReminders([]);
            remindersLoadedFor.current = null;
        }
    }, [chatUser]);

    // 2. Persist Reminders (User-Scoped)
    useEffect(() => {
        // Only save if we are sure the current `reminders` state belongs to `chatUser`
        if (chatUser && remindersLoadedFor.current === chatUser.username) {
            const userKey = `hap_reminders_${chatUser.username}`;
            localStorage.setItem(userKey, JSON.stringify(reminders));

            // Mark migration as done if we saved successfully
            localStorage.setItem(`migrated_${chatUser.username}`, 'true');
        }
    }, [reminders, chatUser]);

    const saveReminders = setReminders; // Alias for backward compatibility in prop drilling, or just pass setReminders directly


    // Auto-Update State
    const [updateInfo, setUpdateInfo] = useState(null);
    const [updateStatus, setUpdateStatus] = useState('idle'); // idle, checking, available, downloading, ready, error, up-to-date
    const [downloadProgress, setDownloadProgress] = useState(0);

    // Native Auto-Updater Logic
    useEffect(() => {
        if (!window.electronAPI) return;

        // Listeners
        window.electronAPI.onUpdateAvailable((info) => {
            console.log("Update available:", info);
            setUpdateStatus('available');
            setUpdateInfo({
                version: info?.version || 'Nova Versão',
                releaseDate: info?.releaseDate || new Date().toLocaleDateString(),
                notes: 'Nova atualização encontrada.'
            });
            // Automatically start downloading (native behavior often does this, setting status to downloading for UI)
            setUpdateStatus('downloading');
        });

        window.electronAPI.onDownloadProgress((progressObj) => {
            console.log("Download progress:", progressObj); // { percent: 50, ... }
            if (progressObj && progressObj.percent) {
                setDownloadProgress(Math.round(progressObj.percent));
                setUpdateStatus('downloading');
            }
        });

        window.electronAPI.onUpdateDownloaded((info) => {
            console.log("Update downloaded:", info);
            setUpdateStatus('ready');
            setDownloadProgress(100);
            setUpdateInfo(prev => ({ ...prev, notes: 'Atualização pronta para instalar!' }));
        });

        window.electronAPI.onUpdateNotAvailable(() => {
            console.log("Update not available");
            setUpdateStatus('up-to-date');
            setTimeout(() => setUpdateStatus('idle'), 4000); // Hide after 4s
        });

        window.electronAPI.onUpdateError((err) => {
            console.error("Update error:", err);
            setUpdateStatus('error');
            setUpdateInfo({ notes: 'Erro ao buscar atualização: ' + err });
        });

        // Internal Listener for Timeout (Failsafe)
        const handleTimeout = () => {
            if (updateStatus === 'checking') {
                setUpdateStatus('up-to-date'); // Fallback to "Up to date" if checking hangs
                setTimeout(() => setUpdateStatus('idle'), 4000);
            }
        };
        window.addEventListener('update-timeout', handleTimeout);

        return () => window.removeEventListener('update-timeout', handleTimeout);

    }, [updateStatus]); // Added dep updateStatus execution

    const checkForUpdates = async (manual = false) => {
        if (!window.electronAPI) {
            if (manual) alert("Funcionalidade indisponível no navegador.");
            return;
        }

        if (manual) {
            setUpdateStatus('checking');
            setDownloadProgress(0);

            // Failsafe: Reset to idle if no response after 15 seconds
            const timeoutId = setTimeout(() => {
                setUpdateStatus(prev => {
                    if (prev === 'checking') {
                        console.warn("Update check timed out.");
                        // Show visible error instead of silent idle
                        setUpdateInfo({ notes: 'Tempo limite esgotado. Verifique sua internet.' });
                        return 'error';
                    }
                    return prev;
                });
            }, 15000);

            // Trigger native check
            try {
                console.log("DEBUG: Invoking manual-check-update...");
                const result = await window.electronAPI.invoke('manual-check-update');

                // If null, it means Dev Mode (or explicit skip)
                if (result === null) {
                    clearTimeout(timeoutId);
                    console.log("DEBUG: Dev Mode detected. Simulating check...");

                    // Simulate "Up to Date" for Dev Mode feedback
                    setTimeout(() => {
                        setUpdateStatus('up-to-date');
                        setTimeout(() => setUpdateStatus('idle'), 3000);
                    }, 1000);
                }
            } catch (error) {
                clearTimeout(timeoutId);
                console.error("Update invoke error:", error);
                setUpdateStatus('error');
                setUpdateInfo({ notes: 'Erro ao buscar: ' + error.message });
            }
        }
    };

    useEffect(() => {
        document.title = `Hap Assistente de Dados v${VERSION}`;

        // Initial Check (Native)
        checkForUpdates(false);

        // Interval Check (every 30 mins)
        const interval = setInterval(() => checkForUpdates(false), 30 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);


    // Global Event Listener for Deep Linking to Docs
    const handleDocOpen = (e) => {
        const { id, bookId, query } = e.detail;
        setPendingDoc({ id, bookId, query });
        if (activeTab !== 'docs') {
            setActiveTab('docs');
        }
    };

    // Global Event Listener for Running SQL from Docs
    const handleRunSql = (e) => {
        const { query } = e.detail;
        if (query) {
            setActiveTab('sql-runner');
            setSqlTabs(prev => {
                const newTabs = [...prev];
                const activeIndex = newTabs.findIndex(t => t.id === activeSqlTabId);
                if (activeIndex !== -1) {
                    newTabs[activeIndex] = { ...newTabs[activeIndex], sqlContent: query };
                }
                return newTabs;
            });
        }
    };


    // Global Event Listener for Tab Switching (from CommandCenter etc)
    const handleSwitchTab = (tabId, text) => {
        if (activeTab === tabId && !text && tabId !== 'query-builder' && tabId !== 'data-processor') return;

        // Listener for Smart Resolver
        if (tabId === 'smart-resolver') {
            setActiveTab('query-builder'); // Route to AI Builder which will handle Smart Resolver Mode
            // Dispatch event to AI Builder to switch mode? Or rely on the global event?
            // Global event `hap-show-smart-resolver` is handled by useSmartResolverListener
            // which we will update to NOT switch tabs but maybe just ensure query-builder is active?
            return;
        }

        // Legacy Actions -> Route to AI Builder (Query Builder) + Trigger Chat
        if (tabId === 'carga_input' || tabId === 'db_search' || tabId === 'db_structure' || tabId === 'db_data' || tabId === 'db_find') {
            setActiveTab('query-builder');
            // Trigger Chat with specific legacy prompts (Templates)
            let prompt = "";
            switch (tabId) {
                case 'carga_input': prompt = "Quero criar a tabela [NOME_DA_TABELA] com as colunas [LISTA_DE_COLUNAS]"; break;
                case 'db_search': prompt = "Localize a tabela [NOME_DA_TABELA]"; break;
                case 'db_structure': prompt = "Exibir estrutura da tabela [NOME_DA_TABELA]"; break;
                case 'db_data': prompt = "Ver dados da tabela [NOME_DA_TABELA]"; break;

                // case 'db_find': prompt = "Buscar o registro onde [CONDIÇÃO] na tabela [NOME_DA_TABELA]"; break; // Handled by new UI Flow
            }
            if (tabId === 'db_find') {
                setActiveTab('query-builder');
                setTimeout(() => window.dispatchEvent(new CustomEvent('hap-trigger-chat-input', { detail: { text: "[SYSTEM_INIT_FIND_FLOW]", autoSend: true } })), 100);
                return;
            }
            if (tabId !== 'db_find') {
                setTimeout(() => window.dispatchEvent(new CustomEvent('hap-trigger-chat-input', { detail: { text: prompt } })), 100);
            }
            return;
        }

        if (text) {
            setTimeout(() => window.dispatchEvent(new CustomEvent('hap-trigger-chat-input', { detail: { text } })), 100);
        }

        if (tabId) setActiveTab(tabId);
    };

    // Handle External Navigation Events
    useEffect(() => {
        const handleSwitch = (e) => {
            console.log("DEBUG: App received hap-switch-tab event:", e.detail);
            handleSwitchTab(e.detail.tabId, e.detail.text);
        };

        window.addEventListener('hap-doc-open', handleDocOpen);
        window.addEventListener('hap-run-sql', handleRunSql);
        window.addEventListener('hap-switch-tab', handleSwitch);

        return () => {
            window.removeEventListener('hap-doc-open', handleDocOpen);
            window.removeEventListener('hap-run-sql', handleRunSql);
            window.removeEventListener('hap-switch-tab', handleSwitch);
        };
    }, [activeTab, activeSqlTabId]);

    const restartApp = () => {
        if (window.electronAPI) {
            window.electronAPI.restartApp();
        }
    };

    // Persist SQL Tabs
    useEffect(() => {
        const tabsToSave = sqlTabs.map(t => ({
            ...t,
            results: null, // Don't save results to avoid localStorage limits
            error: null,
            loading: false,
            totalRecords: undefined // Don't save total records as results are not saved
        }));
        localStorage.setItem('hap_sql_tabs', JSON.stringify(tabsToSave));
    }, [sqlTabs]);

    // Persist Active SQL Tab ID
    useEffect(() => {
        localStorage.setItem('hap_sql_active_tab', activeSqlTabId);
    }, [activeSqlTabId]);

    // Persist Saved Queries
    useEffect(() => {
        localStorage.setItem('hap_saved_queries', JSON.stringify(savedSqlQueries));
    }, [savedSqlQueries]);

    const handleConnect = (connData) => {
        setConnection(connData);
    };

    const handleDisconnect = () => {
        setConnection(null);
        // Do not change tab, just show connection form in place
    };

    const handleChatLogin = (user, socketInstance) => {
        setChatUser(user);
        setSocket(socketInstance);
        localStorage.setItem('chat_user', JSON.stringify(user));
        setActiveTab('team-chat');
    };

    const handleLogout = () => {
        setChatUser(null);
        localStorage.removeItem('chat_user');
        if (socket) {
            socket.disconnect();
            setSocket(null);
        }
        setConnection(null); // Also disconnect Oracle
    };

    // --- Data Persistence: Advanced Backup System ---
    const [lastBackup, setLastBackup] = useState(() => {
        const saved = localStorage.getItem('hap_last_backup');
        return saved ? JSON.parse(saved) : null;
    });

    const [autoBackupEnabled, setAutoBackupEnabled] = useState(() => {
        return localStorage.getItem('hap_auto_backup') !== 'false'; // Default true
    });

    const [isBackingUp, setIsBackingUp] = useState(false);

    useEffect(() => {
        localStorage.setItem('hap_auto_backup', autoBackupEnabled);
    }, [autoBackupEnabled]);



    const backupDataRef = useRef({ savedSqlQueries, sqlTabs, reminders, currentThemeName, chatUser });
    useEffect(() => {
        backupDataRef.current = { savedSqlQueries, sqlTabs, reminders, currentThemeName, chatUser };
    }, [savedSqlQueries, sqlTabs, reminders, currentThemeName, chatUser]);



    // Correct Implementation of AutoBackup Effect:
    useEffect(() => {
        if (!autoBackupEnabled) return;

        const timer = setInterval(() => {
            // We need to trigger the backup. To access fresh state, connect to a ref-based saver or use functional state updates if possible (not for reading).
            // Calls a stable wrapper that uses refs.
            triggerAutoBackup();
        }, 15 * 60 * 1000);

        return () => clearInterval(timer);
    }, [autoBackupEnabled]);

    const triggerAutoBackup = () => {
        // We can't easily access state here without re-creating the function.
        // So we will use the `backupDataRef` strategy.
        performBackupInternal(true);
    };

    // Internal Backup Function (Safe for Interval)
    const performBackupInternal = async (silent) => {
        const data = {
            version: VERSION,
            exportDate: new Date().toISOString(),
            savedQueries: backupDataRef.current.savedSqlQueries,
            sqlTabs: backupDataRef.current.sqlTabs.map(t => ({ ...t, results: null })),
            reminders: backupDataRef.current.reminders,
            theme: backupDataRef.current.currentThemeName,
            chatUser: backupDataRef.current.chatUser
        };

        setIsBackingUp(true);
        try {
            if (window.electronAPI) {
                const filePath = await window.electronAPI.invoke('save-backup-json', { content: JSON.stringify(data, null, 2) });
                if (filePath) {
                    const backupInfo = {
                        date: new Date().toISOString(),
                        path: filePath,
                        summary: {
                            queries: data.savedQueries.length,
                            tabs: data.sqlTabs.length,
                            reminders: data.reminders.length
                        }
                    };
                    setLastBackup(backupInfo);
                    localStorage.setItem('hap_last_backup', JSON.stringify(backupInfo));
                    if (!silent) setToast({ message: `Backup sincronizado!`, type: 'success' });
                }
            } else {
                if (!silent) setToast({ message: 'Erro: Funcionalidade disponível apenas no App Desktop.', type: 'error' });
                console.warn("Backup skipped: Electron API not found.");
            }
        } catch (e) { console.error(e); }
        finally { setIsBackingUp(false); }
    };

    // Manual handler just calls internal
    const handleForceBackup = () => performBackupInternal(false);

    // --- Settings Logic ---

    // --- Settings Logic ---
    const [showSettings, setShowSettings] = useState(false);
    const [userSettings, setUserSettings] = useState(() => {
        const saved = localStorage.getItem('hap_user_settings');
        return saved ? JSON.parse(saved) : { fontFamily: 'font-sans', fontSize: 'text-base' };
    });

    // Update settings in Theme Context (by merging into theme object or providing separate context)
    // For now, we will apply font styles directly to the main div via style prop or specific class injection
    // But better yet, let's update the theme object prop passed to provider if possible, or just use inline styles for the main container

    useEffect(() => {
        localStorage.setItem('hap_user_settings', JSON.stringify(userSettings));
    }, [userSettings]);

    const handleSaveSettings = (newSettings) => {
        // Update User Profile (Mock persistence + Local State)
        setChatUser(prev => ({ ...prev, username: newSettings.username, avatar: newSettings.avatar }));
        const updatedUser = { ...chatUser, username: newSettings.username, avatar: newSettings.avatar };
        localStorage.setItem('chat_user', JSON.stringify(updatedUser));

        // Update Appearance
        setUserSettings({
            fontFamily: newSettings.fontFamily,
            fontSize: newSettings.fontSize
        });

        setShowSettings(false);
    };

    const handleRestoreData = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.savedQueries) setSavedSqlQueries(data.savedQueries);
                if (data.sqlTabs) setSqlTabs(data.sqlTabs);
                if (data.reminders) saveReminders(data.reminders); // Use the wrapper
                if (data.theme) changeTheme(data.theme);
                // Note: We deliberately do NOT restore chatUser to avoid session conflicts,
                // unless explicitly desired. User is already logged in.

                alert("Dados restaurados com sucesso!");
            } catch (err) {
                console.error("Restore failed:", err);
                alert("Erro ao restaurar arquivo: Formato inválido.");
            }
        };
        reader.readAsText(file);
        // Reset input
        event.target.value = '';
    };

    // V2: Refined Navigation Tab (Clean & Elegant with Tech Colors)
    // V3: Enterprise Navigation Tab (Clean, Minimal, Professional)
    // NavTab logic moved to Navigation.jsx

    // DEBUG: Expose Demo Function
    useEffect(() => {
        window.demoUpdate = () => {
            setUpdateInfo({
                version: '2.0.0-Beta',
                releaseDate: new Date().toLocaleDateString(),
                notes: 'Preview da nova experiência de atualização.'
            });
            setUpdateStatus('available');
        };
        console.log("💡 Use window.demoUpdate() no console para testar a tela de update.");
    }, []);

    // --- MAIN RENDER LOGIC ---

    // 1. Splash Screen
    if (showSplash) {
        return <SplashScreen />;
    }

    // 2. If not logged in to Chat, show Login Screen
    if (!chatUser) {
        return <Login onLogin={handleChatLogin} apiUrl={apiUrl} />;
    }

    // 2. Main Application Layout
    return (
        <ThemeContext.Provider value={{ theme, currentThemeName, changeTheme }}>
            <div className={`
                flex h-screen ${theme.bg} ${theme.text} overflow-hidden transition-colors duration-300
                ${userSettings.fontFamily} ${userSettings.fontSize}
                ${navPosition === 'left' ? 'flex-row' : (navPosition === 'top' ? 'flex-col' : 'flex-col-reverse')}
            `}>

                {/* --- NAVIGATION COMPONENT --- */}
                <Navigation
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    position={navPosition}
                    onPositionChange={setNavPosition}
                    onBackup={handleForceBackup} // Legacy prop name, mapped to Force Logic
                    lastBackup={lastBackup}
                    onForceBackup={handleForceBackup}
                    isBackingUp={isBackingUp}
                    autoBackupEnabled={autoBackupEnabled}
                    toggleAutoBackup={() => setAutoBackupEnabled(!autoBackupEnabled)}
                    onRestore={() => { /* Restore Logic? */ }} connection={connection}
                    connectionBadgeExpanded={connectionBadgeExpanded}
                    setConnectionBadgeExpanded={setConnectionBadgeExpanded}
                    showConnectionSwitcher={showConnectionSwitcher}
                    setShowConnectionSwitcher={setShowConnectionSwitcher}
                    dropdownRef={dropdownRef}
                    handleQuickSwitch={handleQuickSwitch}
                    savedConnections={savedConnections}
                    handleDisconnect={handleDisconnect}
                    user={chatUser}
                    onLogout={handleLogout}
                    onOpenSettings={() => setShowSettings(true)}
                    updateStatus={updateStatus}
                    updateInfo={updateInfo}
                    currentVersion={VERSION}
                    onCheckUpdates={() => checkForUpdates(true)}
                />

                <SettingsModal
                    isOpen={showSettings}
                    onClose={() => setShowSettings(false)}
                    user={chatUser}
                    onSave={handleSaveSettings}
                    initialSettings={userSettings}
                />

                {/* MAIN CONTENT AREA */}
                <div className="flex-1 flex flex-col relative overflow-hidden">





                    {/* Right Side: Version & User */}


                    {/* Main Content Area */}
                    <main className="flex-1 overflow-hidden relative">
                        <div className="absolute inset-0 overflow-auto p-0">
                            <div className="h-full flex flex-col relative w-full">

                                {/* Team Chat (Always Visible if Active) */}
                                <div key="view-team-chat" className={`${activeTab === 'team-chat' ? 'block h-full' : 'hidden'} w-full animate-tech-reveal`}>
                                    <ErrorBoundary>
                                        <TeamChat
                                            isVisible={activeTab === 'team-chat'}
                                            user={chatUser}
                                            socket={socket}
                                            savedQueries={savedSqlQueries}
                                            setSavedQueries={setSavedSqlQueries}
                                            reminders={reminders}
                                            setReminders={saveReminders}
                                        />
                                    </ErrorBoundary>
                                </div>

                                {/* SQL Runner (Gated by Oracle Connection) */}
                                <div key="view-sql-runner" className={`${activeTab === 'sql-runner' ? 'block h-full' : 'hidden'} w-full animate-tech-reveal`}>
                                    <ErrorBoundary>
                                        {!connection ? (
                                            <ConnectionForm
                                                onConnect={handleConnect}
                                                savedConnections={savedConnections}
                                                onSaveConnection={handleSaveConnection}
                                                onDeleteConnection={handleDeleteConnection}
                                            />
                                        ) : (
                                            <React.Suspense fallback={<div className="p-4 flex items-center justify-center">Carregando Editor SQL...</div>}>
                                                <SqlRunner
                                                    isVisible={activeTab === 'sql-runner'}
                                                    tabs={sqlTabs}
                                                    setTabs={setSqlTabs}
                                                    activeTabId={activeSqlTabId}
                                                    setActiveTabId={setActiveSqlTabId}
                                                    onDisconnect={handleDisconnect}
                                                    connection={connection}
                                                    savedQueries={savedSqlQueries}
                                                    setSavedQueries={setSavedSqlQueries}
                                                />
                                            </React.Suspense>
                                        )}
                                    </ErrorBoundary>
                                </div>
                                {/* AI Builder (Gated by Oracle Connection) */}
                                <div key="view-query-builder" className={`${activeTab === 'query-builder' ? 'block h-full' : 'hidden'} w-full animate-tech-reveal`}>
                                    <ErrorBoundary>
                                        {!connection ? (
                                            <ConnectionForm
                                                onConnect={handleConnect}
                                                savedConnections={savedConnections}
                                                onSaveConnection={handleSaveConnection}
                                                onDeleteConnection={handleDeleteConnection}
                                            />
                                        ) : (
                                            <AiBuilder
                                                isVisible={activeTab === 'query-builder'}
                                                connection={connection}
                                                savedQueries={savedSqlQueries}
                                                user={chatUser}
                                            />
                                        )}
                                    </ErrorBoundary>
                                </div>

                                {/* CSV Importer (Gated by Oracle Connection) */}
                                <div key="view-csv-importer" className={`${activeTab === 'csv-importer' ? 'block h-full' : 'hidden'} w-full animate-tech-reveal`}>
                                    <ErrorBoundary>
                                        {!connection ? (
                                            <ConnectionForm
                                                onConnect={handleConnect}
                                                savedConnections={savedConnections}
                                                onSaveConnection={handleSaveConnection}
                                                onDeleteConnection={handleDeleteConnection}
                                                connection={connection}
                                            />
                                        ) : (
                                            <CsvImporter
                                                isVisible={activeTab === 'csv-importer'}
                                                connectionName={connection?.connectionName || connection?.user}
                                            />
                                        )}
                                    </ErrorBoundary>
                                </div>

                                {/* Reminders (Not Gated) */}
                                <div key="view-reminders" className={`${activeTab === 'reminders' ? 'block h-full' : 'hidden'} w-full animate-tech-reveal`}>
                                    <ErrorBoundary>
                                        <Reminders
                                            isVisible={activeTab === 'reminders'}
                                            reminders={reminders}
                                            setReminders={saveReminders}
                                            socket={socket}
                                            user={chatUser}
                                        />
                                    </ErrorBoundary>
                                </div>

                                {/* Docs (Not Gated) */}
                                <div key="view-docs" className={`${activeTab === 'docs' ? 'block h-full' : 'hidden'} w-full animate-tech-reveal`}>
                                    <ErrorBoundary>
                                        <DocsModule
                                            pendingDoc={pendingDoc}
                                            onDocHandled={() => setPendingDoc(null)}
                                            user={chatUser}
                                        />
                                    </ErrorBoundary>
                                </div>

                                {/* Data Processor Module */}
                                <div key="view-data-processor" className={`${activeTab === 'data-processor' ? 'block h-full' : 'hidden'} w-full animate-tech-reveal`}>
                                    <ErrorBoundary>
                                        <DataProcessor
                                            isVisible={activeTab === 'data-processor'}
                                            connection={connection}
                                        />
                                    </ErrorBoundary>
                                </div>

                                {/* Smart Resolver Module */}
                                <div key="view-smart-resolver" className={`${activeTab === 'smart-resolver' ? 'block h-full' : 'hidden'} w-full animate-tech-reveal`}>
                                    <ErrorBoundary>
                                        <SmartResolver
                                            isVisible={activeTab === 'smart-resolver'}
                                            resolverData={resolverData}
                                        />
                                    </ErrorBoundary>
                                </div>

                            </div>
                        </div>
                    </main>
                </div>
            </div>

            {/* GLOBAL OVERLAYS */}
            <UpdateManager
                updateInfo={updateInfo}
                status={updateStatus}
                onUpdateConfirm={() => console.log("User confirmed update view")}
                onDismiss={() => {
                    setUpdateStatus('idle');
                    setUpdateInfo(null);
                }}
                onRestart={() => window.electronAPI?.restartApp()}
            />

            {/* Toast Notification */}
            {
                toast && (
                    <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-xl text-white text-sm font-bold flex items-center gap-2 animate-in slide-in-from-bottom-5 fade-in z-[100] ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-600'}`}>
                        <span>{toast.type === 'error' ? '⚠️' : '✅'}</span>
                        <span>{toast.message}</span>
                    </div>
                )
            }
        </ThemeContext.Provider>
    );
}

// Hook to listen for Smart Resolver events globaly
const useSmartResolverListener = (setResolverData, setActiveTab) => {
    useEffect(() => {
        const handleShowResolver = (e) => {
            console.log("Showing Smart Resolver:", e.detail);
            setResolverData(e.detail);
            setActiveTab('query-builder'); // Switch to AiBuilder
            // Dispatch internal event or let AiBuilder pick up `resolverData` from some context?
            // Actually, `useSmartResolverListener` sits in App.jsx.
            // We need to pass `resolverData` into `AiBuilder`.
        };
        window.addEventListener('hap-show-smart-resolver', handleShowResolver);
        return () => window.removeEventListener('hap-show-smart-resolver', handleShowResolver);
    }, [setActiveTab, setResolverData]);
};

export default App;
