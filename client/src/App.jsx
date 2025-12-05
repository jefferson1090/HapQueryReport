import React, { useState, useEffect, createContext, useContext } from 'react';
import ConnectionForm from './components/ConnectionForm';
import QueryBuilder from './components/QueryBuilder';
import SqlRunner from './components/SqlRunner';
import CsvImporter from './components/CsvImporter';
import Reminders from './components/Reminders';
import hapLogo from './assets/hap_logo_v4.png';

// --- Theme Context & Definitions ---
export const ThemeContext = createContext();

export const THEMES = {
    default: {
        name: 'Padrão (Azul)',
        bg: 'bg-gray-100', // Main background
        navbar: 'bg-white', // Top Bar background
        navbarText: 'text-gray-700',
        text: 'text-gray-700',
        primaryBtn: 'bg-blue-600 hover:bg-blue-700 text-white',
        secondaryBtn: 'bg-gray-100 hover:bg-gray-200 text-gray-600',
        accent: 'text-blue-600',
        border: 'border-gray-200',
        input: 'bg-white text-gray-900',
        panel: 'bg-white',
        tabActive: 'bg-blue-50 text-blue-600 border-blue-600',
        tabInactive: 'text-gray-500 hover:bg-gray-50 hover:text-blue-500'
    },
    dark: {
        name: 'Modo Escuro',
        bg: 'bg-gray-900',
        navbar: 'bg-gray-800',
        navbarText: 'text-gray-200',
        text: 'text-gray-200',
        primaryBtn: 'bg-indigo-600 hover:bg-indigo-700 text-white',
        secondaryBtn: 'bg-gray-700 hover:bg-gray-600 text-gray-200',
        accent: 'text-indigo-400',
        border: 'border-gray-700',
        input: 'bg-gray-700 text-white border-gray-600',
        panel: 'bg-gray-800',
        tabActive: 'bg-gray-700 text-indigo-400 border-indigo-400',
        tabInactive: 'text-gray-400 hover:bg-gray-700 hover:text-indigo-300'
    },
    ubuntu: {
        name: 'Ubuntu',
        bg: 'bg-[#fdf6e3]',
        navbar: 'bg-[#300a24]',
        navbarText: 'text-white',
        text: 'text-[#300a24]',
        primaryBtn: 'bg-[#e95420] hover:bg-[#c7461b] text-white',
        secondaryBtn: 'bg-[#aea79f] hover:bg-[#9e968d] text-white',
        accent: 'text-[#e95420]',
        border: 'border-[#aea79f]',
        input: 'bg-white text-[#300a24]',
        panel: 'bg-white',
        tabActive: 'bg-[#4e103b] text-[#e95420] border-[#e95420]',
        tabInactive: 'text-gray-300 hover:bg-[#4e103b] hover:text-[#e95420]'
    },
    forest: {
        name: 'Floresta',
        bg: 'bg-stone-100',
        navbar: 'bg-[#1c2e1f]',
        navbarText: 'text-stone-200',
        text: 'text-[#1c2e1f]',
        primaryBtn: 'bg-[#2d4a33] hover:bg-[#3a5e42] text-white',
        secondaryBtn: 'bg-stone-200 hover:bg-stone-300 text-stone-700',
        accent: 'text-[#2d4a33]',
        border: 'border-stone-200',
        input: 'bg-white text-stone-800',
        panel: 'bg-[#fdfbf7]',
        tabActive: 'bg-[#2d4a33] text-white border-[#4caf50]',
        tabInactive: 'text-stone-400 hover:bg-[#2d4a33] hover:text-white'
    },
    ocean: {
        name: 'Oceano',
        bg: 'bg-cyan-50',
        navbar: 'bg-white',
        navbarText: 'text-slate-700',
        text: 'text-slate-700',
        primaryBtn: 'bg-cyan-600 hover:bg-cyan-700 text-white',
        secondaryBtn: 'bg-cyan-100 hover:bg-cyan-200 text-cyan-800',
        accent: 'text-cyan-600',
        border: 'border-cyan-200',
        input: 'bg-white text-slate-700',
        panel: 'bg-white',
        tabActive: 'bg-cyan-50 text-cyan-700 border-cyan-600',
        tabInactive: 'text-slate-500 hover:bg-cyan-50 hover:text-cyan-600'
    },
    dracula: {
        name: 'Dracula',
        bg: 'bg-[#282a36]',
        navbar: 'bg-[#44475a]',
        navbarText: 'text-[#f8f8f2]',
        text: 'text-[#f8f8f2]',
        primaryBtn: 'bg-[#bd93f9] hover:bg-[#ff79c6] text-[#282a36]',
        secondaryBtn: 'bg-[#6272a4] hover:bg-[#50fa7b] text-white',
        accent: 'text-[#ff79c6]',
        border: 'border-[#6272a4]',
        input: 'bg-[#282a36] text-[#f8f8f2] border-[#6272a4]',
        panel: 'bg-[#282a36]',
        tabActive: 'bg-[#282a36] text-[#ff79c6] border-[#ff79c6]',
        tabInactive: 'text-[#6272a4] hover:bg-[#282a36] hover:text-[#bd93f9]'
    },
    military: {
        name: 'Militar',
        bg: 'bg-[#f5f5f5]',
        navbar: 'bg-[#3e2723]',
        navbarText: 'text-[#efebe9]',
        text: 'text-[#3e2723]',
        primaryBtn: 'bg-[#558b2f] hover:bg-[#33691e] text-white',
        secondaryBtn: 'bg-[#795548] hover:bg-[#5d4037] text-white',
        accent: 'text-[#33691e]',
        border: 'border-[#8d6e63]',
        input: 'bg-white text-gray-900 border-[#8d6e63]',
        panel: 'bg-[#fafafa]',
        tabActive: 'bg-[#5d4037] text-[#efebe9] border-[#fafafa]',
        tabInactive: 'text-[#efebe9] opacity-70 hover:opacity-100'
    }
};

