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
import UpdateBanner from './components/UpdateBanner';

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
    const [updateStatus, setUpdateStatus] = useState('idle'); // idle, available, ready
    const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

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
                notes: 'Baixando atualização automaticamente...'
            });
        });

        window.electronAPI.onUpdateDownloaded((info) => {
            console.log("Update downloaded:", info);
            setUpdateStatus('ready');
            setUpdateInfo(prev => ({ ...prev, notes: 'Atualização pronta para instalar!' }));
        });

    }, []);

    const checkForUpdates = async (manual = false) => {
        if (!window.electronAPI) return;

        if (manual) {
            setIsCheckingUpdate(true);
            // Trigger native check
            await window.electronAPI.invoke('manual-check-update'); // Created in electron-main.js

            // UX Fake delay since we don't get sync result
            setTimeout(() => {
                setIsCheckingUpdate(false);
                if (updateStatus === 'idle') {
                    // If no event fired in 3s, assume up to date (Naive but works for MVP)
                    // Or we could add a 'update-not-available' event listener
                }
            }, 3000);
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

    const NavTab = ({ id, icon, label }) => {
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
                    relative group px-4 py-2 text-sm font-medium rounded-md transition-all duration-300 ease-out flex items-center space-x-2
                    ${isActive ? theme.tabActive : theme.tabInactive}
                    hover:-translate-y-0.5
                `}
            >
                <span className="text-lg">{icon}</span>
                <span>{label}</span>
                {/* Active Indicator (Bottom Border Effect) */}
                {isActive && (
                    <span className="absolute bottom-0 left-0 w-full h-[2px] bg-current rounded-full opacity-60"></span>
                )}
            </button>
        );
    };

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

                <UpdateBanner
                    updateInfo={updateInfo}
                    onClose={() => setUpdateInfo(null)}
                    onDownload={() => {
                        if (updateStatus === 'ready') {
                            window.electronAPI?.restartApp();
                        } else {
                            alert("O download está em andamento. Aguarde...");
                        }
                    }}
                    status={updateStatus} // Pass status to Banner if needed (need to update Banner component too)
                />

                {/* Header */}

                {/* Top Navigation Bar */}
                {/* Top Navigation Bar */}
                <header className={`${theme.navbar} ${theme.navbarText} h-16 shadow-md flex items-center justify-between px-6 z-20 border-b ${theme.border} print:hidden`}>

                    {/* Tabs */}
                    <div className="flex-1 flex justify-start space-x-2">
                        <NavTab id="team-chat" icon="💬" label="Chat" />
                        <NavTab id="sql-runner" icon="💻" label="Editor SQL" />
                        <NavTab id="query-builder" icon="🤖" label="Construtor AI" />
                        <NavTab id="csv-importer" icon="📂" label="Importar CSV" />
                        <NavTab id="reminders" icon="📅" label="Lembretes" />
                        <NavTab id="docs" icon="📚" label="Docs" />
                    </div>

                    {/* Right Side: Version & User */}
                    <div className="flex items-center space-x-4 min-w-[200px] justify-end">

                        {/* Manual Update Check */}
                        <button
                            onClick={() => checkForUpdates(true)}
                            disabled={isCheckingUpdate}
                            className={`
                                text-xs font-bold px-3 py-1 rounded-full border transition-colors
                                ${isCheckingUpdate ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-wait' : 'bg-transparent hover:bg-black/5 border-current opacity-60 hover:opacity-100'}
                            `}
                            title="Verificar se há novas versões"
                        >
                            {isCheckingUpdate ? 'Verificando...' : `v${VERSION} 🔄`}
                        </button>

                        <div className="h-8 w-[1px] bg-current opacity-20 mx-2"></div>

                        {/* Theme Select (Compact) */}
                        <div className="relative group">
                            <select
                                value={currentThemeName}
                                onChange={(e) => changeTheme(e.target.value)}
                                className={`text-xs py-1 px-2 rounded border outline-none cursor-pointer opacity-70 hover:opacity-100 transition-opacity ${theme.input} ${theme.border}`}
                                title="Mudar Tema"
                            >
                                {Object.entries(THEMES).map(([key, val]) => (
                                    <option key={key} value={key}>{val.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="h-8 w-[1px] bg-current opacity-20 mx-2"></div>

                        {/* Chat User Info */}
                        <div className="text-right hidden md:block">
                            <p className="text-sm font-bold leading-tight">{chatUser.username}</p>
                            <p className="text-[10px] opacity-70 truncate max-w-[150px]">{chatUser.team || 'Geral'}</p>
                        </div>

                        {/* Logout Button */}
                        <button
                            onClick={handleLogout}
                            className="p-2 rounded-full hover:bg-red-500 hover:text-white transition-all duration-300 group"
                            title="Sair / Logout"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                            </svg>
                        </button>
                    </div>
                </header>

                {/* Main Content Area */}
                <main className="flex-1 overflow-hidden relative">
                    <div className="absolute inset-0 overflow-auto p-0">
                        <div className="h-full flex flex-col relative w-full">

                            {/* Team Chat (Always Visible if Active) */}
                            <div className={`${activeTab === 'team-chat' ? 'block h-full' : 'hidden'} w-full`}>
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
                            <div className={`${activeTab === 'sql-runner' ? 'block h-full' : 'hidden'} w-full`}>
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
                                                savedQueries={savedSqlQueries}
                                                setSavedQueries={setSavedSqlQueries}
                                                onDisconnect={handleDisconnect}
                                            />
                                        </React.Suspense>
                                    )}
                                </ErrorBoundary>
                            </div>

                            {/* AI Builder (Gated by Oracle Connection) */}
                            <div className={`${activeTab === 'query-builder' ? 'block h-full' : 'hidden'} w-full`}>
                                <ErrorBoundary>
                                    {!connection ? (
                                        <ConnectionForm onConnect={handleConnect} />
                                    ) : (
                                        <AiBuilder isVisible={activeTab === 'query-builder'} />
                                    )}
                                </ErrorBoundary>
                            </div>

                            {/* CSV Importer (Gated by Oracle Connection) */}
                            <div className={`${activeTab === 'csv-importer' ? 'block h-full' : 'hidden'} w-full`}>
                                <ErrorBoundary>
                                    {!connection ? (
                                        <ConnectionForm onConnect={handleConnect} />
                                    ) : (
                                        <CsvImporter isVisible={activeTab === 'csv-importer'} />
                                    )}
                                </ErrorBoundary>
                            </div>

                            {/* Reminders (Not Gated) */}
                            <div className={`${activeTab === 'reminders' ? 'block h-full' : 'hidden'} w-full`}>
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
                            <div className={`${activeTab === 'docs' ? 'block h-full' : 'hidden'} w-full`}>
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
