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
        bg: 'bg-gray-100',
        sidebar: 'bg-white',
        sidebarText: 'text-gray-700',
        text: 'text-gray-700',
        headerText: 'text-gray-700',
        primaryBtn: 'bg-blue-600 hover:bg-blue-700 text-white hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200',
        secondaryBtn: 'bg-gray-100 hover:bg-gray-200 text-gray-600 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200',
        accent: 'text-blue-600',
        header: 'bg-white border-b',
        tableHeader: 'bg-gray-50 text-gray-500',
        tableRowHover: 'hover:bg-blue-50',
        border: 'border-gray-200',
        input: 'bg-white text-gray-900',
        panel: 'bg-white'
    },
    dark: {
        name: 'Modo Escuro',
        bg: 'bg-gray-900',
        sidebar: 'bg-gray-800',
        sidebarText: 'text-gray-200',
        text: 'text-gray-200',
        headerText: 'text-gray-200',
        primaryBtn: 'bg-indigo-600 hover:bg-indigo-700 text-white hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200',
        secondaryBtn: 'bg-gray-700 hover:bg-gray-600 text-gray-200 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200',
        accent: 'text-indigo-400',
        header: 'bg-gray-800 border-gray-700 border-b',
        tableHeader: 'bg-gray-700 text-gray-300',
        tableRowHover: 'hover:bg-gray-700',
        border: 'border-gray-700',
        input: 'bg-gray-700 text-white border-gray-600',
        panel: 'bg-gray-800'
    },
    ubuntu: {
        name: 'Ubuntu',
        bg: 'bg-[#fdf6e3]', // Solarized light-ish
        sidebar: 'bg-[#300a24]', // Ubuntu purple
        sidebarText: 'text-white',
        text: 'text-[#300a24]',
        headerText: 'text-white',
        primaryBtn: 'bg-[#e95420] hover:bg-[#c7461b] text-white hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200',
        secondaryBtn: 'bg-[#aea79f] hover:bg-[#9e968d] text-white hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200',
        accent: 'text-[#e95420]',
        header: 'bg-[#300a24] border-b border-[#5e2750]',
        tableHeader: 'bg-[#aea79f] text-white',
        tableRowHover: 'hover:bg-[#f2d7d0]',
        border: 'border-[#aea79f]',
        input: 'bg-white text-[#300a24]',
        panel: 'bg-white'
    },
    forest: {
        name: 'Floresta',
        bg: 'bg-stone-100',
        sidebar: 'bg-[#1c2e1f]',
        sidebarText: 'text-stone-200',
        text: 'text-[#1c2e1f]',
        headerText: 'text-[#1c2e1f]',
        primaryBtn: 'bg-[#2d4a33] hover:bg-[#3a5e42] text-white hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200',
        secondaryBtn: 'bg-stone-200 hover:bg-stone-300 text-stone-700 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200',
        accent: 'text-[#2d4a33]',
        header: 'bg-white border-stone-200 border-b',
        tableHeader: 'bg-stone-100 text-stone-600',
        tableRowHover: 'hover:bg-[#e8f5e9]',
        border: 'border-stone-200',
        input: 'bg-white text-stone-800',
        panel: 'bg-[#fdfbf7]'
    },
    ocean: {
        name: 'Oceano',
        bg: 'bg-cyan-50',
        sidebar: 'bg-white',
        sidebarText: 'text-slate-700',
        text: 'text-slate-700',
        headerText: 'text-slate-700',
        primaryBtn: 'bg-cyan-600 hover:bg-cyan-700 text-white hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200',
        secondaryBtn: 'bg-cyan-100 hover:bg-cyan-200 text-cyan-800 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200',
        accent: 'text-cyan-600',
        header: 'bg-white border-cyan-100 border-b',
        tableHeader: 'bg-cyan-50 text-cyan-700',
        tableRowHover: 'hover:bg-cyan-50',
        border: 'border-cyan-200',
        input: 'bg-white text-slate-700',
        panel: 'bg-white'
    },
    dracula: {
        name: 'Dracula',
        bg: 'bg-[#282a36]',
        sidebar: 'bg-[#44475a]',
        sidebarText: 'text-[#f8f8f2]',
        text: 'text-[#f8f8f2]',
        headerText: 'text-[#f8f8f2]',
        primaryBtn: 'bg-[#bd93f9] hover:bg-[#ff79c6] text-[#282a36] font-bold hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200',
        secondaryBtn: 'bg-[#6272a4] hover:bg-[#50fa7b] text-white hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200',
        accent: 'text-[#ff79c6]',
        header: 'bg-[#44475a] border-[#6272a4] border-b',
        tableHeader: 'bg-[#44475a] text-[#8be9fd]',
        tableRowHover: 'hover:bg-[#44475a]',
        border: 'border-[#6272a4]',
        input: 'bg-[#282a36] text-[#f8f8f2] border-[#6272a4]',
        panel: 'bg-[#282a36]'
    },
    military: {
        name: 'Militar',
        bg: 'bg-[#f5f5f5]',
        sidebar: 'bg-[#3e2723]', // Dark Wood
        sidebarText: 'text-[#efebe9]',
        text: 'text-[#3e2723]',
        headerText: 'text-[#3e2723]',
        primaryBtn: 'bg-[#558b2f] hover:bg-[#33691e] text-white hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200',
        secondaryBtn: 'bg-[#795548] hover:bg-[#5d4037] text-white hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200',
        accent: 'text-[#33691e]',
        header: 'bg-white border-[#3e2723] border-b',
        tableHeader: 'bg-[#d7ccc8] text-[#3e2723]',
        tableRowHover: 'hover:bg-[#e8f5e9]',
        border: 'border-[#8d6e63]',
        input: 'bg-white text-gray-900 border-[#8d6e63]',
        panel: 'bg-[#fafafa]'
    }
};

