import React, { useState, useEffect, createContext, useContext } from 'react';
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
    RefreshCw, ShieldCheck, User as UserIcon, LogOut
} from 'lucide-react';

// --- Theme Context & Definitions ---
import { ThemeContext, THEMES } from './context/ThemeContext';
import { useApi } from './context/ApiContext';

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

    const [activeTab, setActiveTab] = useState('team-chat'); // Default to chat after login
    const [pendingDoc, setPendingDoc] = useState(null); // { id, bookId, query }

    // Theme State
    const [currentThemeName, setCurrentThemeName] = useState(() => localStorage.getItem('app_theme') || 'default');
    const theme = THEMES[currentThemeName] || THEMES.default;

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

    // Reminders State (Lifted)
    const [reminders, setReminders] = useState(() => {
        const saved = localStorage.getItem('hap_reminders');
        if (saved) {
            try {
                let parsed = JSON.parse(saved);
                // Migration: Ensure status exists
                parsed = parsed.map(r => {
                    if (!r.status) {
                        return { ...r, status: r.completed ? 'COMPLETED' : 'PENDING' };
                    }
                    return r;
                });
                return parsed;
            } catch (e) {
                console.error("Failed to parse reminders", e);
            }
        }
        return [];
    });

    // Persistence for Reminders
    useEffect(() => {
        if (reminders.length > 0) { // Optional: prevent clearing on initial load if empty? No, initialization handles that.
            localStorage.setItem('hap_reminders', JSON.stringify(reminders));
        }
    }, [reminders]);

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
            const timeoutId = setTimeout(() => {
                if (updateStatus === 'checking') {
                    console.warn("Update check timed out.");
                    setUpdateStatus('idle'); // Or 'up-to-date' if we want to be optimistic, but 'idle' is safer?
                    // Let's show a toast saying "Check timed out" or just silent fail?
                    // User complained about "Infinite", so better to finish.
                    // If manual, maybe 'up-to-date' style?
                    window.dispatchEvent(new CustomEvent('update-timeout')); // Optional custom handling
                }
            }, 15000);

            // Trigger native check
            try {
                await window.electronAPI.invoke('manual-check-update');
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
            <div className={`flex flex-col h-screen ${theme.bg} font-sans overflow-hidden transition-colors duration-300`}>

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
                <header className={`h-16 shadow-sm flex items-center justify-between px-6 z-20 border-b bg-white border-gray-100 print:hidden transition-all duration-300`}>

                    {/* Tabs */}
                    <div className="flex-1 flex justify-start space-x-1">
                        <NavTab id="team-chat" icon={MessageSquare} label="Chat" colorClass="text-blue-600" bgClass="bg-blue-50" />
                        <NavTab id="sql-runner" icon={Database} label="Editor SQL" colorClass="text-orange-600" bgClass="bg-orange-50" />
                        <NavTab id="query-builder" icon={Sparkles} label="Construtor AI" colorClass="text-purple-600" bgClass="bg-purple-50" />
                        <NavTab id="csv-importer" icon={FileInput} label="Importar CSV" colorClass="text-green-600" bgClass="bg-green-50" />
                        <NavTab id="reminders" icon={Calendar} label="Lembretes" colorClass="text-red-500" bgClass="bg-red-50" />
                        <NavTab id="docs" icon={BookOpen} label="Docs" colorClass="text-indigo-600" bgClass="bg-indigo-50" />
                    </div>

                    {/* Right Side: Version & User */}
                    <div className="flex items-center gap-3 min-w-[200px] justify-end">

                        <ErrorBoundary>
                            <UpdateManager
                                status={updateStatus}
                                updateInfo={updateInfo}
                                progress={downloadProgress}
                                onCheck={() => checkForUpdates(true)}
                                onRestart={() => window.electronAPI.invoke('restart_app')}
                                onDismiss={() => setUpdateStatus('idle')}
                            />
                        </ErrorBoundary>
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
                            {updateStatus === 'checking' ? 'Buscando...' :
                                updateStatus === 'available' ? 'Nova Versão!' :
                                    updateStatus === 'ready' ? 'Instalar Agora' :
                                        `v${VERSION}`}
                        </button>

                        <div className="h-6 w-[1px] bg-gray-100 mx-1"></div>

                        {/* Theme Select (Compact) */}
                        <div className="relative group">
                            <select
                                value={currentThemeName}
                                onChange={(e) => changeTheme(e.target.value)}
                                className={`text-xs py-1.5 px-2 rounded-lg bg-gray-50 border border-gray-200 outline-none cursor-pointer hover:bg-white hover:border-blue-300 transition-colors text-gray-600 font-medium`}
                                title="Mudar Tema"
                            >
                                {Object.entries(THEMES).map(([key, val]) => (
                                    <option key={key} value={key}>{val.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="h-6 w-[1px] bg-gray-100 mx-1"></div>

                        {/* Chat User Info (V2 Clean) */}
                        <div className="text-right hidden md:block group cursor-default">
                            <p className="text-sm font-bold leading-tight text-gray-700 group-hover:text-blue-600 transition-colors">{chatUser.username}</p>
                            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{chatUser.team || 'Geral'}</p>
                        </div>

                        {/* Logout Button (V2) */}
                        <button
                            onClick={handleLogout}
                            className="p-2 rounded-xl text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all duration-300"
                            title="Sair / Logout"
                        >
                            <LogOut size={18} />
                        </button>
                    </div>
                </header>

                {/* Main Content Area */}
                <main className="flex-1 overflow-hidden relative">
                    <div className="absolute inset-0 overflow-auto p-0">
                        <div className="h-full flex flex-col relative w-full">

                            {/* Team Chat (Always Visible if Active) */}
                            <div key={activeTab} className={`${activeTab === 'team-chat' ? 'block h-full' : 'hidden'} w-full animate-tech-reveal`}>
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
                            <div key={activeTab + '-sql'} className={`${activeTab === 'sql-runner' ? 'block h-full' : 'hidden'} w-full animate-tech-reveal`}>
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
                            {/* AI Builder (Gated by Oracle Connection) */}
                            <div key={activeTab + '-builder'} className={`${activeTab === 'query-builder' ? 'block h-full' : 'hidden'} w-full animate-tech-reveal`}>
                                <ErrorBoundary>
                                    {!connection ? (
                                        <ConnectionForm onConnect={handleConnect} />
                                    ) : (
                                        <AiBuilder isVisible={activeTab === 'query-builder'} />
                                    )}
                                </ErrorBoundary>
                            </div>

                            {/* CSV Importer (Gated by Oracle Connection) */}
                            <div key={activeTab + '-csv'} className={`${activeTab === 'csv-importer' ? 'block h-full' : 'hidden'} w-full animate-tech-reveal`}>
                                <ErrorBoundary>
                                    {!connection ? (
                                        <ConnectionForm onConnect={handleConnect} />
                                    ) : (
                                        <CsvImporter isVisible={activeTab === 'csv-importer'} />
                                    )}
                                </ErrorBoundary>
                            </div>

                            {/* Reminders (Not Gated) */}
                            <div key={activeTab + '-reminders'} className={`${activeTab === 'reminders' ? 'block h-full' : 'hidden'} w-full animate-tech-reveal`}>
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
                            <div key={activeTab + '-docs'} className={`${activeTab === 'docs' ? 'block h-full' : 'hidden'} w-full animate-tech-reveal`}>
                                <ErrorBoundary>
                                    <DocsModule
                                        pendingDoc={pendingDoc}
                                        onDocHandled={() => setPendingDoc(null)}
                                    />
                                </ErrorBoundary>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </ThemeContext.Provider>
    );
}

export default App;