function App() {
    const [connection, setConnection] = useState(null);
    const [activeTab, setActiveTab] = useState('query-builder');
    // Removed isSidebarOpen state

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
                return JSON.parse(saved);
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

    // Auto-Update State
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [updateDownloaded, setUpdateDownloaded] = useState(false);

    useEffect(() => {
        // v1.2.0 - UI Modernization
        document.title = "Hap Query Report v1.2.0";
        if (window.electronAPI) {
            window.electronAPI.onUpdateAvailable(() => setUpdateAvailable(true));
            window.electronAPI.onUpdateDownloaded(() => {
                setUpdateDownloaded(true);
                setUpdateAvailable(false);
            });
        }
    }, []);

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
            loading: false
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
        setActiveTab('query-builder');
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

    if (!connection) {
        return <ConnectionForm onConnect={handleConnect} />;
    }

    return (
        <ThemeContext.Provider value={{ theme, currentThemeName, changeTheme }}>
            <div className={`flex flex-col h-screen ${theme.bg} font-sans overflow-hidden transition-colors duration-300`}>

                {/* Update Notification */}
                {(updateAvailable || updateDownloaded) && (
                    <div className="fixed top-20 right-4 z-50 bg-white border border-blue-200 shadow-lg rounded-lg p-4 flex items-center space-x-4 animate-fade-in-down">
                        <div className="bg-blue-100 p-2 rounded-full">
                            <span className="text-xl">🚀</span>
                        </div>
                        <div>
                            <h4 className="font-bold text-gray-800">Nova versão disponível!</h4>
                            <p className="text-sm text-gray-600">
                                {updateDownloaded ? 'Pronto para instalar.' : 'Baixando atualização...'}
                            </p>
                        </div>
                        {updateDownloaded && (
                            <button
                                onClick={restartApp}
                                className="bg-green-600 text-white px-3 py-1 rounded-md text-sm font-bold hover:bg-green-700 transition-colors"
                            >
                                Reiniciar
                            </button>
                        )}
                    </div>
                )}

                {/* Top Navigation Bar */}
                <header className={`${theme.navbar} ${theme.navbarText} h-16 shadow-md flex items-center justify-between px-6 z-20 border-b ${theme.border}`}>

                    {/* Tabs (Left Aligned to fill empty space) */}
                    <div className="flex-1 flex justify-start space-x-2">
                        <NavTab id="query-builder" icon="📊" label="Construtor" />
                        <NavTab id="sql-runner" icon="💻" label="Editor SQL" />
                        <NavTab id="csv-importer" icon="📂" label="Importar CSV" />
                        <NavTab id="reminders" icon="🔔" label="Lembretes" />
                    </div>

                    {/* Right: User & Actions */}
                    <div className="flex items-center space-x-4 min-w-[200px] justify-end">

                        {/* Theme Select (Compact) */}
                        <div className="relative group">
                            <select
                                value={currentThemeName}
                                onChange={(e) => changeTheme(e.target.value)}
                                className={`textxs py-1 px-2 rounded border outline-none cursor-pointer opacity-70 hover:opacity-100 transition-opacity ${theme.input} ${theme.border}`}
                                title="Mudar Tema"
                            >
                                {Object.entries(THEMES).map(([key, val]) => (
                                    <option key={key} value={key}>{val.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="h-8 w-[1px] bg-current opacity-20 mx-2"></div>

                        {/* User Info */}
                        <div className="text-right hidden md:block">
                            <p className="text-sm font-bold leading-tight">{connection.user}</p>
                            <p className="text-[10px] opacity-70 truncate max-w-[150px]">{connection.connectString}</p>
                        </div>

                        {/* Disconnect */}
                        <button
                            onClick={handleDisconnect}
                            className="p-2 rounded-full hover:bg-red-500 hover:text-white transition-all duration-300 group"
                            title="Desconectar"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                            </svg>
                        </button>
                    </div>
                </header>

                {/* Main Content Area */}
                <main className="flex-1 overflow-hidden relative">
                    <div className="absolute inset-0 overflow-auto p-4 sm:p-6">
                        <div className="max-w-7xl mx-auto h-full flex flex-col relative">
                            {/* Content Wrappers (Preserving State) */}
                            <div className={activeTab === 'query-builder' ? 'block h-full' : 'hidden'}>
                                <QueryBuilder isVisible={activeTab === 'query-builder'} />
                            </div>
                            <div className={activeTab === 'sql-runner' ? 'block h-full' : 'hidden'}>
                                <SqlRunner
                                    isVisible={activeTab === 'sql-runner'}
                                    tabs={sqlTabs}
                                    setTabs={setSqlTabs}
                                    activeTabId={activeSqlTabId}
                                    setActiveTabId={setActiveSqlTabId}
                                    savedQueries={savedSqlQueries}
                                    setSavedQueries={setSavedSqlQueries}
                                />
                            </div>
                            <div className={activeTab === 'csv-importer' ? 'block h-full' : 'hidden'}>
                                <CsvImporter isVisible={activeTab === 'csv-importer'} connectionName={connection?.connectionName || connection?.user || 'Desconhecido'} />
                            </div>
                            <div className={activeTab === 'reminders' ? 'block h-full' : 'hidden'}>
                                <Reminders isVisible={activeTab === 'reminders'} />
                            </div>
                        </div>
                    </div>
                </main>

            </div>
        </ThemeContext.Provider >
    );
}

export default App;