function App() {
    const [connection, setConnection] = useState(null);
    const [activeTab, setActiveTab] = useState('query-builder');
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

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

    if (!connection) {
        return <ConnectionForm onConnect={handleConnect} />;
    }

    return (
        <ThemeContext.Provider value={{ theme, currentThemeName, changeTheme }}>
            <div className={`flex h-screen ${theme.bg} font-sans overflow-hidden transition-colors duration-300`}>
                {/* Sidebar */}
                <div className={`${isSidebarOpen ? 'w-64' : 'w-0'} ${theme.sidebar} shadow-lg flex flex-col z-20 transition-all duration-300 overflow-hidden relative border-r ${theme.border}`}>
                    <div className={`p-6 flex flex-col items-center border-b ${theme.border} min-w-[16rem] bg-white`}>
                        <img src={hapLogo} alt="Hap Query Report" className="w-full h-auto max-h-32 object-contain mb-3 transition-transform hover:scale-105" />
                        <h1 className={`text-lg font-bold tracking-tight text-center leading-tight text-gray-800`}>
                            Hap Query Report <span className="text-xs font-normal text-gray-500 block">v1.1.32</span>
                        </h1>
                    </div>

                    <nav className="flex-1 py-6 space-y-1 px-3 overflow-y-auto min-w-[16rem]">
                        <button
                            onClick={() => {
                                window.electronAPI?.resetFocus();
                                window.focus();
                                if (document.activeElement) document.activeElement.blur();
                                setActiveTab('query-builder');
                            }}
                            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 group ${activeTab === 'query-builder'
                                ? `${theme.primaryBtn} shadow-sm`
                                : `${theme.sidebarText} hover:bg-opacity-10 hover:bg-black`
                                }`}
                        >
                            <span className="mr-3 text-lg">📊</span>
                            Construtor de Consultas
                        </button>
                        <button
                            onClick={() => {
                                window.electronAPI?.resetFocus();
                                window.focus();
                                if (document.activeElement) document.activeElement.blur();
                                setActiveTab('sql-runner');
                            }}
                            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 group ${activeTab === 'sql-runner'
                                ? `${theme.primaryBtn} shadow-sm`
                                : `${theme.sidebarText} hover:bg-opacity-10 hover:bg-black`
                                }`}
                        >
                            <span className="mr-3 text-lg">💻</span>
                            Editor SQL
                        </button>
                        <button
                            onClick={() => {
                                window.electronAPI?.resetFocus();
                                window.focus();
                                if (document.activeElement) document.activeElement.blur();
                                setActiveTab('csv-importer');
                            }}
                            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 group ${activeTab === 'csv-importer'
                                ? `${theme.primaryBtn} shadow-sm`
                                : `${theme.sidebarText} hover:bg-opacity-10 hover:bg-black`
                                }`}
                        >
                            <span className="mr-3 text-lg">📂</span>
                            Importar CSV
                        </button>
                        <button
                            onClick={() => {
                                window.electronAPI?.resetFocus();
                                window.focus();
                                if (document.activeElement) document.activeElement.blur();
                                setActiveTab('reminders');
                            }}
                            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 group ${activeTab === 'reminders'
                                ? `${theme.primaryBtn} shadow-sm`
                                : `${theme.sidebarText} hover:bg-opacity-10 hover:bg-black`
                                }`}
                        >
                            <span className="mr-3 text-lg">🔔</span>
                            Lembretes
                        </button>

                        {/* Theme Switcher in Sidebar */}
                        <div className="mt-6 px-1">
                            <label className={`block text-xs font-bold uppercase mb-2 ${theme.sidebarText} opacity-70`}>Tema</label>
                            <select
                                value={currentThemeName}
                                onChange={(e) => changeTheme(e.target.value)}
                                className={`w-full text-xs p-2 rounded border outline-none ${theme.input} ${theme.border}`}
                            >
                                {Object.entries(THEMES).map(([key, val]) => (
                                    <option key={key} value={key}>{val.name}</option>
                                ))}
                            </select>
                        </div>
                    </nav>

                    <div className={`p-4 border-t ${theme.border} min-w-[16rem]`}>
                        <div className="flex items-center mb-3 px-2">
                            <div className="w-8 h-8 rounded-full bg-[#f37021] flex items-center justify-center text-white font-bold text-xs shadow-sm">
                                {connection.user.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="ml-3 overflow-hidden">
                                <p className={`text-sm font-medium truncate ${theme.sidebarText}`}>{connection.user}</p>
                                <p className={`text-xs truncate opacity-70 ${theme.sidebarText}`}>{connection.connectString}</p>
                            </div>
                        </div>
                        <button
                            onClick={handleDisconnect}
                            className={`w-full flex items-center justify-center px-4 py-2 border shadow-sm text-sm font-medium rounded-md transition-colors duration-200 ${theme.secondaryBtn} ${theme.border}`}
                        >
                            Desconectar
                        </button>
                        <div className="mt-4 text-center">
                            <p className="text-[10px] text-gray-400">Desenvolvido por:</p>
                            <p className="text-xs font-semibold text-gray-500">Jefferson Oliveira</p>
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 overflow-hidden relative flex flex-col">
                    {/* Toggle Button */}
                    <div className={`${theme.header} p-2 flex items-center shadow-sm z-10`}>
                        <button
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            className={`p-2 rounded-md hover:bg-opacity-10 hover:bg-black focus:outline-none ${theme.sidebarText}`}
                            title={isSidebarOpen ? "Recolher Menu" : "Expandir Menu"}
                        >
                            {isSidebarOpen ? '◀️' : '▶️'}
                        </button>
                        {!isSidebarOpen && (
                            <div className="ml-4 flex items-center">
                                <img src={hapLogo} alt="Logo" className="h-8 object-contain mr-2" />
                                <span className={`font-bold ${theme.accent}`}>Hap Query Report <span className="text-xs font-normal text-gray-500 ml-1">v1.1.32</span></span>
                            </div>
                        )}
                    </div>

                    <main className="flex-1 overflow-auto p-2 sm:p-6 transition-all duration-300 relative">
                        <div className="max-w-7xl mx-auto h-full flex flex-col relative">
                            <div style={{
                                display: activeTab === 'query-builder' ? 'block' : 'none',
                                width: '100%', height: '100%'
                            }}>
                                <QueryBuilder isVisible={activeTab === 'query-builder'} />
                            </div>
                            <div style={{
                                display: activeTab === 'sql-runner' ? 'block' : 'none',
                                width: '100%', height: '100%'
                            }}>
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
                            <div style={{
                                display: activeTab === 'csv-importer' ? 'block' : 'none',
                                width: '100%', height: '100%'
                            }}>
                                <CsvImporter isVisible={activeTab === 'csv-importer'} />
                            </div>
                            <div style={{
                                display: activeTab === 'reminders' ? 'block' : 'none',
                                width: '100%', height: '100%'
                            }}>
                                <Reminders isVisible={activeTab === 'reminders'} />
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        </ThemeContext.Provider>
    );
}

export default App;
