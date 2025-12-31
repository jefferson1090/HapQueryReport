import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { io } from "socket.io-client";
import ConnectionForm from './components/ConnectionForm';
import QueryBuilder from './components/QueryBuilder'; // Legacy
import AiBuilder from './components/AiBuilder';
// import SqlRunner from './components/SqlRunner';
const SqlRunner = React.lazy(() => import('./components/SqlRunner'));
import CsvImporter from './components/CsvImporter';
import DocsModule from './components/DocsModule';
import Reminders from './components/Reminders';
import TeamChat from './components/TeamChat';
import Login from './components/Login';
import SplashScreen from './components/SplashScreen';
import ErrorBoundary from './components/ErrorBoundary';
import hapLogo from './assets/hap_logo_v4.png';
import { getApiUrl } from './config';
import UpdateManager from './components/UpdateManager';
import {
    MessageSquare, Database, Sparkles, FileInput, Calendar, BookOpen,
    RefreshCw, ShieldCheck, User as UserIcon, LogOut, Cloud
} from 'lucide-react';

// --- Theme Context & Definitions ---
import { ThemeContext, THEMES } from './context/ThemeContext';
import { useApi } from './context/ApiContext';
import { decryptPassword } from './utils/security';

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
    const [activeTab, setActiveTab] = useState('team-chat'); // Default to chat after login
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
    const dropdownRef = useRef(null);
    const [toast, setToast] = useState(null); // { message, type }

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

    const loadSavedConnections = () => {
        const saved = localStorage.getItem('oracle_connections');
        if (saved) {
            try {
                setSavedConnections(JSON.parse(saved));
            } catch (e) { console.error(e); }
        }
    };

    useEffect(() => {
        loadSavedConnections();
        // Listen for storage changes in case ConnectionForm updates it
        const handleStorageChange = (e) => {
            if (e.key === 'oracle_connections') {
                loadSavedConnections();
            }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

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
        if (!window.electronAPI) return;

        if (manual) {
            setUpdateStatus('checking');
            setDownloadProgress(0);

            // Failsafe: Reset to idle if no response after 15 seconds (prevents infinite loop)
            // Failsafe: Reset to idle if no response after 15 seconds (prevents infinite loop)
            const timeoutId = setTimeout(() => {
                setUpdateStatus(prev => {
                    if (prev === 'checking') {
                        console.warn("Update check timed out.");
                        return 'idle';
                    }
                    return prev;
                });
            }, 15000);

            // Trigger native check
            try {
                const result = await window.electronAPI.invoke('manual-check-update');
                // If update check returns explicitly (e.g. skipped or immediate result), handling it here creates race conditions with events.
                // But if it's null/undefined (Dev mode skipped), we should reset.
                if (!result) {
                    console.log("Update check returned no result (likely Dev mode).");
                    // Delay slightly to allow events to fire if they exist
                    setTimeout(() => {
                        setUpdateStatus(prev => prev === 'checking' ? 'up-to-date' : prev); // Assume up-to-date if no result
                    }, 2000);
                }
            } catch (error) {
                console.error("Update invoke error:", error);
                setUpdateStatus('error');
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

        window.addEventListener('hap-doc-open', handleDocOpen);
        window.addEventListener('hap-run-sql', handleRunSql);
        return () => {
            window.removeEventListener('hap-doc-open', handleDocOpen);
            window.removeEventListener('hap-run-sql', handleRunSql);
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

    // --- Data Persistence: Manual Backup & Restore ---
    const handleBackupData = () => {
        const data = {
            version: VERSION,
            exportDate: new Date().toISOString(),
            savedQueries: savedSqlQueries,
            sqlTabs: sqlTabs.map(t => ({ ...t, results: null })), // Clean results
            reminders: reminders,
            theme: currentThemeName,
            chatUser: chatUser
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `hap_backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
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
    const NavTab = ({ id, icon: Icon, label, colorClass = "text-blue-600", bgClass = "bg-blue-50" }) => {
        const isActive = activeTab === id;
        return (
            <button
                onClick={() => {
                    window.electronAPI?.resetFocus();
                    window.focus();
                    if (document.activeElement) document.activeElement.blur();
                    setActiveTab(id);
                }}
                className={`
                    relative group px-4 py-2 text-sm font-medium rounded-xl transition-all duration-300 ease-out flex items-center gap-2.5 overflow-hidden
                    ${isActive
                        ? `${colorClass} ${bgClass} shadow-sm border border-transparent`
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100 border border-transparent'
                    }
                `}
            >
                {/* Active Indicator Line (Left) */}
                <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 ${colorClass.replace('text-', 'bg-')} rounded-r-full transition-all duration-300 ${isActive ? 'opacity-100' : 'opacity-0 -translate-x-full'}`}></span>

                <Icon size={18} className={`transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110 group-hover:-rotate-3'}`} />
                <span className="tracking-wide">{label}</span>

                {/* Tech Glow Effect (Active) */}
                {isActive && <span className={`absolute inset-0 rounded-xl ${colorClass.replace('text-', 'bg-')} opacity-5 pointer-events-none`}></span>}
            </button>
        );
    };

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
            <div className={`flex flex-col h-screen ${theme.bg} ${theme.text} font-sans overflow-hidden transition-colors duration-300`}>

                {/* V2 Update Manager (Replaces Banner) */}
                <UpdateManager
                    updateInfo={updateInfo}
                    updateStatus={updateStatus} // 'idle' | 'available' | 'ready'
                    onUpdateConfirm={() => {
                        // In autoDownload=true mode, confirming just means "Show me the progress"
                        // But if we switched to manual, we'd fire window.electronAPI.invoke('download-update') here.
                        console.log("User confirmed update view");
                    }}
                    onCancel={() => setUpdateInfo(null)}
                    onRestart={() => window.electronAPI?.restartApp()}
                />

                {/* Header */}

                {/* Top Navigation Bar */}
                <header className={`h-16 shadow-sm flex items-center justify-between px-6 z-20 border-b ${theme.navbar} ${theme.navbarText} ${theme.border} print:hidden transition-all duration-300`}>

                    {/* Channel Indicator (Beta) */}
                    {appChannel === 'beta' && (
                        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-3 py-0.5 rounded-b-lg shadow-sm z-50">
                            MODE: BETA (ADMIN)
                        </div>
                    )}

                    {/* Tabs - Responsive Scrollable Container */}
                    <div className="flex-1 flex justify-start space-x-1 overflow-x-auto no-scrollbar mask-gradient-right min-w-0 mr-2">
                        <NavTab id="team-chat" icon={MessageSquare} label="Chat" colorClass="text-blue-600" bgClass="bg-blue-50" />
                        <NavTab id="sql-runner" icon={Database} label="Editor SQL" colorClass="text-orange-600" bgClass="bg-orange-50" />
                        <NavTab id="query-builder" icon={Sparkles} label="Construtor AI" colorClass="text-purple-600" bgClass="bg-purple-50" />
                        <NavTab id="csv-importer" icon={FileInput} label="Importar CSV" colorClass="text-green-600" bgClass="bg-green-50" />
                        <NavTab id="reminders" icon={Calendar} label="Lembretes" colorClass="text-red-500" bgClass="bg-red-50" />
                        <NavTab id="docs" icon={BookOpen} label="Docs" colorClass="text-indigo-600" bgClass="bg-indigo-50" />
                    </div>

                    {/* Right Side: Version & User - Fixed / flexible but won't be crushed */}
                    <div className="flex items-center gap-2 flex-shrink-0 justify-end">

                        {/* Backup Actions - Always visible but compact */}
                        <div className="flex items-center gap-1">
                            <button
                                onClick={handleBackupData}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                title="Fazer Backup"
                            >
                                <Cloud size={18} />
                            </button>
                            <label className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all cursor-pointer" title="Restaurar Backup">
                                <RefreshCw size={18} />
                                <input type="file" onChange={handleRestoreData} accept=".json" className="hidden" />
                            </label>
                        </div>



                        {/* Global Connection Badge - Responsive & Interactive */}
                        {connection && (
                            <div className="relative z-50">
                                <div
                                    onClick={() => setConnectionBadgeExpanded(!connectionBadgeExpanded)}
                                    className={`
                                        flex items-center gap-2 px-2 py-1.5 rounded-full text-xs font-bold border shadow-sm transition-all duration-300 cursor-pointer select-none
                                        ${connectionBadgeExpanded
                                            ? 'bg-indigo-600 text-white border-indigo-500 pr-4'
                                            : 'bg-white text-indigo-600 border-indigo-100 hover:bg-indigo-50'
                                        }
                                    `}
                                    title={`Conexão: ${connection.connectionName || 'N/A'}\nUsuário: ${connection.user}\nHost: ${connection.connectString}`}
                                >
                                    <div className={`p-0.5 rounded-full transition-colors ${connectionBadgeExpanded ? 'bg-indigo-500 text-white' : 'bg-indigo-50 text-indigo-600'}`}>
                                        <Database size={14} className={`shrink-0`} />
                                    </div>

                                    <div className={`
                                        overflow-hidden whitespace-nowrap transition-all duration-500 ease-in-out flex flex-col items-start
                                        ${connectionBadgeExpanded ? 'max-w-[200px] opacity-100 ml-1' : 'max-w-0 opacity-0'}
                                    `}>
                                        <span className="truncate leading-tight block">
                                            {connection.connectionName || connection.user}
                                        </span>
                                        {connectionBadgeExpanded && <span className="text-[9px] font-normal opacity-80 block truncate w-full">{connection.user} @ {connection.connectString}</span>}
                                    </div>

                                    {/* Status Dot */}
                                    <span className={`w-1.5 h-1.5 rounded-full animate-pulse shrink-0 ${connectionBadgeExpanded ? 'bg-green-300' : 'bg-green-500'}`}></span>
                                </div>

                                {/* Unified Connection Switcher Dropdown */}
                                {connectionBadgeExpanded && (
                                    <div ref={dropdownRef} className="absolute top-full mt-2 right-0 bg-white rounded-xl shadow-xl border border-gray-100 p-2 w-[240px] flex flex-col gap-1 z-50 animate-in fade-in slide-in-from-top-2 origin-top-right">

                                        {!showConnectionSwitcher ? (
                                            // VIEW 1: Actions
                                            <>
                                                <div className="px-2 py-1.5 text-xs text-gray-500 font-bold border-b border-gray-100 mb-1">
                                                    Conexão Atual
                                                </div>

                                                {/* Switch Trigger */}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setShowConnectionSwitcher(true);
                                                    }}
                                                    className="flex items-center gap-2 w-full px-2 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 rounded-lg text-left transition-colors"
                                                >
                                                    <span className="text-gray-400">⇄</span> Trocar Conexão
                                                </button>

                                                {/* Disconnect */}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDisconnect();
                                                    }}
                                                    className="flex items-center gap-2 w-full px-2 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg text-left transition-colors"
                                                >
                                                    <span className="text-red-400">✕</span> Desconectar
                                                </button>
                                            </>
                                        ) : (
                                            // VIEW 2: Saved Connections List
                                            <>
                                                <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-gray-500 font-bold border-b border-gray-100 mb-1">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setShowConnectionSwitcher(false);
                                                        }}
                                                        className="hover:text-blue-600 hover:bg-blue-50 p-1 -ml-1 rounded transition-colors"
                                                        title="Voltar"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                                                    </button>
                                                    <span>Conexões Salvas</span>
                                                </div>

                                                <div className="max-h-[200px] overflow-y-auto custom-scrollbar">
                                                    {savedConnections.length === 0 && <div className="text-center p-2 text-xs text-gray-400">Nenhuma salva</div>}
                                                    {savedConnections.map((conn, i) => (
                                                        <button
                                                            key={i}
                                                            onClick={(e) => { e.stopPropagation(); handleQuickSwitch(conn); }}
                                                            className="w-full text-left px-2 py-2 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-lg truncate flex items-center justify-between group"
                                                        >
                                                            <span>{conn.connectionName || 'Sem nome'}</span>
                                                            {conn.id === connection.id && <span className="text-green-500">●</span>}
                                                        </button>
                                                    ))}
                                                </div>

                                                <div className="border-t border-gray-100 mt-1 pt-1">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDisconnect();
                                                            setConnectionBadgeExpanded(false);
                                                        }}
                                                        className="w-full text-left px-2 py-2 text-xs text-blue-600 font-bold hover:bg-blue-50 rounded-lg"
                                                    >
                                                        + Nova Conexão
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        <button
                            onClick={() => checkForUpdates(true)}
                            disabled={updateStatus === 'checking'}
                            className={`
                                flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold
                                transition-all duration-300 shadow-sm
                                ${updateStatus === 'available' || updateStatus === 'ready'
                                    ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white animate-pulse'
                                    : 'bg-white/50 text-gray-600 hover:bg-white/80 hover:text-blue-600 border border-gray-200'}
                            `}
                        >
                            <RefreshCw size={14} className={`${updateStatus === 'checking' ? 'animate-spin' : ''}`} />
                            <span className="hidden lg:inline">
                                {updateStatus === 'checking' ? 'Buscando...' :
                                    updateStatus === 'available' ? 'Nova Versão!' :
                                        updateStatus === 'ready' ? 'Instalar' :
                                            `v${VERSION}`}
                            </span>
                        </button>

                        <div className="h-4 w-[1px] bg-gray-100 mx-1"></div>

                        {/* Theme Select (Compact) */}
                        <div className="relative group">
                            <select
                                value={currentThemeName}
                                onChange={(e) => changeTheme(e.target.value)}
                                className={`text-xs py-1 px-2 rounded-lg bg-gray-50 border border-gray-200 outline-none cursor-pointer hover:bg-white hover:border-blue-300 transition-colors text-gray-600 font-medium`}
                                title="Mudar Tema"
                            >
                                {Object.entries(THEMES).map(([key, val]) => (
                                    <option key={key} value={key}>{val.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Chat User Info (Hidden on smaller screens) */}
                        <div className="text-right hidden 2xl:block group cursor-default">
                            <p className="text-sm font-bold leading-tight text-gray-700 group-hover:text-blue-600 transition-colors">{chatUser.username}</p>
                            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{chatUser.team || 'Geral'}</p>
                        </div>

                        {/* Logout Button (V2) */}
                        <button
                            onClick={handleLogout}
                            className="p-2 rounded-xl text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all duration-300"
                            title="Sair / Logout"
                        >
                            <LogOut size={16} />
                        </button>
                    </div>
                </header>

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
                                        <ConnectionForm onConnect={handleConnect} />
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
                                        <ConnectionForm onConnect={handleConnect} />
                                    ) : (
                                        <AiBuilder isVisible={activeTab === 'query-builder'} connection={connection} />
                                    )}
                                </ErrorBoundary>
                            </div>

                            {/* CSV Importer (Gated by Oracle Connection) */}
                            <div key="view-csv-importer" className={`${activeTab === 'csv-importer' ? 'block h-full' : 'hidden'} w-full animate-tech-reveal`}>
                                <ErrorBoundary>
                                    {!connection ? (
                                        <ConnectionForm onConnect={handleConnect} />
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
                        </div>
                    </div>
                </main>
            </div>

            {/* Toast Notification */}
            {toast && (
                <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-xl text-white text-sm font-bold flex items-center gap-2 animate-in slide-in-from-bottom-5 fade-in z-[100] ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-600'}`}>
                    <span>{toast.type === 'error' ? '⚠️' : '✅'}</span>
                    <span>{toast.message}</span>
                </div>
            )}
        </ThemeContext.Provider>
    );
}


export default App;
