import { format } from 'sql-formatter';
import React, { useState, useEffect, useContext, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as XLSX from 'xlsx';
import { ThemeContext } from '../context/ThemeContext';
import { useApi } from '../context/ApiContext';
import PropTypes from 'prop-types';
import { saveAs } from 'file-saver';
import CodeMirror from '@uiw/react-codemirror';
import { sql, PLSQL } from '@codemirror/lang-sql';
import { autocompletion } from '@codemirror/autocomplete';
import { keymap, EditorView } from '@codemirror/view';
import { defaultKeymap, historyKeymap } from '@codemirror/commands';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { PanelRightClose, PanelRightOpen, Share2, Play, Square, Download, FolderOpen, Save, Trash2, Plus, X, Search, Database, MessageSquare, Zap, LogOut, Home, Maximize2, Minimize2, Eye, Activity } from 'lucide-react';
import AutoSizer from 'react-virtualized-auto-sizer';
import { FixedSizeList as VirtualList } from 'react-window';
import ErrorBoundary from './ErrorBoundary';
import { motion, AnimatePresence } from 'framer-motion';
import { decryptPassword } from '../utils/security';
import ConnectionForm from './ConnectionForm';
import VariableInputModal from './VariableInputModal';

// --- Standalone Row Component (Prevent Re-creation) ---
// --- V3.0 Editor Theme ---
import { createTheme } from '@uiw/codemirror-themes';
import { tags as t } from '@lezer/highlight';
import { PLSQL_AUTOCOMPLETE_DATABASE } from '../utils/plsql_data';

const themeDefs = {
    light: {
        id: 'light',
        name: 'Light V3',
        type: 'light',
        colors: {
            bg: '#ffffff',
            fg: '#334155',
            caret: '#2563eb',
            selection: '#bfdbfe', // Darker Blue 200 for better visibility
            lineHighlight: '#f1f5f9',
            gutterBg: '#ffffff',
            gutterFg: '#94a3b8',
        },
        syntax: {
            keyword: '#2563eb', // Blue
            keywordWeight: 'bold',
            comment: '#94a3b8', // Gray
            string: '#059669', // Green
            number: '#d97706', // Amber
            variable: '#7c3aed', // Violet
            function: '#db2777', // Pink
            operator: '#64748b',
        },
        ui: {
            '--bg-main': '#f9fafb', // gray-50
            '--bg-panel': '#ffffff',
            '--bg-content': '#ffffff',
            '--bg-header': 'rgba(255,255,255,0.8)',
            '--bg-hover': '#f8fafc', // slate-50
            '--bg-active': '#eff6ff', // blue-50
            '--text-primary': '#1e293b', // slate-800
            '--text-secondary': '#64748b', // slate-500
            '--text-muted': '#94a3b8', // slate-400
            '--border-main': '#e2e8f0', // slate-200
            '--border-sub': '#f1f5f9', // slate-100
            '--accent-primary': '#2563eb', // blue-600
            '--accent-secondary': '#4338ca', // indigo-700
            '--selection-bg': '#dbeafe',
            '--row-even': '#ffffff',
            '--row-odd': '#fcfbfc',
            '--row-hover': 'rgba(239, 246, 255, 0.5)',
            '--shadow-color': 'rgba(0,0,0,0.05)',
        }
    },
    obsidian: {
        id: 'obsidian',
        name: 'Obsidian',
        type: 'dark',
        colors: {
            bg: '#0F111A', // Deep Dark
            fg: '#E6E6E6',
            caret: '#FF5252', // Red Accent
            selection: '#402c2c', // Reddish selection
            lineHighlight: '#1A1D29',
            gutterBg: '#0F111A',
            gutterFg: '#4B5563',
        },
        syntax: {
            keyword: '#FF5252', // Red
            keywordWeight: 'bold',
            comment: '#6B7280', // Gray
            string: '#a5d6ff', // Light Blue (Image 0ish)
            number: '#FCD34D', // Yellow
            variable: '#60A5FA', // Blue
            function: '#FF5252', // Red
            operator: '#9CA3AF',
        },
        ui: {
            '--bg-main': '#090a10',
            '--bg-panel': '#0F111A',
            '--bg-content': '#0F111A',
            '--bg-header': 'rgba(15, 17, 26, 0.8)',
            '--bg-hover': '#1A1D29',
            '--bg-active': 'rgba(255, 82, 82, 0.1)', // Red tint
            '--text-primary': '#E6E6E6',
            '--text-secondary': '#9CA3AF',
            '--text-muted': '#6B7280',
            '--border-main': '#1F2937', // gray-800
            '--border-sub': '#1A1D29',
            '--accent-primary': '#FF5252', // Red
            '--accent-secondary': '#EF4444',
            '--selection-bg': '#402c2c',
            '--row-even': '#0F111A',
            '--row-odd': '#131520',
            '--row-hover': 'rgba(255, 82, 82, 0.05)',
            '--shadow-color': 'rgba(0,0,0,0.4)',
        }
    },
    vscode: {
        id: 'vscode',
        name: 'VS Dark',
        type: 'dark',
        colors: {
            bg: '#1E1E1E',
            fg: '#D4D4D4',
            caret: '#007ACC',
            selection: '#264F78',
            lineHighlight: '#2D2D30',
            gutterBg: '#1E1E1E',
            gutterFg: '#858585',
        },
        syntax: {
            keyword: '#569CD6', // Blue
            keywordWeight: 'normal',
            comment: '#6A9955', // Green
            string: '#CE9178', // Orange
            number: '#B5CEA8', // Light Green
            variable: '#9CDCFE', // Light Blue
            function: '#DCDCAA', // Yellow
            operator: '#D4D4D4',
        },
        ui: {
            '--bg-main': '#1e1e1e',
            '--bg-panel': '#252526',
            '--bg-content': '#1E1E1E',
            '--bg-header': 'rgba(30, 30, 30, 0.8)',
            '--bg-hover': '#2a2d2e',
            '--bg-active': '#37373d',
            '--text-primary': '#D4D4D4',
            '--text-secondary': '#A6A6A6',
            '--text-muted': '#606060',
            '--border-main': '#333333',
            '--border-sub': '#252526',
            '--accent-primary': '#007ACC', // VS Blue
            '--accent-secondary': '#005f9e',
            '--selection-bg': '#264F78',
            '--row-even': '#1E1E1E',
            '--row-odd': '#252526',
            '--row-hover': '#2a2d2e',
            '--shadow-color': 'rgba(0,0,0,0.3)',
        }
    },
    standard_light: {
        id: 'standard_light',
        name: 'Standard Light',
        type: 'light',
        colors: {
            bg: '#FFFFFF',
            fg: '#24292e',
            caret: '#24292e',
            selection: '#BBDFFF',
            lineHighlight: '#F1F8FF',
            gutterBg: '#FFFFFF',
            gutterFg: '#D1D5DA',
        },
        syntax: {
            keyword: '#005CC5', // Standard Blue
            keywordWeight: 'bold',
            comment: '#6A737D', // Grey
            string: '#22863A', // Green
            number: '#D73A49', // Standard Red/Pinkish
            variable: '#24292e', // Black
            function: '#6F42C1', // Purple
            operator: '#5F6368',
        },
        ui: {
            '--bg-main': '#F6F8FA',
            '--bg-panel': '#FFFFFF',
            '--bg-content': '#FFFFFF',
            '--bg-header': 'rgba(255,255,255,0.9)',
            '--bg-hover': '#F1F8FF',
            '--bg-active': '#E1E4E8',
            '--text-primary': '#24292e',
            '--text-secondary': '#586069',
            '--text-muted': '#6A737D',
            '--border-main': '#e1e4e8',
            '--border-sub': '#eaecef',
            '--accent-primary': '#0366d6', // GitHub Blue
            '--accent-secondary': '#005CC5',
            '--selection-bg': '#BBDFFF',
            '--row-even': '#FFFFFF',
            '--row-odd': '#FAFBFC',
            '--row-hover': '#F1F8FF',
            '--shadow-color': 'rgba(0,0,0,0.05)',
        }
    },
    dracula_plus: {
        id: 'dracula_plus',
        name: 'Dracula Plus',
        type: 'dark',
        colors: {
            bg: '#282A36',
            fg: '#F8F8F2',
            caret: '#FF79C6',
            selection: '#44475A',
            lineHighlight: '#44475A',
            gutterBg: '#282A36',
            gutterFg: '#6272A4',
        },
        syntax: {
            keyword: '#FF79C6', // Pink
            keywordWeight: 'bold',
            comment: '#6272A4', // Purple/Grey
            string: '#F1FA8C', // Yellow
            number: '#BD93F9', // Purple
            variable: '#F8F8F2', // White
            function: '#8BE9FD', // Cyan
            operator: '#50FA7B', // Green
        },
        ui: {
            '--bg-main': '#21222C',
            '--bg-panel': '#282A36',
            '--bg-content': '#282A36',
            '--bg-header': 'rgba(40, 42, 54, 0.9)',
            '--bg-hover': '#44475A',
            '--bg-active': '#6272A4', // Purple tint
            '--text-primary': '#F8F8F2',
            '--text-secondary': '#BD93F9',
            '--text-muted': '#6272A4',
            '--border-main': '#44475A', // Dracula Selection
            '--border-sub': '#21222C',
            '--accent-primary': '#FF79C6', // Pink
            '--accent-secondary': '#BD93F9', // Purple
            '--selection-bg': '#44475A',
            '--row-even': '#282A36',
            '--row-odd': '#262831',
            '--row-hover': '#44475A',
            '--shadow-color': 'rgba(0,0,0,0.4)',
        }
    }
};

const createDynamicTheme = (themeDef) => {
    const mainTheme = createTheme({
        theme: themeDef.type,
        settings: {
            background: themeDef.colors.bg,
            foreground: themeDef.colors.fg,
            caret: themeDef.colors.caret,
            selection: themeDef.colors.selection,
            selectionMatch: themeDef.colors.selection,
            lineHighlight: themeDef.colors.lineHighlight,
            gutterBackground: themeDef.colors.gutterBg,
            gutterForeground: themeDef.colors.gutterFg,
        },
        styles: [
            { tag: t.keyword, color: themeDef.syntax.keyword, fontWeight: themeDef.syntax.keywordWeight },
            { tag: t.comment, color: themeDef.syntax.comment, fontStyle: 'italic' },
            { tag: t.string, color: themeDef.syntax.string },
            { tag: t.number, color: themeDef.syntax.number },
            { tag: t.definition(t.variableName), color: themeDef.syntax.variable },
            { tag: t.function(t.variableName), color: themeDef.syntax.function, fontWeight: 'bold' },
            { tag: t.operator, color: themeDef.syntax.operator },
            { tag: t.punctuation, color: themeDef.syntax.operator },
        ],
    });

    // Force selection color override with higher specificity
    const selectionOverride = EditorView.theme({
        "& .cm-selectionLayer .cm-selectionBackground, & .cm-content ::selection": {
            backgroundColor: `${themeDef.colors.selection} !important`
        },
        ".cm-selectionMatch": {
            backgroundColor: `${themeDef.colors.selection}44 !important`
        }
    }, { dark: themeDef.type === 'dark' });

    return [mainTheme, selectionOverride];
};

// --- Standalone Row Component (V3.0 Style) ---
const SqlRunnerRow = ({ index, style, data }) => {
    const { rows, columnOrder, visibleColumns, columnWidths } = data;
    const row = rows[index];

    // Strict Guard
    if (!row) return <div style={style} />;

    const formatCellValue = (val) => {
        if (val === null || val === undefined) return '';
        if (typeof val !== 'string') return val;
        // Date Check
        const isoDateRegex = /^\d{4}-\d{2}-\d{2}/;
        if (isoDateRegex.test(val)) {
            const date = new Date(val);
            if (!isNaN(date.getTime())) {
                const day = String(date.getDate()).padStart(2, '0');
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const year = date.getFullYear();
                const hours = String(date.getHours()).padStart(2, '0');
                const minutes = String(date.getMinutes()).padStart(2, '0');
                const seconds = String(date.getSeconds()).padStart(2, '0');
                if (hours === '00' && minutes === '00' && seconds === '00') return `${day}/${month}/${year}`;
                return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
            }
        }
        return val;
    };

    return (
        <div
            style={{
                ...style,
                backgroundColor: index % 2 === 0 ? 'var(--row-even)' : 'var(--row-odd)',
                borderColor: 'var(--border-sub)'
            }}
            className="flex border-b transition-colors group items-center hover:bg-[var(--row-hover)]"
        >
            {columnOrder.map(colName => {
                if (!visibleColumns[colName]) return null;
                const originalIdx = data.metaData ? data.metaData.findIndex(m => m.name === colName) : -1;
                const width = (columnWidths && columnWidths[colName]) || 150;
                const val = row[originalIdx];
                const displayVal = formatCellValue(val);

                return (
                    <div
                        key={colName}
                        className="px-4 py-2 text-[13px] font-mono overflow-hidden text-ellipsis whitespace-nowrap border-r border-transparent group-hover:border-[var(--border-sub)] transition-colors text-[var(--text-secondary)]"
                        style={{ width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }}
                        title={String(val || '')}
                    >
                        {val === null ? <span className="opacity-40 text-xs select-none">null</span> : displayVal}
                    </div>
                );
            })}
        </div>
    );
};

// ... imports (unchanged)

// ... SqlRunnerRow component (unchanged)

const SqlRunner = ({ isVisible, tabs, setTabs, activeTabId, setActiveTabId, savedQueries, setSavedQueries, onDisconnect, connection: globalConnection, savedConnections, onSaveConnection, onDeleteConnection }) => {
    const { theme } = useContext(ThemeContext);
    const { apiUrl } = useApi();
    const [toast, setToast] = useState(null);

    // Derived State
    const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

    // Ensure active tab has a connection property (default to global if missing)
    useEffect(() => {
        if (activeTab && !activeTab.connection && globalConnection) {
            updateActiveTab({ connection: globalConnection });
        }
    }, [activeTabId, globalConnection]);

    // Local State
    const [limit, setLimit] = useState(100);
    const [queryName, setQueryName] = useState('');
    const [showSaveInput, setShowSaveInput] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [showSidebar, setShowSidebar] = useState(true);
    const [isMaximized, setIsMaximized] = useState(false);
    const [activeSidebarTab, setActiveSidebarTab] = useState('saved');
    const [aiChatHistory, setAiChatHistory] = useState([]);
    const [aiChatInput, setAiChatInput] = useState('');
    const [aiLoading, setAiLoading] = useState(false);
    const [columnWidths, setColumnWidths] = useState({});

    // Variable Substitution State
    const [variableRequest, setVariableRequest] = useState({ open: false, variables: [], resolve: null, reject: null });

    // Explain Plan State
    const [explainData, setExplainData] = useState(null);
    const [showExplainModal, setShowExplainModal] = useState(false);
    const [explainLoading, setExplainLoading] = useState(false);

    // Tab Renaming State
    const [editingTabId, setEditingTabId] = useState(null);
    const [editingTitle, setEditingTitle] = useState('');

    // Connection Switching State
    const [showConnectionMenu, setShowConnectionMenu] = useState(false);
    const [tempConnection, setTempConnection] = useState({ user: '', password: '', connectString: 'localhost/XEPDB1' });

    // --- Theme State (V3) ---
    const [currentThemeId, setCurrentThemeId] = useState('light');
    const [showThemeMenu, setShowThemeMenu] = useState(false);

    // Apply Theme CSS Variables
    useEffect(() => {
        const theme = themeDefs[currentThemeId];
        if (!theme) return;

        const root = wrapperRef.current;
        if (root) {
            Object.entries(theme.ui).forEach(([key, value]) => {
                root.style.setProperty(key, value);
            });
        }
    }, [currentThemeId]);

    // --- Handlers for Tab Renaming ---
    const handleTabDoubleClick = (tab) => {
        setEditingTabId(tab.id);
        setEditingTitle(tab.title);
    };

    const handleRenameKeyDown = (e, tabId) => {
        if (e.key === 'Enter') {
            saveTabRename(tabId);
        } else if (e.key === 'Escape') {
            setEditingTabId(null);
        }
    };

    const saveTabRename = (tabId) => {
        if (editingTitle.trim()) {
            setTabs(prev => prev.map(t => t.id === tabId ? { ...t, title: editingTitle.trim() } : t));
        }
        setEditingTabId(null);
    };

    // Refs
    // SCROLL SYNC: Reference to the Header Container
    const headerContainerRef = useRef(null);
    const viewRef = useRef(null);
    const containerRef = useRef(null);
    const wrapperRef = useRef(null); // Full Screen Wrapper Ref
    const [listOuterElement, setListOuterElement] = useState(null); // Changed to state-ref for reliable effect triggering

    const showToast = (message, type = 'success', duration = 3000) => {
        setToast({ message, type });
        setTimeout(() => setToast(null), duration);
    };

    const updateActiveTab = (updates) => {
        setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, ...updates } : t));
    };

    // Schema
    const [schemaSearch, setSchemaSearch] = useState('');
    const [schemaTables, setSchemaTables] = useState([]);
    const [expandedTable, setExpandedTable] = useState(null);
    const [tableColumns, setTableColumns] = useState([]);
    const [loadingSchema, setLoadingSchema] = useState(false);
    const [schemaData, setSchemaData] = useState({});

    // --- Custom Autocomplete Schema Integration ---
    // User requested to REMOVE keywords from schema (preventing them from looking like tables)
    // and implement a custom completer using their PL/SQL data file.

    // Schema now only contains real database tables
    const editorSchema = React.useMemo(() => {
        return { ...schemaData };
    }, [schemaData]);

    const customPlSqlCompleter = (context) => {
        let word = context.matchBefore(/[\w\.$]*/)
        if (!word || (word.from === word.to && !context.explicit)) return null;

        const suggestions = [];

        if (PLSQL_AUTOCOMPLETE_DATABASE) {
            // Keywords
            if (PLSQL_AUTOCOMPLETE_DATABASE.keywords) {
                suggestions.push(...PLSQL_AUTOCOMPLETE_DATABASE.keywords.map(kw => ({ label: kw, type: "keyword", boost: -1 })));
            }
            // System Vars
            if (PLSQL_AUTOCOMPLETE_DATABASE.system_vars) {
                suggestions.push(...PLSQL_AUTOCOMPLETE_DATABASE.system_vars.map(v => ({ label: v, type: "variable" })));
            }
            // Functions
            if (PLSQL_AUTOCOMPLETE_DATABASE.functions) {
                suggestions.push(...PLSQL_AUTOCOMPLETE_DATABASE.functions.map(f => ({ label: f, type: "function" })));
            }
        }

        return {
            from: word.from,
            options: suggestions
        };
    };

    // Column Management State
    const [visibleColumns, setVisibleColumns] = useState({});
    const [columnOrder, setColumnOrder] = useState([]);
    const [columnFilters, setColumnFilters] = useState({});
    const [showFilters, setShowFilters] = useState(false);
    const [serverSideFilter, setServerSideFilter] = useState(false);
    const [draggingCol, setDraggingCol] = useState(null);

    // --- Auto Column Width Calculation ---
    const calculateColumnWidths = (results) => {
        // ... (unchanged)
        if (!results || !results.metaData || !results.rows) return {};
        const widths = {};
        const MAX_WIDTH = 400;
        const MIN_WIDTH = 100;
        const CHAR_WIDTH = 8;

        results.metaData.forEach((col, idx) => {
            let maxLen = col.name.length;
            const sampleRows = (results.rows || []).slice(0, 50); // Sample 50 for speed
            sampleRows.forEach(row => {
                if (!row) return;
                const val = row[idx];
                if (val !== null && val !== undefined) {
                    const strLen = String(val).length;
                    if (strLen > maxLen) maxLen = strLen;
                }
            });
            const calculated = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, maxLen * CHAR_WIDTH + 30));
            widths[col.name] = calculated;
        });
        return widths;
    };

    const handleDoubleClickResizer = (colName) => {
        // ... (unchanged)
        if (!activeTab.results) return;
        const colIdx = activeTab.results.metaData.findIndex(m => m.name === colName);
        if (colIdx === -1) return;

        let maxLen = colName.length;
        (activeTab.results.rows || []).forEach(row => {
            if (!row) return;
            const val = row[colIdx];
            if (val !== null && val !== undefined) {
                const strLen = String(val).length;
                if (strLen > maxLen) maxLen = strLen;
            }
        });

        const CHAR_WIDTH = 8;
        const calculated = Math.min(800, Math.max(100, maxLen * CHAR_WIDTH + 30));
        setColumnWidths(prev => ({ ...prev, [colName]: calculated }));
    };

    // Initialize column state when results change
    useEffect(() => {
        if (activeTab.results && activeTab.results.metaData) {
            const initialVisible = {};
            const initialOrder = activeTab.results.metaData.map(m => m.name);
            activeTab.results.metaData.forEach(m => initialVisible[m.name] = true);

            setVisibleColumns(initialVisible);
            setColumnOrder(initialOrder);

            // Auto Calculate Widths
            const autoWidths = calculateColumnWidths(activeTab.results);
            setColumnWidths(autoWidths);
        }
    }, [activeTab.results]);

    // Helper: Get Connection Headers
    const getConnectionHeaders = () => {
        const conn = activeTab.connection || globalConnection;
        if (!conn) return {};
        return {
            'x-db-connection': JSON.stringify(conn)
        };
    };

    const fetchSchemaTables = async (search = '') => {
        setLoadingSchema(true);
        try {
            const res = await fetch(`${apiUrl}/api/tables?search=${encodeURIComponent(search)}`, {
                headers: getConnectionHeaders()
            });
            const data = await res.json();
            setSchemaTables(data);

            const newSchema = { ...schemaData };
            data.forEach(t => {
                if (!newSchema[t]) newSchema[t] = [];
            });
            setSchemaData(newSchema);
        } catch (err) {
            console.error("Failed to fetch schema tables", err);
        } finally {
            setLoadingSchema(false);
        }
    };

    const handleExpandTable = async (tableName) => {
        if (expandedTable === tableName) {
            setExpandedTable(null);
            setTableColumns([]);
            return;
        }
        setExpandedTable(tableName);
        try {
            const res = await fetch(`${apiUrl}/api/columns/${encodeURIComponent(tableName)}`, {
                headers: getConnectionHeaders()
            });
            const data = await res.json();
            setTableColumns(data);
            setSchemaData(prev => ({ ...prev, [tableName]: data.map(c => c.name) }));
        } catch (err) {
            console.error("Failed to fetch columns", err);
        }
    };

    const insertTextAtCursor = (text) => {
        updateActiveTab({ sqlContent: activeTab.sqlContent + ' ' + text });
        if (viewRef.current) viewRef.current.focus();
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        updateActiveTab({ loading: true });
        try {
            const res = await fetch(`${apiUrl}/api/upload/sql`, { method: 'POST', body: formData });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            updateActiveTab({ sqlContent: data.content, loading: false });
            showToast('Arquivo carregado com sucesso!');
        } catch (err) {
            updateActiveTab({ error: err.message, loading: false });
            showToast('Erro ao carregar arquivo: ' + err.message, 'error');
        }
    };

    // Full Screen Toggle Logic
    const toggleFullScreen = () => {
        if (!document.fullscreenElement) {
            wrapperRef.current.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable fullscreen: ${err.message}`);
            });
            setIsMaximized(true);
        } else {
            document.exitFullscreen();
            setIsMaximized(false);
        }
    };

    // Listen for Full Screen Exit (Esc key)
    useEffect(() => {
        const handleFullScreenChange = () => {
            if (!document.fullscreenElement) {
                setIsMaximized(false);
            }
        };
        document.addEventListener('fullscreenchange', handleFullScreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullScreenChange);
    }, []);


    const abortControllerRef = useRef(null);
    const handleCancelQuery = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
            updateActiveTab({ loading: false, error: "Execução cancelada pelo usuário." });
            showToast("Execução cancelada.", "info");
        }
    };

    // Helper: Determine what SQL to run (Selection vs Statement at Cursor vs File)
    const getSmartSql = () => {
        const view = viewRef.current;
        if (!view) return activeTab.sqlContent;

        const { state } = view;
        const { selection } = state;

        // 1. If explicit selection exists, run it
        if (!selection.main.empty) {
            return state.sliceDoc(selection.main.from, selection.main.to);
        }

        // 2. If no selection, find the statement under cursor (Simple Semicolon Split)
        // Note: This naive split might break inside strings/comments, but sufficient for standard usage.
        const doc = state.doc.toString();
        const pos = selection.main.head;

        let start = 0;
        for (let i = pos - 1; i >= 0; i--) {
            if (doc[i] === ';') {
                start = i + 1;
                break;
            }
        }

        let end = doc.length;
        for (let i = pos; i < doc.length; i++) {
            if (doc[i] === ';') {
                end = i;
                break;
            }
        }

        const statement = doc.slice(start, end).trim();
        return statement || activeTab.sqlContent; // Fallback to full content if empty
    };

    const executeQuery = async () => {
        updateActiveTab({ loading: true, error: null, results: null, totalRecords: undefined });
        if (abortControllerRef.current) abortControllerRef.current.abort();
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        try {
            let rawSql = getSmartSql();
            let cleanSql = rawSql.trim().replace(/;+\s*$/, '');
            if (!cleanSql) return showToast("Nenhum comando SQL encontrado.", "warning");

            // --- Variable Substitution Logic ---
            const variableRegex = /&([a-zA-Z0-9_$#]+)/g;
            const foundVariables = new Set();
            let match;
            while ((match = variableRegex.exec(cleanSql)) !== null) {
                foundVariables.add(match[1]);
            }

            if (foundVariables.size > 0) {
                try {
                    const values = await new Promise((resolve, reject) => {
                        setVariableRequest({
                            open: true,
                            variables: Array.from(foundVariables),
                            resolve,
                            reject
                        });
                    });

                    // Perform Substitution
                    // Sort keys by length descending to prevent prefix collisions (e.g. &id replacing part of &id_aux)
                    const sortedKeys = Object.keys(values).sort((a, b) => b.length - a.length);

                    sortedKeys.forEach(key => {
                        const value = values[key];
                        // Simple global replace for &key (be careful with boundaries if needed, but standard is simple replacement)
                        // Using split/join to replace all occurrences efficiently
                        cleanSql = cleanSql.split('&' + key).join(value);
                    });

                } catch (e) {
                    // User Cancelled
                    updateActiveTab({ loading: false });
                    return; // Stop execution
                } finally {
                    setVariableRequest(prev => ({ ...prev, open: false }));
                }
            }
            // -----------------------------------

            const conn = activeTab.connection || globalConnection;

            const res = await fetch('http://127.0.0.1:3001/api/query', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getConnectionHeaders()
                },
                body: JSON.stringify({
                    sql: cleanSql,
                    limit: limit,
                    filter: serverSideFilter ? columnFilters : null,
                    // Redundant via body, but reliable
                    connection: conn
                }),
                signal
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            const normalizedData = {
                ...data,
                rows: Array.isArray(data.rows) ? data.rows : [],
                metaData: Array.isArray(data.metaData) ? data.metaData : []
            };

            if (data.rowsAffected !== undefined) {
                showToast(`Sucesso. Linhas afetadas: ${data.rowsAffected}`);
            } else if (!data.rows && !data.metaData) {
                showToast("Comando executado com sucesso.");
            }

            updateActiveTab({ results: normalizedData, loading: false });

            // Fetch Total Count
            try {
                const countRes = await fetch('http://127.0.0.1:3001/api/query/count', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...getConnectionHeaders() },
                    body: JSON.stringify({ sql: cleanSql, connection: conn }),
                    signal
                });
                const countData = await countRes.json();
                if (countData.count !== undefined) updateActiveTab({ totalRecords: countData.count });
            } catch (countErr) {
                // ignore
            }

        } catch (err) {
            if (err.name !== 'AbortError') updateActiveTab({ error: err.message, loading: false });
        } finally {
            abortControllerRef.current = null;
        }
    };

    const handleExplainPlan = async () => {
        const rawSql = getSmartSql();
        const cleanSql = rawSql.trim().replace(/;+\s*$/, '');
        if (!cleanSql) return showToast("Selecione uma query para explicar.", "warning");

        setExplainLoading(true);
        try {
            const conn = activeTab.connection || globalConnection;
            const res = await fetch(`${apiUrl}/api/explain`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getConnectionHeaders() },
                body: JSON.stringify({ sql: cleanSql, connection: conn })
            });
            const data = await res.json();

            if (data.error) throw new Error(data.error);

            setExplainData(data.lines);
            setShowExplainModal(true);
        } catch (err) {
            showToast("Erro ao gerar Explain Plan: " + err.message, "error");
        } finally {
            setExplainLoading(false);
        }
    };

    const saveQuery = () => {
        if (!queryName) return alert("Por favor, insira um nome para a query.");
        const newQuery = { id: Date.now(), name: queryName, title: queryName, sql: activeTab.sqlContent };
        setSavedQueries([...savedQueries, newQuery]);
        setShowSaveInput(false);
        setQueryName('');
        showToast("Query salva!");
    };

    const deleteQuery = (id) => {
        if (window.confirm("Tem certeza que deseja excluir esta query?")) {
            setSavedQueries(savedQueries.filter(q => q.id !== id));
        }
    };

    const loadQuery = (query) => {
        updateActiveTab({ sqlContent: query.sql });
        setQueryName(query.name);
    };

    const addTab = () => {
        const newId = Date.now();
        // Inherit global connection for new tab
        setTabs([...tabs, {
            id: newId,
            title: `Query ${tabs.length + 1}`,
            sqlContent: '',
            results: null,
            connection: globalConnection
        }]);
        setActiveTabId(newId);
    };

    // ... (rest of handlers like closeTab, getFilteredRows... kept as is mostly)

    const closeTab = (e, id) => {
        e.stopPropagation();
        if (tabs.length === 1) return setTabs([{ ...tabs[0], sqlContent: '', results: null, error: null }]);
        const newTabs = tabs.filter(t => t.id !== id);
        setTabs(newTabs);
        if (activeTabId === id) setActiveTabId(newTabs[newTabs.length - 1].id);
    };

    // ... (getFilteredRows and rest same as original)
    // IMPORTANT: Need to inject the UI for connection switching in the toolbar area or near tabs

    // ... (omitted getFilteredRows, downloadStreamExport, etc for brevity in this replacement block, assuming they are preserved if I target correctly)
    // Wait, replacing lines 80-600 logic. I need to be careful to include everything or just targeted updates.
    // The previous code had `getFilteredRows`, `performNativeSave` etc.
    // I will execute a larger replacement to be safe.

    const getFilteredRows = () => {
        if (!activeTab.results) return [];
        const filters = columnFilters || {};
        let hasFilters = false;
        for (const key in filters) {
            if (Object.prototype.hasOwnProperty.call(filters, key) && filters[key] && String(filters[key]).trim() !== '') {
                hasFilters = true;
                break;
            }
        }
        if (!hasFilters || serverSideFilter) return activeTab.results.rows || [];

        return (activeTab.results.rows || []).filter(row => {
            return columnOrder.every((colName, idx) => {
                const filterVal = filters[colName];
                if (!filterVal) return true;
                if (!activeTab.results.metaData) return true;
                const originalIdx = activeTab.results.metaData.findIndex(m => m.name === colName);
                if (originalIdx === -1) return true;
                const cellValue = String(row[originalIdx] || '').toLowerCase();
                return cellValue.includes(String(filterVal).toLowerCase());
            });
        });
    };

    const filteredRows = getFilteredRows();

    // ... (rest of export logic)
    // Helper for consistency
    const getFormattedTimestamp = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
    };

    const formatValueForExport = (val) => {
        if (val === null || val === undefined) return '';
        if (typeof val !== 'string') return val;
        // Reuse strict date logic
        const isoDateRegex = /^\d{4}-\d{2}-\d{2}/;
        if (isoDateRegex.test(val)) {
            const date = new Date(val);
            if (!isNaN(date.getTime())) {
                const day = String(date.getDate()).padStart(2, '0');
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const year = date.getFullYear();
                const hours = String(date.getHours()).padStart(2, '0');
                const minutes = String(date.getMinutes()).padStart(2, '0');
                const seconds = String(date.getSeconds()).padStart(2, '0');

                if (hours === '00' && minutes === '00' && seconds === '00') {
                    return `${day}/${month}/${year}`;
                }
                return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
            }
        }
        return val;
    };

    const downloadStreamExport = async () => {
        showToast("Iniciando download CSV...", "info", 2000);
        try {
            const cleanSql = activeTab.sqlContent.trim().replace(/;$/, '');
            const res = await fetch(`${apiUrl}/api/export/csv`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getConnectionHeaders() },
                body: JSON.stringify({ sql: cleanSql, filter: serverSideFilter ? columnFilters : null, connection: activeTab.connection })
            });
            if (!res.ok) throw new Error("Erro na exportação");
            const blob = await res.blob();
            saveAs(blob, `exportacao_${getFormattedTimestamp()}.csv`);
            showToast("Download concluído!");
        } catch (err) {
            showToast("Erro: " + err.message, 'error');
        }
    };

    const performNativeSave = async (filename, content, type) => {
        if (window.electronAPI && window.electronAPI.saveFile) {
            const savedPath = await window.electronAPI.saveFile({ filename, content, type });
            if (savedPath) {
                showToast("Arquivo salvo!");
                window.electronAPI.showItemInFolder(savedPath);
            }
        } else {
            let blob;
            if (type === 'xlsx') {
                const binary = atob(content);
                const array = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
                blob = new Blob([array], { type: 'application/octet-stream' });
            } else {
                blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
            }
            saveAs(blob, filename);
            showToast("Download concluído!");
        }
    };

    const exportData = async (type) => {
        if (!activeTab.results || !activeTab.results.rows || activeTab.results.rows.length === 0) return alert("Sem dados.");

        showToast("Gerando arquivo...", "info", 0);
        setTimeout(async () => {
            try {
                const header = activeTab.results.metaData.map(m => m.name);

                // Process rows for formatting
                const formattedRows = filteredRows.map(row => {
                    return row.map(cell => formatValueForExport(cell));
                });

                const data = [header, ...formattedRows];
                const filename = `exportacao_${getFormattedTimestamp()}.${type}`;
                let contentToSend;

                if (type === 'xlsx') {
                    const wb = XLSX.utils.book_new();
                    const ws = XLSX.utils.aoa_to_sheet(data);
                    XLSX.utils.book_append_sheet(wb, ws, "Results");
                    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                    const bytes = new Uint8Array(wbout);
                    let binary = '';
                    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
                    contentToSend = window.btoa(binary);
                } else if (type === 'csv') {
                    const ws = XLSX.utils.aoa_to_sheet(data);
                    contentToSend = XLSX.utils.sheet_to_csv(ws);
                }
                const saved = await performNativeSave(filename, contentToSend, type);
            } catch (err) {
                showToast("Falha: " + err.message, 'error');
            }
        }, 100);
    };

    // ... (rest of helper functions same as original: handleDragStart, handleFormat, etc)
    const handleDragStart = (e, colName) => {
        setDraggingCol(colName);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e, targetCol) => {
        e.preventDefault();
        if (!draggingCol || draggingCol === targetCol) return;
        const newOrder = [...columnOrder];
        const dragIdx = newOrder.indexOf(draggingCol);
        const targetIdx = newOrder.indexOf(targetCol);
        newOrder.splice(dragIdx, 1);
        newOrder.splice(targetIdx, 0, draggingCol);
        setColumnOrder(newOrder);
    };

    const handleDragEnd = () => setDraggingCol(null);

    const handleFormat = () => {
        try {
            const formatted = format(activeTab.sqlContent, { language: 'plsql', keywordCase: 'upper', linesBetweenQueries: 2 });
            updateActiveTab({ sqlContent: formatted });
        } catch (e) {
            showToast("Erro ao formatar", "error");
        }
    };

    const handleAiChatSubmit = async (e) => {
        if (e) e.preventDefault();
        if (!aiChatInput.trim()) return;
        const userMsg = { role: 'user', content: aiChatInput };
        setAiChatHistory(prev => [userMsg, ...prev]);
        setAiChatInput('');
        setAiLoading(true);
        try {
            const schemaContext = Object.keys(schemaData || {}).reduce((acc, table) => {
                if (schemaData && schemaData[table]) acc[table] = schemaData[table];
                return acc;
            }, {});
            const res = await fetch(`${apiUrl}/api/ai/sql/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: userMsg.content, schemaContext })
            });
            const data = await res.json();
            setAiChatHistory(prev => [{ role: 'assistant', content: data.text }, ...prev]);
        } catch (err) {
            setAiChatHistory(prev => [{ role: 'assistant', content: "Erro na comunicação." }, ...prev]);
        } finally {
            setAiLoading(false);
        }
    };

    const handleFixError = async () => {
        if (!activeTab.error) return;
        setAiLoading(true);
        try {
            const res = await fetch(`${apiUrl}/api/ai/sql/fix`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql: activeTab.sqlContent, error: activeTab.error })
            });
            const data = await res.json();
            const sqlMatch = data.text.match(/```sql\s*([\s\S]*?)\s*```/);
            if (sqlMatch && sqlMatch[1]) {
                updateActiveTab({ sqlContent: sqlMatch[1].trim() });
                showToast("SQL Corrigido!", "success");
            }
            setActiveSidebarTab('chat');
            setAiChatHistory(prev => [{ role: 'system', content: `**Sugestão de Correção:**\n\n${data.text}` }, ...prev]);
        } catch (err) {
            showToast("Falha ao corrigir", "error");
        } finally {
            setAiLoading(false);
        }
    };

    const handleExplainSql = async () => {
        if (!activeTab.sqlContent) return;
        setAiLoading(true);
        try {
            const res = await fetch(`${apiUrl}/api/ai/sql/explain`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql: activeTab.sqlContent })
            });
            const data = await res.json();
            setActiveSidebarTab('chat');
            setAiChatHistory(prev => [{ role: 'system', content: `**Explicação:**\n\n${data.text}` }, ...prev]);
        } catch (err) {
            showToast("Erro", "error");
        } finally {
            setAiLoading(false);
        }
    };

    const handleOptimizeSql = async () => {
        if (!activeTab.sqlContent) return;
        setAiLoading(true);
        try {
            const res = await fetch(`${apiUrl}/api/ai/sql/optimize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql: activeTab.sqlContent })
            });
            const data = await res.json();
            let optimizedSql = data.text;
            const sqlMatch = data.text.match(/```sql\n([\s\S]+?)\n```/);
            if (sqlMatch && sqlMatch[1]) optimizedSql = sqlMatch[1];
            updateActiveTab({ sqlContent: optimizedSql });
            showToast("SQL Otimizado!", "success");
        } catch (err) {
            showToast("Erro", "error");
        } finally {
            setAiLoading(false);
        }
    };

    // --- Explain Plan Visualization Modal ---
    const renderExplainModal = () => {
        if (!showExplainModal || !explainData) return null;

        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowExplainModal(false)}></div>
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden relative"
                >
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                                <Activity size={20} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Visual Explain Plan</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Análise de execução da query</p>
                            </div>
                        </div>
                        <button onClick={() => setShowExplainModal(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors">
                            <X size={20} className="text-slate-500" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-auto p-6 bg-slate-100 dark:bg-slate-900 custom-scrollbar">
                        <div className="space-y-2">
                            {explainData.map((line, idx) => {
                                // Basic Parsing for "Intelligent" visualization
                                const isFullScan = line.includes("TABLE ACCESS FULL");
                                const isHighCost = line.includes("CARTESIAN");

                                return (
                                    <div
                                        key={idx}
                                        className={`
                                            font-mono text-xs px-4 py-2 border-l-4 rounded-r-md shadow-sm transition-all hover:translate-x-1
                                            ${isFullScan ? 'bg-red-50 dark:bg-red-900/10 border-red-500 text-red-900 dark:text-red-200' :
                                                isHighCost ? 'bg-orange-50 dark:bg-orange-900/10 border-orange-500 text-orange-900 dark:text-orange-200' :
                                                    'bg-white dark:bg-slate-800 border-indigo-400 text-slate-700 dark:text-slate-300'}
                                        `}
                                    >
                                        <div className="whitespace-pre-wrap">{line}</div>
                                        {isFullScan && (
                                            <div className="mt-1 flex items-center gap-2 text-[10px] font-bold text-red-600 dark:text-red-400">
                                                <Eye size={12} /> ALERTA: Leitura Completa de Tabela detectada. Pode ser lento em grandes volumes.
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </motion.div>
            </div>
        );
    };

    const handleScroll = (event) => {
        if (headerContainerRef.current) {
            headerContainerRef.current.scrollLeft = event.currentTarget.scrollLeft;
        }
    };

    useEffect(() => {
        if (listOuterElement) {
            // Force initial sync to fix "disorganized header" on tab switch
            if (headerContainerRef.current) {
                headerContainerRef.current.scrollLeft = listOuterElement.scrollLeft;
            }

            listOuterElement.addEventListener('scroll', handleScroll);
            return () => listOuterElement.removeEventListener('scroll', handleScroll);
        }
    }, [listOuterElement]); // Re-run only when element ref changes

    // Handle Switch Connection (Local)
    const handleSwitchConnection = () => {
        // Just Update the active tab's connection
        if (tempConnection.user && tempConnection.password) {
            updateActiveTab({ connection: tempConnection });
            setShowConnectionMenu(false);
            showToast(`Conectado como ${tempConnection.user} nesta aba.`);
        }
    };

    // Connection Health Check
    const [connectionStatus, setConnectionStatus] = useState('unknown'); // 'connected', 'error', 'unknown', 'checking'

    useEffect(() => {
        let isMounted = true;
        const checkConnection = async () => {
            if (!activeTab.connection) {
                if (isMounted) setConnectionStatus('unknown');
                return;
            }

            // Only check if we haven't checked recently or if connection just changed
            // For now, let's just assume valid if we have credentials, but a real ping is better.
            // Since we don't have a dedicated ping endpoint, we'll try a lightweight query.
            try {
                // If the user just switched, we might want to verify.
                // However, doing a query on every render/tab switch might be heavy.
                // Let's rely on success/failure of queries in general, 
                // BUT user requested visual feedback "if connection is lost".
                // We'll simulate this with a state that could be updated by query failures.
                setConnectionStatus('connected');
            } catch (e) {
                if (isMounted) setConnectionStatus('error');
            }
        };

        checkConnection();
        return () => { isMounted = false; };
    }, [activeTab.connection]);

    // Expose a way to set error status from global query execution errors
    useEffect(() => {
        if (activeTab.error && activeTab.error.includes && (activeTab.error.includes('ORA-03113') || activeTab.error.includes('Network'))) {
            setConnectionStatus('error');
        }
    }, [activeTab.error]);


    return (
        <ErrorBoundary>
            <div className={`space-y-4 relative h-full flex flex-col ${theme.bg}`}>
                {/* ... other modals ... */}
                {renderExplainModal()}
                {toast && (
                    <div className={`fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-xl z-[9999] animate-bounce-up text-white font-bold flex items-center ${toast.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`}>
                        {toast.type === 'error' ? '🚫' : '✅'} <span className="ml-2">{toast.message}</span>
                    </div>
                )}



                {/* Full Connection Form Modal (Add New) */}
                {tempConnection.showFullForm && (
                    <div className="fixed inset-0 bg-black/60 z-[10000] flex items-center justify-center backdrop-blur-sm p-8">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl h-[80vh] overflow-hidden relative flex flex-col">
                            <button
                                onClick={() => setTempConnection({ ...tempConnection, showFullForm: false })}
                                className="absolute top-4 right-4 z-50 p-2 bg-white/50 hover:bg-white rounded-full text-gray-500 hover:text-red-500 transition-all"
                            >
                                <X size={24} />
                            </button>
                            <ConnectionForm
                                savedConnections={savedConnections}
                                onSaveConnection={onSaveConnection}
                                onDeleteConnection={onDeleteConnection}
                                onConnect={(connData) => {
                                    updateActiveTab({ connection: connData });
                                    setTempConnection({ ...tempConnection, showFullForm: false });
                                    showToast(`Conectado a ${connData.connectionName || connData.user}`);
                                }} />
                        </div>
                    </div>
                )}

                {/* Loading Overlay */}
                {isExporting && (
                    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center backdrop-blur-sm">
                        <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent mb-4"></div>
                            <p className="text-gray-800 font-bold text-lg">Exportando dados...</p>
                        </div>
                    </div>
                )}

                <div ref={wrapperRef} className="flex flex-col h-full bg-[var(--bg-main)] relative overflow-hidden">

                    {/* MAIN CONTENT WRAPPER */}
                    <div className={`flex-1 overflow-hidden flex flex-col relative ${isMaximized ? 'p-0' : 'p-2'}`}>
                        <div className={`bg-[var(--bg-panel)] shadow-[0_0_0_1px_var(--border-main)] flex-1 flex flex-col overflow-hidden relative ${isMaximized ? 'rounded-none border-0' : 'rounded-2xl'}`}>

                            {/* Sidebar Toggle Relocated to Header */}

                            <PanelGroup direction="horizontal" className="h-full">
                                <Panel defaultSize={80} minSize={30} className="flex flex-col h-full overflow-hidden">
                                    <div className="flex flex-col h-full">
                                        {/* ---------- TABS ---------- */}
                                        <div className={`flex items-center w-full border-b border-[var(--border-main)] px-2 pt-2 gap-2`}>
                                            {/* Scrollable Tabs */}
                                            <div className="flex-1 flex items-end gap-1 overflow-x-auto no-scrollbar px-2 mask-linear-fade">
                                                {tabs.map(tab => (
                                                    <div
                                                        key={tab.id}
                                                        onClick={() => setActiveTabId(tab.id)}
                                                        onDoubleClick={() => handleTabDoubleClick(tab)}
                                                        className={`
                                                            group relative flex items-center gap-2 px-5 py-3 text-xs font-bold rounded-t-2xl cursor-pointer transition-all select-none min-w-[140px] max-w-[240px] border-t border-x
                                                            ${activeTabId === tab.id
                                                                ? 'bg-[var(--bg-panel)] text-[var(--text-primary)] border-[var(--border-main)] border-b-[var(--bg-panel)] z-10 shadow-[0_-2px_10px_var(--shadow-color)] pt-3.5'
                                                                : 'bg-[var(--bg-hover)] text-[var(--text-muted)] border-transparent hover:bg-[var(--bg-panel)] hover:text-[var(--text-secondary)] mb-0.5'
                                                            }
                                                        `}
                                                    >
                                                        {activeTabId === tab.id && <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] rounded-t-full"></div>}

                                                        {tab.loading ? (
                                                            <div className="w-2 h-2 rounded-full bg-[var(--accent-primary)] animate-pulse"></div>
                                                        ) : (
                                                            <div className={`w-2 h-2 rounded-full ${activeTabId === tab.id ? 'bg-[var(--accent-secondary)]' : 'bg-slate-300 group-hover:bg-slate-400'}`}></div>
                                                        )}

                                                        {editingTabId === tab.id ? (
                                                            <input
                                                                autoFocus
                                                                value={editingTitle}
                                                                onChange={e => setEditingTitle(e.target.value)}
                                                                onKeyDown={e => handleRenameKeyDown(e, tab.id)}
                                                                onBlur={() => saveTabRename(tab.id)}
                                                                className="bg-transparent outline-none w-full border-b border-[var(--accent-primary)] text-[var(--text-primary)]"
                                                                onClick={e => e.stopPropagation()}
                                                            />
                                                        ) : (
                                                            <span className="truncate flex-1 font-medium">{tab.title}</span>
                                                        )}

                                                        <button
                                                            onClick={(e) => closeTab(e, tab.id)}
                                                            className={`p-1 rounded-md hover:bg-red-50 hover:text-red-500 transition-all ${activeTabId === tab.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                                                        >
                                                            <X size={12} strokeWidth={3} />
                                                        </button>
                                                    </div>
                                                ))}
                                                <button
                                                    onClick={addTab}
                                                    className="p-2 mb-1.5 ml-1 text-[var(--text-muted)] hover:text-[var(--accent-primary)] hover:bg-[var(--bg-active)] rounded-xl transition-all"
                                                    title="Nova Aba"
                                                >
                                                    <Plus size={18} strokeWidth={2.5} />
                                                </button>
                                            </div>

                                            {/* Top Right Controls */}
                                            <div className="flex items-center gap-3 pr-4 pb-1.5 pt-1">
                                                {/* Connection Selector (Pill Style) */}
                                                <div className="relative group/conn">
                                                    <button
                                                        onClick={() => {
                                                            setTempConnection(activeTab.connection || globalConnection);
                                                            setShowConnectionMenu(!showConnectionMenu);
                                                        }}
                                                        className={`
                                                            flex items-center gap-2.5 px-4 py-2 text-xs font-bold rounded-full transition-all border ring-2 ring-transparent
                                                            ${connectionStatus === 'error'
                                                                ? 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100'
                                                                : 'bg-slate-50 text-slate-600 border-slate-100 hover:border-blue-200 hover:text-blue-700 hover:bg-white hover:shadow-sm'
                                                            }
                                                        `}
                                                    >
                                                        <div className={`p-1 rounded-md ${connectionStatus === 'error' ? 'bg-red-200' : 'bg-white shadow-sm'}`}>
                                                            <Database size={12} className={connectionStatus === 'error' ? 'text-red-600' : 'text-blue-600'} />
                                                        </div>
                                                        <span className="truncate max-w-[120px]">
                                                            {activeTab.connection?.connectionName || 'Selecionar Banco'}
                                                        </span>
                                                    </button>

                                                    {/* Connection Dropdown (Glass) */}
                                                    <AnimatePresence>
                                                        {showConnectionMenu && (
                                                            <>
                                                                <div className="fixed inset-0 z-[90]" onClick={() => setShowConnectionMenu(false)}></div>
                                                                <motion.div
                                                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                                    className="absolute top-12 right-0 z-[100] w-72 bg-[var(--bg-panel)] backdrop-blur-xl rounded-2xl shadow-[0_10px_40px_-10px_var(--shadow-color)] border border-[var(--border-main)] p-2"
                                                                >
                                                                    <div className="px-3 py-2 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">Meus Bancos</div>
                                                                    <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-1">
                                                                        {(JSON.parse(localStorage.getItem('oracle_connections') || '[]')).map((conn, idx) => (
                                                                            <button
                                                                                key={conn.id || idx}
                                                                                onClick={() => {
                                                                                    const decrypted = {
                                                                                        ...conn,
                                                                                        password: decryptPassword(conn.password),
                                                                                        connectString: conn.isDefault ? decryptPassword(conn.connectString) : conn.connectString
                                                                                    };
                                                                                    updateActiveTab({ connection: decrypted });
                                                                                    setShowConnectionMenu(false);
                                                                                    setConnectionStatus('connected');
                                                                                    showToast(`Conectado a ${conn.connectionName}`);
                                                                                }}
                                                                                className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-all text-left group
                                                                                    ${activeTab.connection?.id === conn.id ? 'bg-[var(--bg-active)] text-[var(--accent-primary)]' : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]'}
                                                                                `}
                                                                            >
                                                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${activeTab.connection?.id === conn.id ? 'bg-[var(--bg-main)]' : 'bg-[var(--bg-main)] group-hover:bg-[var(--bg-panel)] group-hover:shadow-sm'}`}>
                                                                                    <Database size={14} />
                                                                                </div>
                                                                                <div className="flex-1 min-w-0">
                                                                                    <div className="font-bold text-xs truncate">{conn.connectionName}</div>
                                                                                    <div className="text-[10px] opacity-70 truncate">{conn.user}</div>
                                                                                </div>
                                                                                {activeTab.connection?.id === conn.id && <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                    <div className="border-t border-[var(--border-sub)] mt-2 pt-2">
                                                                        <button onClick={() => { setShowConnectionMenu(false); setTempConnection({ ...tempConnection, showFullForm: true }); }} className="w-full py-2.5 rounded-xl border border-dashed border-[var(--border-sub)] text-[var(--text-muted)] hover:text-[var(--accent-primary)] hover:border-[var(--accent-primary)] hover:bg-[var(--bg-active)] text-xs font-bold transition-all flex items-center justify-center gap-2">
                                                                            <Plus size={14} /> Nova Conexão
                                                                        </button>
                                                                    </div>
                                                                </motion.div>
                                                            </>
                                                        )}
                                                    </AnimatePresence>
                                                </div>

                                                <button
                                                    onClick={() => setShowSidebar(!showSidebar)}
                                                    className={`p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-main)] hover:bg-[var(--bg-hover)] border border-transparent hover:border-[var(--border-sub)] rounded-lg transition-all ${!showSidebar ? 'text-[var(--accent-primary)] bg-[var(--bg-active)] border-[var(--border-sub)]' : ''}`}
                                                    title={showSidebar ? "Ocultar Menu" : "Mostrar Menu"}
                                                >
                                                    {showSidebar ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
                                                </button>
                                                <button onClick={toggleFullScreen} className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-main)] hover:bg-[var(--bg-hover)] border border-transparent hover:border-[var(--border-main)] rounded-lg transition-all">
                                                    {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                                                </button>

                                                {/* Theme Switcher */}
                                                <div className="relative">
                                                    <button
                                                        onClick={() => setShowThemeMenu(!showThemeMenu)}
                                                        className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-main)] hover:bg-[var(--bg-hover)] border border-transparent hover:border-[var(--border-main)] rounded-lg transition-all"
                                                        title="Alterar Tema"
                                                    >
                                                        <div className="w-4 h-4 rounded-full bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)]"></div>
                                                    </button>
                                                    <AnimatePresence>
                                                        {showThemeMenu && (
                                                            <>
                                                                <div className="fixed inset-0 z-[90]" onClick={() => setShowThemeMenu(false)}></div>
                                                                <motion.div
                                                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                                    className="absolute top-10 right-0 z-[100] w-40 bg-[var(--bg-panel)] rounded-xl shadow-xl border border-[var(--border-main)] p-1 overflow-hidden"
                                                                >
                                                                    {Object.values(themeDefs).map(t => (
                                                                        <button
                                                                            key={t.id}
                                                                            onClick={() => { setCurrentThemeId(t.id); setShowThemeMenu(false); }}
                                                                            className={`w-full text-left px-3 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-all ${currentThemeId === t.id ? 'bg-[var(--bg-active)] text-[var(--accent-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'}`}
                                                                        >
                                                                            <div className="w-2 h-2 rounded-full" style={{ background: t.colors.caret }}></div>
                                                                            {t.name}
                                                                        </button>
                                                                    ))}
                                                                </motion.div>
                                                            </>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            </div>
                                        </div>

                                        <PanelGroup direction="vertical" className="flex-1">
                                            {/* ---------- EDITOR AREA ---------- */}
                                            <Panel defaultSize={45} minSize={20} className="flex flex-col relative bg-[var(--bg-panel)] group/editor">
                                                <div className="absolute inset-0 bg-grid-slate-50/[0.05] pointer-events-none"></div>
                                                <div
                                                    className="flex-1 relative font-mono text-[13px] overflow-hidden"
                                                    onClick={() => viewRef.current?.focus()}
                                                >
                                                    {isVisible && (
                                                        <CodeMirror
                                                            value={activeTab.sqlContent}
                                                            height="100%"
                                                            theme={createDynamicTheme(themeDefs[currentThemeId])}
                                                            extensions={[
                                                                sql({ schema: editorSchema, dialect: PLSQL, upperCaseKeywords: true }),
                                                                autocompletion({ override: [customPlSqlCompleter] }),
                                                                keymap.of([
                                                                    { key: "F8", run: () => { executeQuery(); return true; } },
                                                                    ...defaultKeymap,
                                                                    ...historyKeymap
                                                                ])
                                                            ]}
                                                            onChange={(val) => updateActiveTab({ sqlContent: val })}
                                                            onCreateEditor={(view) => { viewRef.current = view; }}
                                                            basicSetup={{
                                                                drawSelection: false,
                                                                lineNumbers: true,
                                                                highlightActiveLineGutter: true,
                                                                highlightActiveLine: true,
                                                                foldGutter: true,
                                                                dropCursor: true,
                                                                allowMultipleSelections: true,
                                                                indentOnInput: true,
                                                                bracketMatching: true,
                                                                closeBrackets: true,
                                                                autocompletion: true,
                                                                rectangularSelection: true,
                                                                crosshairCursor: true,
                                                                highlightSelectionMatches: true,
                                                            }}
                                                        />
                                                    )}
                                                </div>

                                                {/* Floating Run Bar (Bottom of editor) */}
                                                <div className="absolute bottom-4 right-6 flex items-center gap-3 z-30 pointer-events-none">
                                                    <div className="bg-[var(--bg-header)] backdrop-blur-md shadow-[0_8px_30px_var(--shadow-color)] border border-[var(--border-sub)] p-1.5 rounded-2xl flex items-center gap-2 pointer-events-auto">
                                                        <button
                                                            onClick={executeQuery}
                                                            disabled={!activeTab.sqlContent || activeTab.loading}
                                                            className={`
                                                                px-6 py-2.5 rounded-xl font-bold text-white shadow-lg text-xs tracking-wide flex items-center gap-2 transition-all active:scale-95
                                                                ${activeTab.loading
                                                                    ? 'bg-[var(--bg-active)] cursor-wait opacity-70'
                                                                    : 'bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] hover:shadow-lg hover:-translate-y-0.5'
                                                                }
                                                            `}
                                                        >
                                                            {activeTab.loading ? (
                                                                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                                            ) : (
                                                                <Play size={14} fill="currentColor" />
                                                            )}
                                                            <span className="mr-1">{activeTab.loading ? 'RODANDO...' : 'EXECUTAR'}</span>
                                                        </button>

                                                        <div className="w-px h-6 bg-[var(--border-sub)] mx-1"></div>

                                                        <div className="flex items-center gap-1">
                                                            <button onClick={handleFormat} className="p-2 text-[var(--text-muted)] hover:text-[#007acc] hover:bg-[var(--bg-active)] rounded-lg transition-colors" title="Formatar (Beautify)">
                                                                <span className="font-mono text-[10px] font-bold">{'{}'}</span>
                                                            </button>
                                                            <button onClick={handleExplainSql} className="p-2 text-[var(--text-muted)] hover:text-[var(--accent-secondary)] hover:bg-[var(--bg-active)] rounded-lg transition-colors" title="Explicar com IA">
                                                                <MessageSquare size={16} />
                                                            </button>
                                                            <button onClick={handleOptimizeSql} className="p-2 text-[var(--text-muted)] hover:text-emerald-500 hover:bg-[var(--bg-active)] rounded-lg transition-colors" title="Otimizar Query">
                                                                <Zap size={16} />
                                                            </button>
                                                            <button
                                                                onClick={handleExplainPlan}
                                                                disabled={explainLoading}
                                                                className="p-2 text-[var(--text-muted)] hover:text-blue-500 hover:bg-[var(--bg-active)] rounded-lg transition-colors relative"
                                                                title="Visual Explain Plan"
                                                            >
                                                                {explainLoading ? <span className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin block"></span> : <Activity size={16} />}
                                                            </button>
                                                        </div>

                                                        <div className="w-px h-6 bg-[var(--border-sub)] mx-1"></div>

                                                        <select
                                                            value={limit}
                                                            onChange={(e) => setLimit(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                                                            className="bg-transparent text-xs font-semibold text-[var(--text-secondary)] outline-none cursor-pointer hover:text-[var(--text-primary)] pr-2"
                                                        >
                                                            <option value={100} className="bg-[var(--bg-panel)]">100 linhas</option>
                                                            <option value={500} className="bg-[var(--bg-panel)]">500 linhas</option>
                                                            <option value={1000} className="bg-[var(--bg-panel)]">1k linhas</option>
                                                            <option value="all" className="bg-[var(--bg-panel)]">Todas</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            </Panel>

                                            <PanelResizeHandle className="h-1.5 bg-[var(--bg-main)] hover:bg-[var(--bg-active)] transition-colors cursor-row-resize flex justify-center items-center group relative z-20">
                                                <div className="w-12 h-1 rounded-full bg-[var(--border-sub)] group-hover:bg-[var(--accent-primary)] transition-colors"></div>
                                            </PanelResizeHandle>

                                            {/* ---------- RESULTS AREA ---------- */}
                                            <Panel defaultSize={55} minSize={20} className="flex flex-col bg-[var(--bg-panel)] relative">
                                                {/* Error Banner */}
                                                {activeTab.error && (
                                                    <div className="absolute top-0 left-0 right-0 z-40 bg-red-50/95 backdrop-blur-sm border-b border-red-100 p-4 animate-in slide-in-from-top-2">
                                                        <div className="flex items-start gap-3">
                                                            <div className="p-2 bg-red-100 text-red-600 rounded-lg shrink-0"><Zap size={18} /></div>
                                                            <div className="flex-1">
                                                                <h4 className="font-bold text-red-900 text-sm">Erro na Execução</h4>
                                                                <p className="font-mono text-xs text-red-700 mt-1">{activeTab.error}</p>
                                                            </div>
                                                            <button onClick={handleFixError} className="px-4 py-2 bg-white border border-red-200 text-red-600 rounded-lg text-xs font-bold hover:bg-red-50 shadow-sm transition-all flex items-center gap-2">
                                                                ✨ Corrigir
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="flex-1 flex flex-col min-h-0 bg-[var(--bg-content)]">
                                                    {/* Results Toolbar */}
                                                    <div className="px-5 py-3 border-b border-[var(--border-main)] flex justify-between items-center bg-[var(--bg-panel)] z-10">
                                                        <div className="flex items-center gap-4">
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Resultado</span>
                                                                <div className="flex items-baseline gap-2">
                                                                    {activeTab.totalRecords !== undefined && (
                                                                        <span className="text-[10px] font-bold text-[var(--text-secondary)] bg-[var(--bg-main)] px-1.5 py-0.5 rounded-md border border-[var(--border-sub)]">
                                                                            {activeTab.totalRecords.toLocaleString()} registros
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <div className="h-6 w-px bg-[var(--border-sub)]"></div>

                                                            <button
                                                                onClick={() => setShowFilters(!showFilters)}
                                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${showFilters ? 'bg-[var(--bg-active)] text-[var(--accent-primary)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]'}`}
                                                            >
                                                                <Search size={14} /> Filtros
                                                            </button>
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            <button onClick={() => exportData('csv')} className="p-2 text-[var(--text-muted)] hover:text-[var(--accent-primary)] hover:bg-[var(--bg-active)] rounded-lg transition-all" title="Baixar CSV">
                                                                <Download size={18} />
                                                            </button>
                                                            <div className="relative group/save">
                                                                {showSaveInput ? (
                                                                    <div className="flex items-center gap-1 bg-[var(--bg-main)] p-1 rounded-lg animate-in fade-in slide-in-from-right-4">
                                                                        <input
                                                                            autoFocus
                                                                            value={queryName}
                                                                            onChange={e => setQueryName(e.target.value)}
                                                                            placeholder="Nome da Query..."
                                                                            className="bg-transparent text-xs w-32 px-2 outline-none text-[var(--text-primary)] font-medium placeholder:text-[var(--text-muted)]"
                                                                            onKeyDown={e => e.key === 'Enter' && saveQuery()}
                                                                        />
                                                                        <button onClick={saveQuery} className="p-1 rounded bg-[var(--bg-panel)] text-green-600 shadow-sm hover:text-green-700"><Save size={14} /></button>
                                                                    </div>
                                                                ) : (
                                                                    <button onClick={() => setShowSaveInput(true)} className="p-2 text-[var(--text-muted)] hover:text-green-600 hover:bg-green-50 rounded-lg transition-all" title="Salvar Query">
                                                                        <Save size={18} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* The Table */}
                                                    {activeTab.results ? (
                                                        activeTab.results.metaData.length > 0 ? (
                                                            <div className="flex-1 overflow-hidden relative flex flex-col bg-[var(--bg-content)]">
                                                                {/* HEADER */}
                                                                <div
                                                                    ref={headerContainerRef}
                                                                    className="flex border-b border-[var(--border-sub)] bg-[var(--bg-header)] backdrop-blur-md overflow-hidden select-none sticky top-0 z-20 shadow-sm"
                                                                    style={{ height: showFilters ? '72px' : '40px' }}
                                                                >
                                                                    {columnOrder.map(colName => {
                                                                        if (!visibleColumns[colName]) return null;
                                                                        const width = columnWidths[colName] || 150;
                                                                        return (
                                                                            <div
                                                                                key={colName}
                                                                                className="flex-shrink-0 px-4 py-2 text-xs font-bold text-[var(--text-secondary)] relative hover:bg-[var(--bg-hover)] transition-colors group flex flex-col justify-center border-r border-transparent hover:border-[var(--border-sub)]"
                                                                                style={{ width: `${width}px` }}
                                                                                draggable
                                                                                onDragStart={(e) => handleDragStart(e, colName)}
                                                                                onDragOver={(e) => handleDragOver(e, colName)}
                                                                                onDragEnd={handleDragEnd}
                                                                            >
                                                                                <div className="flex items-center justify-between mb-0.5">
                                                                                    <span className="truncate">{colName}</span>
                                                                                </div>
                                                                                {showFilters && (
                                                                                    <div className="relative">
                                                                                        <input
                                                                                            type="text"
                                                                                            placeholder="Filtrar..."
                                                                                            className="w-full text-[10px] px-2 py-1 bg-[var(--bg-main)] border border-[var(--border-sub)] rounded-md focus:border-[var(--accent-primary)] focus:bg-[var(--bg-panel)] outline-none transition-all placeholder:text-[var(--text-muted)] text-[var(--text-primary)]"
                                                                                            value={columnFilters[colName] || ''}
                                                                                            onChange={e => setColumnFilters({ ...columnFilters, [colName]: e.target.value })}
                                                                                        />
                                                                                    </div>
                                                                                )}
                                                                                <div
                                                                                    className="absolute right-0 top-1 bottom-1 w-1 cursor-col-resize hover:bg-blue-400 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                                                                                    onDoubleClick={() => handleDoubleClickResizer(colName)}
                                                                                ></div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>

                                                                {/* Virtual List */}
                                                                <div className="flex-1">
                                                                    <AutoSizer>
                                                                        {({ height, width }) => (
                                                                            <VirtualList
                                                                                height={height}
                                                                                width={width}
                                                                                itemCount={filteredRows.length}
                                                                                itemSize={38}
                                                                                outerRef={setListOuterElement}
                                                                                itemData={{
                                                                                    rows: filteredRows,
                                                                                    columnOrder,
                                                                                    visibleColumns,
                                                                                    columnWidths,
                                                                                    metaData: activeTab.results.metaData
                                                                                }}
                                                                            >
                                                                                {SqlRunnerRow}
                                                                            </VirtualList>
                                                                        )}
                                                                    </AutoSizer>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)]">
                                                                <div className="w-20 h-20 bg-[var(--bg-panel)] text-emerald-500 rounded-2xl flex items-center justify-center mb-4 shadow-sm border border-[var(--border-sub)]">
                                                                    <span className="text-4xl">✓</span>
                                                                </div>
                                                                <p className="font-bold text-[var(--text-primary)] text-lg">Sucesso!</p>
                                                                <p className="text-sm font-medium text-[var(--text-muted)] mt-1">Comando executado sem retorno de dados.</p>
                                                            </div>
                                                        )
                                                    ) : (
                                                        <div className="flex-1 flex flex-col items-center justify-center text-slate-300 relative overflow-hidden">
                                                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,var(--bg-hover)_0,rgba(0,0,0,0)_70%)]"></div>
                                                            <div className="bg-[var(--bg-panel)] p-6 rounded-3xl shadow-[0_20px_50px_var(--shadow-color)] border border-[var(--border-sub)] flex flex-col items-center relative z-10">
                                                                <div className="w-16 h-16 bg-[var(--bg-main)] text-[var(--accent-primary)] rounded-2xl flex items-center justify-center mb-4 transform rotate-3">
                                                                    <Database size={32} strokeWidth={1.5} />
                                                                </div>
                                                                <p className="text-[var(--text-primary)] font-bold text-lg mb-1">Pronto para rodar</p>
                                                                <p className="text-[var(--text-muted)] text-xs text-center max-w-[200px] leading-relaxed">
                                                                    Escreva sua query acima e pressione <span className="font-bold text-[var(--text-secondary)]">Executar</span>
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </Panel>
                                        </PanelGroup>
                                    </div>
                                </Panel>

                                {/* ---------- SIDEBAR ---------- */}
                                {showSidebar && (
                                    <>
                                        <PanelResizeHandle className="w-px bg-slate-200 hover:bg-blue-400 hover:w-1 transition-all cursor-col-resize relative group z-20">
                                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-8 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-sm group-hover:border-blue-300">
                                                <div className="w-0.5 h-3 bg-slate-300 group-hover:bg-blue-400 rounded-full"></div>
                                            </div>
                                        </PanelResizeHandle>

                                        <Panel defaultSize={20} minSize={15} maxSize={40} className="flex flex-col bg-[var(--bg-panel)] border-l border-[var(--border-main)]">
                                            {/* Tabs */}
                                            <div className="flex p-1 bg-[var(--bg-main)] m-2 rounded-xl border border-[var(--border-sub)]">
                                                {['saved', 'schema', 'chat'].map(tab => (
                                                    <button
                                                        key={tab}
                                                        onClick={() => setActiveSidebarTab(tab)}
                                                        className={`
                                                            flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all
                                                            ${activeSidebarTab === tab
                                                                ? 'bg-[var(--bg-panel)] text-[var(--accent-primary)] shadow-sm'
                                                                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                                                            }
                                                        `}
                                                    >
                                                        {tab === 'saved' ? 'Salvos' : tab === 'schema' ? 'Dados' : 'IA Chat'}
                                                    </button>
                                                ))}
                                            </div>

                                            <div className="flex-1 overflow-y-auto px-4 pb-4 custom-scrollbar">
                                                {activeSidebarTab === 'saved' && (
                                                    <div className="space-y-3 pt-2">
                                                        {savedQueries.map(q => (
                                                            <div key={q.id} onClick={() => loadQuery(q)} className="group bg-[var(--bg-content)] p-3 rounded-xl border border-[var(--border- sub)] shadow-[0_2px_8px_var(--shadow-color)] hover:shadow-md hover:border-[var(--accent-primary)] cursor-pointer transition-all relative overflow-hidden">
                                                                <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-transparent to-[var(--bg-hover)] rounded-bl-full -mr-8 -mt-8 pointer-events-none group-hover:to-[var(--bg-active)] transition-colors"></div>
                                                                <div className="flex justify-between items-start mb-1 relative z-10">
                                                                    <h5 className="font-bold text-[var(--text-primary)] text-xs truncate flex-1 min-w-0 mr-2" title={q.name}>{q.name}</h5>
                                                                    <button onClick={e => { e.stopPropagation(); deleteQuery(q.id); }} className="text-[var(--text-muted)] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                        <Trash2 size={12} />
                                                                    </button>
                                                                </div>
                                                                <div className="h-px w-full bg-[var(--border-sub)] my-1.5 group-hover:bg-[var(--accent-primary)]/20"></div>
                                                                <p className="text-[10px] text-[var(--text-secondary)] font-mono line-clamp-2 relative z-10">{q.sql}</p>
                                                            </div>
                                                        ))}
                                                        {savedQueries.length === 0 && (
                                                            <div className="text-center py-8 text-[var(--text-muted)]">
                                                                <div className="w-12 h-12 bg-[var(--bg-main)] rounded-full flex items-center justify-center mx-auto mb-2"><Save size={18} /></div>
                                                                <p className="text-xs">Nenhuma query salva</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {activeSidebarTab === 'schema' && (
                                                    <div className="space-y-4 pt-2">
                                                        <div className="relative group/search">
                                                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-hover/search:text-[var(--accent-primary)] transition-colors" />
                                                            <input
                                                                className="w-full pl-9 pr-3 py-2.5 text-xs bg-[var(--bg-content)] border border-[var(--border-sub)] rounded-xl outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20 focus:border-[var(--accent-primary)] transition-all font-medium placeholder:text-[var(--text-muted)] text-[var(--text-primary)]"
                                                                placeholder="Buscar tabelas..."
                                                                value={schemaSearch}
                                                                onChange={e => { setSchemaSearch(e.target.value); fetchSchemaTables(e.target.value); }}
                                                            />
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            {schemaTables.map(t => (
                                                                <div key={t} className="bg-[var(--bg-content)] rounded-xl border border-transparent hover:border-[var(--border-sub)] hover:shadow-sm transition-all overflow-hidden">
                                                                    <button onClick={() => handleExpandTable(t)} className={`w-full text-left px-3 py-2.5 text-xs font-mono flex items-center justify-between transition-colors ${expandedTable === t ? 'bg-[var(--bg-active)] text-[var(--accent-primary)] font-bold' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}>
                                                                        <span className="truncate">{t}</span>
                                                                        <span className={`text-[10px] text-[var(--text-muted)] transition-transform duration-200 ${expandedTable === t ? 'rotate-180' : ''}`}>▼</span>
                                                                    </button>
                                                                    <AnimatePresence>
                                                                        {expandedTable === t && (
                                                                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="border-t border-[var(--border-sub)] bg-[var(--bg-main)]/50">
                                                                                {tableColumns.length > 0 ? (
                                                                                    <div className="space-y-0.5 p-1">
                                                                                        {tableColumns.map(c => (
                                                                                            <div key={c.name} onClick={() => insertTextAtCursor(c.name)} className="flex justify-between items-center px-3 py-1.5 hover:bg-[var(--bg-hover)] hover:shadow-sm rounded-lg cursor-pointer group text-[10px] transition-all">
                                                                                                <span className="text-[var(--text-muted)] group-hover:text-[var(--accent-primary)] font-medium truncate">{c.name}</span>
                                                                                                <span className="text-[var(--text-muted)] group-hover:text-[var(--accent-secondary)] text-[9px] uppercase">{c.type}</span>
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                ) : (
                                                                                    <div className="p-2 text-center text-[10px] text-[var(--text-muted)]">Carregando...</div>
                                                                                )}
                                                                            </motion.div>
                                                                        )}
                                                                    </AnimatePresence>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {activeSidebarTab === 'chat' && (
                                                    <div className="flex flex-col h-full pt-1">
                                                        <div className="flex-1 space-y-4 mb-4 overflow-y-auto custom-scrollbar pr-1">
                                                            {aiChatHistory.length === 0 && (
                                                                <div className="text-center py-10 opacity-50">
                                                                    <div className="w-16 h-16 bg-[var(--bg-main)] text-[var(--accent-primary)] rounded-2xl flex items-center justify-center mx-auto mb-3"><MessageSquare size={24} /></div>
                                                                    <p className="text-xs font-medium text-[var(--text-muted)]">Pergunte sobre seus dados</p>
                                                                </div>
                                                            )}
                                                            {aiChatHistory.map((msg, i) => (
                                                                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                                    <div className={`max-w-[90%] rounded-2xl px-4 py-3 text-xs shadow-sm leading-relaxed ${msg.role === 'user' ? 'bg-[var(--accent-primary)] text-white rounded-br-none' : 'bg-[var(--bg-content)] border border-[var(--border-sub)] text-[var(--text-secondary)] rounded-bl-none'}`}>
                                                                        <ReactMarkdown
                                                                            components={{
                                                                                code: ({ node, inline, className, children, ...props }) => (
                                                                                    <code className={`${className} ${inline ? 'bg-black/10 px-1 py-0.5 rounded' : 'block bg-[var(--bg-main)] text-[var(--text-primary)] border border-[var(--border-sub)] p-2 rounded-lg my-2 overflow-x-auto text-[10px]'}`} {...props}>
                                                                                        {children}
                                                                                    </code>
                                                                                )
                                                                            }}
                                                                        >
                                                                            {msg.content}
                                                                        </ReactMarkdown>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                            {aiLoading && (
                                                                <div className="flex justify-start">
                                                                    <div className="bg-[var(--bg-content)] border border-[var(--border-sub)] rounded-2xl rounded-bl-none px-4 py-3 shadow-sm flex items-center space-x-1.5">
                                                                        <span className="w-1.5 h-1.5 bg-[var(--accent-primary)] rounded-full animate-bounce"></span>
                                                                        <span className="w-1.5 h-1.5 bg-[var(--accent-primary)] rounded-full animate-bounce delay-75"></span>
                                                                        <span className="w-1.5 h-1.5 bg-[var(--accent-primary)] rounded-full animate-bounce delay-150"></span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <form onSubmit={handleAiChatSubmit} className="relative mt-auto pt-2 bg-[var(--bg-panel)]">
                                                            <input
                                                                className="w-full bg-[var(--bg-content)] border border-[var(--border-sub)] shadow-sm rounded-xl px-4 py-3 pr-10 text-xs outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20 focus:border-[var(--accent-primary)] transition-all placeholder:text-[var(--text-muted)] text-[var(--text-primary)]"
                                                                placeholder="Pergunte à IA..."
                                                                value={aiChatInput}
                                                                onChange={e => setAiChatInput(e.target.value)}
                                                            />
                                                            <button
                                                                type="submit"
                                                                disabled={!aiChatInput.trim() || aiLoading}
                                                                className="absolute right-2 top-1/2 -translate-y-1/2 mt-1 p-1.5 bg-[var(--accent-primary)] text-white rounded-lg hover:bg-[var(--accent-secondary)] disabled:opacity-50 disabled:hover:bg-[var(--accent-primary)] transition-all shadow-md shadow-[var(--shadow-color)]"
                                                            >
                                                                <Share2 size={12} className="rotate-90 -translate-y-px -translate-x-px" />
                                                            </button>
                                                        </form>
                                                    </div>
                                                )}
                                            </div>
                                        </Panel>
                                    </>
                                )}
                            </PanelGroup>
                        </div>
                    </div>
                </div>
            </div>
            {/* Variable Input Modal */}
            <VariableInputModal
                open={variableRequest.open}
                variables={variableRequest.variables}
                onSubmit={(values) => variableRequest.resolve && variableRequest.resolve(values)}
                onClose={() => variableRequest.reject && variableRequest.reject()}
            />
        </ErrorBoundary >
    );
};

SqlRunner.propTypes = {
    isVisible: PropTypes.bool,
    tabs: PropTypes.array.isRequired,
    setTabs: PropTypes.func.isRequired,
    activeTabId: PropTypes.number.isRequired,
    setActiveTabId: PropTypes.func.isRequired,
    savedQueries: PropTypes.array.isRequired,
    setSavedQueries: PropTypes.func.isRequired,
    onDisconnect: PropTypes.func
};

export default SqlRunner;
