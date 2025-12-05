import React, { useState, useEffect, useContext, useRef } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { ThemeContext } from '../context/ThemeContext';
import CodeMirror from '@uiw/react-codemirror';
import { sql, PLSQL } from '@codemirror/lang-sql';
import { autocompletion } from '@codemirror/autocomplete';
import PropTypes from 'prop-types';

// Custom AutoSizer to avoid build issues with the library
const AutoSizer = ({ children }) => {
    const ref = useRef(null);
    const [size, setSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
        if (!ref.current) return;
        const observer = new ResizeObserver(entries => {
            for (let entry of entries) {
                // Use contentRect for precise dimensions
                const { width, height } = entry.contentRect;
                setSize({ width, height });
            }
        });
        observer.observe(ref.current);
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={ref} style={{ width: '100%', height: '100%' }}>
            {size.width > 0 && size.height > 0 && children(size)}
        </div>
    );
};

AutoSizer.propTypes = {
    children: PropTypes.func.isRequired
};

// Custom VirtualList to replace react-window
const VirtualList = ({ height, width, itemCount, itemSize, minWidth, header, headerHeight = 40, children }) => {
    const [scrollTop, setScrollTop] = useState(0);
    const containerRef = useRef(null);

    const handleScroll = (e) => {
        setScrollTop(e.target.scrollTop);
    };

    const totalHeight = itemCount * itemSize;
    const overscan = 5; // Render extra items to prevent flickering

    // Adjust start/end index calculations to account for header height
    const effectiveScrollTop = Math.max(0, scrollTop - headerHeight);

    const startIndex = Math.max(0, Math.floor(effectiveScrollTop / itemSize) - overscan);
    const endIndex = Math.min(
        itemCount - 1,
        Math.floor((effectiveScrollTop + height) / itemSize) + overscan
    );

    const items = [];
    for (let i = startIndex; i <= endIndex; i++) {
        items.push(
            children({
                index: i,
                style: {
                    position: 'absolute',
                    top: i * itemSize + headerHeight, // Offset by header height
                    left: 0,
                    width: '100%',
                    height: itemSize,
                },
            })
        );
    }

    return (
        <div
            ref={containerRef}
            onScroll={handleScroll}
            style={{ height, width, overflow: 'auto', position: 'relative', willChange: 'transform' }}
        >
            <div style={{ height: totalHeight + headerHeight, position: 'relative', width: '100%', minWidth: minWidth || '100%' }}>
                {/* Sticky Header */}
                <div style={{ position: 'sticky', top: 0, zIndex: 10, height: headerHeight, width: '100%' }}>
                    {header}
                </div>
                {items}
            </div>
        </div>
    );
};

VirtualList.propTypes = {
    height: PropTypes.number.isRequired,
    width: PropTypes.number.isRequired,
    itemCount: PropTypes.number.isRequired,
    itemSize: PropTypes.number.isRequired,
    minWidth: PropTypes.number,
    header: PropTypes.node,
    headerHeight: PropTypes.number,
    children: PropTypes.func.isRequired
};

function SqlRunner({ isVisible, tabs, setTabs, activeTabId, setActiveTabId, savedQueries, setSavedQueries }) {
    const { theme } = useContext(ThemeContext);

    // Internal state for things that don't need to persist across unmounts
    const viewRef = useRef(null);
    const containerRef = useRef(null);
    const [toast, setToast] = useState(null);
    const toastTimeoutRef = useRef(null);

    // Focus Strategy: Robust focus handling
    useEffect(() => {
        const focusEditor = () => {
            if (viewRef.current) {
                viewRef.current.focus();
            }
        };

        // 1. Focus on mount with a small delay
        const timer = setTimeout(() => {
            focusEditor();
        }, 100);

        // 2. Focus when window regains focus (fixes the "alt-tab" issue)
        const handleWindowFocus = () => {
            focusEditor();
        };
        window.addEventListener('focus', handleWindowFocus);

        return () => {
            clearTimeout(timer);
            window.removeEventListener('focus', handleWindowFocus);
        };
    }, []); // Run once on mount

    // 3. Focus when component becomes visible (fixes tab switching issue)
    useEffect(() => {
        if (isVisible) {
            // Try to focus multiple times to ensure it catches
            const timers = [
                setTimeout(() => viewRef.current?.focus(), 50),
                setTimeout(() => viewRef.current?.focus(), 200),
                setTimeout(() => viewRef.current?.focus(), 500)
            ];
            return () => timers.forEach(t => clearTimeout(t));
        }
    }, [isVisible]);



    // --- Column Resizing State ---
    const [columnWidths, setColumnWidths] = useState({});
    const resizingRef = useRef(null);

    const startResizing = (e, colName) => {
        e.preventDefault();
        e.stopPropagation();
        resizingRef.current = {
            colName,
            startX: e.clientX,
            startWidth: columnWidths[colName] || 150
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e) => {
        if (!resizingRef.current) return;
        const { colName, startX, startWidth } = resizingRef.current;
        const diff = e.clientX - startX;
        const newWidth = Math.max(50, startWidth + diff); // Min width 50px
        setColumnWidths(prev => ({ ...prev, [colName]: newWidth }));
    };

    const handleMouseUp = () => {
        resizingRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };

    // Toast Helper
    const showToast = (message, type = 'success', duration = 3000) => {
        if (toastTimeoutRef.current) {
            clearTimeout(toastTimeoutRef.current);
            toastTimeoutRef.current = null;
        }
        setToast({ message, type });
        if (duration > 0) {
            toastTimeoutRef.current = setTimeout(() => {
                setToast(null);
                toastTimeoutRef.current = null;
            }, duration);
        }
    };

    // Helper to get active tab
    const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

    // Helper to update active tab
    const updateActiveTab = (updates) => {
        setTabs(prevTabs => prevTabs.map(t => t.id === activeTabId ? { ...t, ...updates } : t));
    };

    const [isExporting, setIsExporting] = useState(false);
    const [limit, setLimit] = useState(1000);
    const [queryName, setQueryName] = useState('');
    const [showSaveInput, setShowSaveInput] = useState(false);
    const [showSidebar, setShowSidebar] = useState(true);
    const [activeSidebarTab, setActiveSidebarTab] = useState('saved'); // 'saved' or 'schema'

    // Schema Browser State
    const [schemaSearch, setSchemaSearch] = useState('');
    const [schemaTables, setSchemaTables] = useState([]);
    const [expandedTable, setExpandedTable] = useState(null);
    const [tableColumns, setTableColumns] = useState([]);
    const [loadingSchema, setLoadingSchema] = useState(false);
    const [schemaData, setSchemaData] = useState({}); // For autocomplete

    // Column Management State
    const [visibleColumns, setVisibleColumns] = useState({});
    const [columnOrder, setColumnOrder] = useState([]);
    const [columnFilters, setColumnFilters] = useState({});
    const [showColumnMenu, setShowColumnMenu] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [serverSideFilter, setServerSideFilter] = useState(false);
    const [draggingCol, setDraggingCol] = useState(null);

    // Initialize column state when results change
    useEffect(() => {
        if (activeTab.results && activeTab.results.metaData) {
            const initialVisible = {};
            const initialOrder = activeTab.results.metaData.map(m => m.name);
            activeTab.results.metaData.forEach(m => initialVisible[m.name] = true);

            setVisibleColumns(initialVisible);
            setColumnOrder(initialOrder);
            setColumnFilters({});
        }
    }, [activeTab.results]);

    const fetchSchemaTables = async (search = '') => {
        setLoadingSchema(true);
        try {
            const res = await fetch(`http://localhost:3001/api/tables?search=${encodeURIComponent(search)}`);
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
            const res = await fetch(`http://localhost:3001/api/columns/${encodeURIComponent(tableName)}`);
            const data = await res.json();
            setTableColumns(data);

            setSchemaData(prev => ({
                ...prev,
                [tableName]: data.map(c => c.name)
            }));
        } catch (err) {
            console.error("Failed to fetch columns", err);
        }
    };

    const insertTextAtCursor = (text) => {
        updateActiveTab({ sqlContent: activeTab.sqlContent + ' ' + text });
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        updateActiveTab({ loading: true });
        try {
            const res = await fetch('http://localhost:3001/api/upload/sql', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            updateActiveTab({ sqlContent: data.sql, loading: false });
            setQueryName(file.name.replace(/\.sql$/i, ''));
        } catch (err) {
            updateActiveTab({ error: err.message, loading: false });
        }
    };

    const executeQuery = async () => {
        // Clear previous results to indicate new execution
        updateActiveTab({ loading: true, error: null, results: null, totalRecords: undefined });
        try {
            const cleanSql = activeTab.sqlContent.trim().replace(/;+\s*$/, '');

            // 1. Execute Main Query
            const res = await fetch('http://127.0.0.1:3001/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sql: cleanSql,
                    limit: limit,
                    filter: serverSideFilter ? columnFilters : null
                })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            // 2. Show Results IMMEDIATELY
            // Fix for DDL (DROP/CREATE) which may not return rows
            const normalizedData = {
                ...data,
                rows: data.rows || [],
                metaData: data.metaData || []
            };

            if (data.rowsAffected !== undefined) {
                showToast(`Comando executado com sucesso. Linhas afetadas: ${data.rowsAffected}`);
            } else if (!data.rows && !data.metaData) {
                showToast("Comando executado com sucesso.");
            }

            updateActiveTab({
                results: normalizedData,
                loading: false
            });

            // 3. Fetch Total Count (Asynchronously)
            try {
                const countRes = await fetch('http://127.0.0.1:3001/api/query/count', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sql: cleanSql })
                });
                const countData = await countRes.json();
                if (countData.count !== undefined) {
                    updateActiveTab({ totalRecords: countData.count });
                }
            } catch (countErr) {
                console.error("Failed to fetch count", countErr);
            }

        } catch (err) {
            updateActiveTab({ error: err.message, loading: false });
        }
    };

    const saveQuery = () => {
        if (!queryName) {
            alert("Por favor, insira um nome para a query.");
            return;
        }
        const newQuery = { id: Date.now(), name: queryName, sql: activeTab.sqlContent };
        const updatedQueries = [...savedQueries, newQuery];
        setSavedQueries(updatedQueries);
        setShowSaveInput(false);
        setQueryName('');
    };

    const deleteQuery = (id) => {
        if (window.confirm("Tem certeza que deseja excluir esta query?")) {
            const updatedQueries = savedQueries.filter(q => q.id !== id);
            setSavedQueries(updatedQueries);
        }
    };

    const loadQuery = (query) => {
        updateActiveTab({ sqlContent: query.sql });
        setQueryName(query.name);
    };

    // --- Tab Management ---
    const addTab = () => {
        const newId = Date.now();
        const newTab = { id: newId, title: `Query ${tabs.length + 1}`, sqlContent: '', results: null, error: null, loading: false };
        setTabs([...tabs, newTab]);
        setActiveTabId(newId);
    };

    const closeTab = (e, id) => {
        e.stopPropagation();
        if (tabs.length === 1) {
            // Don't close the last tab, just clear it
            setTabs([{ ...tabs[0], sqlContent: '', results: null, error: null }]);
            return;
        }
        const newTabs = tabs.filter(t => t.id !== id);
        setTabs(newTabs);
        if (activeTabId === id) {
            setActiveTabId(newTabs[newTabs.length - 1].id);
        }
    };

    // --- Filtering Logic ---
    const getFilteredRows = () => {
        if (!activeTab.results) return [];

        const hasFilters = Object.values(columnFilters).some(val => val && val.trim() !== '');
        if (!hasFilters || serverSideFilter) return activeTab.results.rows;

        return activeTab.results.rows.filter(row => {
            return columnOrder.every((colName, idx) => {
                const filterVal = columnFilters[colName];
                if (!filterVal) return true;

                const originalIdx = activeTab.results.metaData.findIndex(m => m.name === colName);
                const cellValue = String(row[originalIdx] || '').toLowerCase();
                return cellValue.includes(filterVal.toLowerCase());
            });
        });
    };

    const filteredRows = getFilteredRows();

    const downloadStreamExport = async () => {
        showToast("Iniciando download do CSV...", "info", 0);
        try {
            const cleanSql = activeTab.sqlContent.trim().replace(/;$/, '');
            const res = await fetch('http://localhost:3001/api/export/csv', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sql: cleanSql,
                    filter: serverSideFilter ? columnFilters : null
                })
            });

            if (!res.ok) throw new Error("Erro na exportação");

            const blob = await res.blob();
            saveAs(blob, `export_${Date.now()}.csv`);
            showToast("Download concluído!");
        } catch (err) {
            console.error(err);
            showToast("Erro ao exportar: " + err.message, 'error');
        }
    };

    const performNativeSave = async (filename, content, type) => {
        if (window.electronAPI && window.electronAPI.saveFile) {
            const savedPath = await window.electronAPI.saveFile({ filename, content, type });
            if (savedPath) {
                showToast("Arquivo salvo com sucesso!");
                window.electronAPI.showItemInFolder(savedPath);
            }
        } else {
            // Browser Fallback logic
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
        if (!activeTab.results || !activeTab.results.rows || activeTab.results.rows.length === 0) {
            alert("Não há dados para exportar.");
            return;
        }

        const needsFetchAll = (limit !== 'all' && activeTab.results.rows.length >= limit) || serverSideFilter;

        if (needsFetchAll) {
            const confirmFetchAll = window.confirm(`A visualização atual está limitada ou filtrada. Deseja exportar TODAS as linhas correspondentes?`);
            if (confirmFetchAll) {
                // Export ALL (Server Side)
                if (type === 'csv') {
                    downloadStreamExport();
                    return;
                } else if (type === 'xlsx') {
                    // Check total records if available
                    if (activeTab.totalRecords > 100000) {
                        if (window.confirm("Para grandes volumes (>100k), a exportação em Excel pode falhar ou ser lenta. Recomendamos CSV. Deseja exportar em CSV?")) {
                            downloadStreamExport();
                            return;
                        }
                    }
                    if (activeTab.totalRecords > 1000000) {
                        alert("Atenção: O Excel suporta no máximo 1 milhão de linhas. A exportação pode falhar. Recomendamos fortemente o uso de CSV.");
                    }

                    // Fallback to fetching all JSON for Excel (Legacy method)
                    // This might crash for > 1M, but we warned them.
                    showToast("Baixando dados do servidor...", "info", 0);
                    try {
                        const cleanSql = activeTab.sqlContent.trim().replace(/;$/, '');
                        const res = await fetch('http://127.0.0.1:3001/api/query', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                sql: cleanSql,
                                limit: 'all',
                                filter: serverSideFilter ? columnFilters : null
                            })
                        });
                        const data = await res.json();
                        if (data.error) throw new Error(data.error);

                        // Generate Excel
                        const header = data.metaData.map(m => m.name);
                        const rows = [header, ...data.rows];
                        const wb = XLSX.utils.book_new();
                        const ws = XLSX.utils.aoa_to_sheet(rows);
                        XLSX.utils.book_append_sheet(wb, ws, "Results");
                        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

                        // Prepare for IPC (Base64)
                        const bytes = new Uint8Array(wbout);
                        let binary = '';
                        const len = bytes.byteLength;
                        for (let i = 0; i < len; i++) {
                            binary += String.fromCharCode(bytes[i]);
                        }
                        const contentBase64 = window.btoa(binary);
                        const filename = `export_full_${Date.now()}.xlsx`;

                        await performNativeSave(filename, contentBase64, 'xlsx');
                    } catch (err) {
                        alert("Falha ao buscar todos os dados: " + err.message);
                    } finally {
                        // Done
                    }
                    return;
                }
            }
        }

        // Export only what's visible (Client Side)


        // Let's use toast "Gerando arquivo..."
        showToast("Gerando arquivo...", "info", 0);

        // Small delay to let toast render
        setTimeout(async () => {
            try {
                const header = activeTab.results.metaData.map(m => m.name);
                const data = [header, ...filteredRows];
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const filename = `sql_export_${timestamp}.${type}`;
                let contentToSend;

                if (type === 'xlsx') {
                    const wb = XLSX.utils.book_new();
                    const ws = XLSX.utils.aoa_to_sheet(data);
                    XLSX.utils.book_append_sheet(wb, ws, "Results");
                    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

                    // Convert to Base64
                    const bytes = new Uint8Array(wbout);
                    let binary = '';
                    const len = bytes.byteLength;
                    for (let i = 0; i < len; i++) {
                        binary += String.fromCharCode(bytes[i]);
                    }
                    contentToSend = window.btoa(binary);

                } else if (type === 'csv') {
                    const ws = XLSX.utils.aoa_to_sheet(data);
                    contentToSend = XLSX.utils.sheet_to_csv(ws);
                } else if (type === 'txt') {
                    // For txt just fallback to saveAs for simplicity or implement text save
                    const txtContent = data.map(row => row.join('\t')).join('\n');
                    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
                    saveAs(blob, `${filename}.txt`);
                    showToast("Download concluído!");
                    return;
                }

                await performNativeSave(filename, contentToSend, type);

            } catch (err) {
                console.error("Export Error:", err);
                showToast("Falha ao exportar: " + err.message, 'error');
            }
            // We don't need finally { setIsExporting(false) } because we didn't set it true (or if we did, we should turn it off)
            // But wait, if I don't use the overlay, user might click again. 
            // It's better to show toast "Aguarde..." and maybe disable buttons?
        }, 100);
    };

    const unused_handleShare = async (type) => {
        if (!activeTab.results || !activeTab.results.rows || activeTab.results.rows.length === 0) {
            alert("Não há dados para compartilhar.");
            return;
        }

        setIsExporting(true);
        try {
            const header = activeTab.results.metaData.map(m => m.name);
            const data = [header, ...filteredRows];
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const filename = `sql_report_${timestamp}.${type}`;

            let file;
            if (type === 'xlsx') {
                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.aoa_to_sheet(data);
                XLSX.utils.book_append_sheet(wb, ws, "Results");
                const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                file = new File([new Blob([wbout])], filename, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            } else if (type === 'csv') {
                const ws = XLSX.utils.aoa_to_sheet(data);
                const csvOutput = XLSX.utils.sheet_to_csv(ws);
                file = new File([new Blob([csvOutput])], filename, { type: 'text/csv' });
            }

            // Try to use Native Share first
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                        title: 'Relatório SQL',
                        text: 'Segue relatório gerado pelo Hap Query Report.'
                    });
                    showToast("Compartilhamento completo!");
                    return;
                } catch (shareErr) {
                    console.warn("Native share failed, falling back to Save As", shareErr);
                    // Fallthrough to fallback
                }
            }

            // Fallback: Use Electron File Save (Robust)
            if (window.electronAPI && window.electronAPI.saveFile) {
                // Prepare content for IPC
                let contentToSend;
                if (type === 'xlsx') {
                    // Blob to Base64
                    const arrayBuffer = await file.arrayBuffer();
                    let binary = '';
                    const bytes = new Uint8Array(arrayBuffer);
                    const len = bytes.byteLength;
                    for (let i = 0; i < len; i++) {
                        binary += String.fromCharCode(bytes[i]);
                    }
                    contentToSend = window.btoa(binary);
                } else {
                    // Text
                    contentToSend = await file.text();
                }

                const savedPath = await window.electronAPI.saveFile({ filename, content: contentToSend, type });

                if (savedPath) {
                    showToast("Arquivo salvo com sucesso!");
                    window.electronAPI.showItemInFolder(savedPath);
                }
            } else {
                // Browser Fallback (if not in Electron)
                saveAs(file, filename);
                showToast("Arquivo salvo!");
            }

        } catch (err) {
            console.error("Share Error:", err);
            if (err.name !== 'AbortError') {
                showToast("Erro ao compartilhar: " + err.message, 'error');
            }
        } finally {
            setIsExporting(false);
        }
    };

    // --- Smart Value Formatting ---
    const formatCellValue = (val) => {
        if (typeof val !== 'string') return val;

        // Strict ISO Date regex (YYYY-MM-DDTHH:mm:ss...)
        // We only want to format typical database timestamps
        const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;

        if (isoDateRegex.test(val)) {
            const date = new Date(val);
            if (isNaN(date.getTime())) return val;

            // Check if it has "meaningful" time.
            // Often "03:00:00.000Z" effectively means "Midnight in Brazil" (GMT-3) or just Midnight UTC
            // If the UTC time is Turn-of-Day or if Local time is Turn-of-Day, we might show just Date.
            // However, sticking to the standard: 
            // If local time has 00:00:00, show only date.

            // To be precise: If the string ends in T00:00:00.000Z or T03:00:00.000Z (typical Oracle Date w/o Time in BRT context)
            // But let's rely on the Date object values.

            const hours = date.getHours();
            const minutes = date.getMinutes();
            const seconds = date.getSeconds();

            const hasTime = hours !== 0 || minutes !== 0 || seconds !== 0;

            if (!hasTime) {
                return date.toLocaleDateString('pt-BR'); // DD/MM/YYYY
            } else {
                return date.toLocaleString('pt-BR'); // DD/MM/YYYY HH:mm:ss
            }
        }
        return val;
    };

    // --- Column Drag & Drop ---
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

    const handleDragEnd = () => {
        setDraggingCol(null);
    };

    // --- Virtualized Row Renderer ---
    const Row = ({ index, style }) => {
        const row = filteredRows[index];
        return (
            <div style={style} className={`flex divide-x ${theme.border} ${index % 2 === 0 ? theme.panel : 'bg-opacity-50 ' + theme.bg} hover:bg-blue-50 transition-colors`}>
                {columnOrder.map(colName => {
                    if (!visibleColumns[colName]) return null;
                    const originalIdx = activeTab.results.metaData.findIndex(m => m.name === colName);
                    const width = columnWidths[colName] || 150;
                    return (
                        <div key={colName} className={`px-2 py-2 text-sm ${theme.sidebarText} overflow-hidden text-ellipsis whitespace-nowrap`} style={{ width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }} title={String(row[originalIdx])}>
                            {formatCellValue(row[originalIdx])}
                        </div>
                    );
                })}
            </div>
        );
    };

    // Container click handler to ensure focus
    const handleContainerClick = () => {
        if (viewRef.current && !viewRef.current.hasFocus) {
            viewRef.current.focus();
        }
    };

    return (
        <div className={`space-y-4 relative h-full flex flex-col ${theme.bg}`}>
            {/* Toast Notification */}
            {toast && (
                <div className={`fixed bottom-4 right-4 px-6 py-3 rounded shadow-lg z-50 animate-fade-in-up text-white font-medium ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>
                    {toast.message}
                </div>
            )}

            {/* Loading Overlay for Export */}
            {isExporting && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                    <div className="bg-white p-6 rounded-lg shadow-xl flex flex-col items-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#f37021] mb-4"></div>
                        <p className="text-gray-700 font-semibold">Exportando dados...</p>
                        <p className="text-sm text-gray-500">Por favor, aguarde.</p>
                    </div>
                </div>
            )}

            <div className="flex gap-4 h-full overflow-hidden">
                {/* Main Editor Area */}
                <div className="flex-1 space-y-2 flex flex-col overflow-hidden">

                    {/* Tabs Header */}
                    <div className="flex items-center space-x-1 overflow-x-auto border-b border-gray-200 pb-1">
                        {tabs.map(tab => (
                            <div
                                key={tab.id}
                                onClick={() => setActiveTabId(tab.id)}
                                className={`group flex items-center px-3 py-1.5 text-xs font-medium rounded-t-lg cursor-pointer border-t border-l border-r ${activeTabId === tab.id
                                    ? 'bg-white text-blue-600 border-gray-200 relative top-[1px]'
                                    : 'bg-gray-100 text-gray-500 hover:bg-gray-50 border-transparent'
                                    }`}
                            >
                                <span className="mr-2 max-w-[100px] truncate">{tab.title}</span>
                                <button
                                    onClick={(e) => closeTab(e, tab.id)}
                                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500"
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                        <button
                            onClick={addTab}
                            className="px-2 py-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                            title="Nova Aba"
                        >
                            +
                        </button>
                    </div>

                    <div className="flex-none">
                        <div ref={containerRef} onClick={handleContainerClick} className={`border rounded overflow-hidden ${theme.border} cursor-text`}>
                            {isVisible && (
                                <CodeMirror
                                    value={activeTab.sqlContent}
                                    height="200px"
                                    extensions={[
                                        sql({ schema: schemaData, dialect: PLSQL }),
                                        autocompletion({
                                            override: [(context) => {
                                                let word = context.matchBefore(/\w*/)
                                                if (!word) return null
                                                if (word.from == word.to && !context.explicit) return null

                                                const oracleFunctions = [
                                                    { label: "NVL", type: "function", detail: "nvl(expr1, expr2)" },
                                                    { label: "NVL2", type: "function", detail: "nvl2(expr1, expr2, expr3)" },
                                                    { label: "DECODE", type: "function", detail: "decode(expr, search, result...)" },
                                                    { label: "TO_CHAR", type: "function", detail: "to_char(n, [fmt])" },
                                                    { label: "TO_DATE", type: "function", detail: "to_date(char, [fmt])" },
                                                    { label: "TO_NUMBER", type: "function", detail: "to_number(expr, [fmt])" },
                                                    { label: "SUBSTR", type: "function", detail: "substr(char, position, [len])" },
                                                    { label: "INSTR", type: "function", detail: "instr(string, substring)" },
                                                    { label: "REPLACE", type: "function", detail: "replace(char, search, [replace])" },
                                                    { label: "TRUNC", type: "function", detail: "trunc(date, [fmt])" },
                                                    { label: "ROUND", type: "function", detail: "round(n, [integer])" },
                                                    { label: "SYSDATE", type: "keyword", detail: "Current Date" },
                                                    { label: "UPPER", type: "function", detail: "upper(char)" },
                                                    { label: "LOWER", type: "function", detail: "lower(char)" },
                                                    { label: "COALESCE", type: "function", detail: "coalesce(expr1, ...)" },
                                                    { label: "LISTAGG", type: "function", detail: "listagg(measure, delimiter)" },
                                                    { label: "CASE", type: "keyword", detail: "CASE WHEN ... END" },
                                                    { label: "WHEN", type: "keyword" },
                                                    { label: "THEN", type: "keyword" },
                                                    { label: "ELSE", type: "keyword" },
                                                    { label: "END", type: "keyword" }
                                                ];

                                                return {
                                                    from: word.from,
                                                    options: oracleFunctions
                                                }
                                            }]
                                        })
                                    ]}
                                    onChange={(value) => updateActiveTab({ sqlContent: value })}
                                    theme={theme.name === 'Modo Escuro' || theme.name === 'Dracula' ? 'dark' : 'light'}
                                    className="text-sm"
                                    onCreateEditor={(view) => {
                                        viewRef.current = view;
                                        view.focus();
                                    }}
                                />
                            )}
                        </div>

                        <div className={`mt-2 flex items-center justify-between p-2 rounded border ${theme.panel} ${theme.border}`}>
                            <div className="flex items-center space-x-3">
                                <button
                                    onClick={executeQuery}
                                    disabled={!activeTab.sqlContent || activeTab.loading}
                                    className={`py-2 px-6 rounded-lg shadow-md transition-all font-semibold flex items-center disabled:opacity-50 ${theme.primaryBtn}`}
                                >
                                    {activeTab.loading ? (
                                        <>
                                            <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></span>
                                            Executando...
                                        </>
                                    ) : (
                                        <>
                                            <span className="mr-2">▶</span> Executar
                                        </>
                                    )}
                                </button>

                                {activeTab.totalRecords !== undefined && (
                                    <span className="text-xs font-medium text-gray-500 ml-2">
                                        Total: {activeTab.totalRecords.toLocaleString()} registros
                                    </span>
                                )}

                                <button
                                    onClick={() => setShowSidebar(!showSidebar)}
                                    className={`p-2 rounded border transition-colors flex items-center justify-center ${showSidebar ? `${theme.primaryBtn}` : `${theme.secondaryBtn}`}`}
                                    title={showSidebar ? "Ocultar Menu Lateral" : "Mostrar Menu Lateral"}
                                >
                                    {/* Sidebar Layout Icon */}
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 6v12" />
                                    </svg>
                                </button>
                                <label className="cursor-pointer p-2 rounded border transition-colors text-gray-500 hover:bg-blue-50 hover:text-blue-600" title="Carregar Arquivo SQL">
                                    <input
                                        type="file"
                                        accept=".sql"
                                        onChange={handleFileUpload}
                                        className="hidden"
                                    />
                                    {/* Paperclip Icon */}
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                    </svg>
                                </label>

                                <div className={`flex items-center border-l pl-2 ${theme.border}`}>
                                    <select
                                        value={limit}
                                        onChange={(e) => setLimit(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                                        title="Limite de Linhas"
                                        className={`border rounded p-1.5 text-xs focus:ring-2 focus:ring-blue-500 outline-none w-24 ${theme.input} ${theme.border}`}
                                    >
                                        <option value={100}>100 linhas</option>
                                        <option value={500}>500 linhas</option>
                                        <option value={1000}>1000 linhas</option>
                                        <option value={5000}>5000 linhas</option>
                                        <option value="all">Todas</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex items-center space-x-2">
                                {showSaveInput ? (
                                    <div className="flex items-center space-x-2 animate-fade-in">
                                        <input
                                            type="text"
                                            value={queryName}
                                            onChange={(e) => setQueryName(e.target.value)}
                                            placeholder="Nome da Query"
                                            className={`border rounded p-1.5 text-sm focus:ring-2 focus:ring-[#f37021] outline-none ${theme.input} ${theme.border}`}
                                            autoFocus
                                        />
                                        <button onClick={saveQuery} className="text-green-600 hover:bg-green-50 p-1.5 rounded" title="Confirmar">✅</button>
                                        <button onClick={() => setShowSaveInput(false)} className="text-red-600 hover:bg-red-50 p-1.5 rounded" title="Cancelar">❌</button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setShowSaveInput(true)}
                                        disabled={!activeTab.sqlContent}
                                        className={`px-3 py-2 rounded transition-colors text-sm font-medium flex items-center disabled:opacity-50 ${theme.secondaryBtn}`}
                                    >
                                        <span className="mr-1">💾</span> Salvar Query
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {activeTab.error && (
                        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded shadow-sm">
                            <p className="text-red-700 font-medium">Erro ao executar query:</p>
                            <p className="text-sm text-red-600 mt-1">{activeTab.error}</p>
                        </div>
                    )}

                    {activeTab.results && (
                        <div className={`rounded-lg shadow-md border flex-1 flex flex-col overflow-hidden min-h-0 ${theme.panel} ${theme.border}`}>
                            <div className={`p-3 border-b flex justify-between items-center ${theme.header}`}>
                                <div className="flex items-center space-x-4">
                                    <h3 className={`text-sm font-bold ${theme.sidebarText}`}>
                                        Resultados: {filteredRows.length} {activeTab.totalRecords !== undefined ? `de ${activeTab.totalRecords.toLocaleString()} (Total)` : ''} {limit !== 'all' && activeTab.results.rows.length >= limit ? '(Limitado)' : ''}
                                    </h3>

                                    {/* Column Controls */}
                                    <div className="relative">
                                        <button
                                            onClick={() => setShowColumnMenu(!showColumnMenu)}
                                            className={`text-xs px-2 py-1 rounded border flex items-center ${theme.secondaryBtn} ${theme.border}`}
                                        >
                                            👁️ Colunas
                                        </button>
                                        {showColumnMenu && (
                                            <div className={`absolute top-full left-0 mt-1 w-48 border rounded shadow-lg z-20 max-h-60 overflow-y-auto p-2 ${theme.panel} ${theme.border}`}>
                                                <div className="text-xs font-bold text-gray-500 mb-2 uppercase">Exibir/Ocultar</div>
                                                {columnOrder.map(col => (
                                                    <label key={col} className="flex items-center space-x-2 mb-1 cursor-pointer hover:bg-gray-50 p-1 rounded">
                                                        <input
                                                            type="checkbox"
                                                            checked={visibleColumns[col]}
                                                            onChange={(e) => setVisibleColumns({ ...visibleColumns, [col]: e.target.checked })}
                                                            className="rounded text-blue-600 focus:ring-blue-500"
                                                        />
                                                        <span className={`text-sm truncate ${theme.sidebarText}`}>{col}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        onClick={() => setShowFilters(!showFilters)}
                                        className={`text-xs px-2 py-1 rounded border flex items-center ${showFilters ? `${theme.primaryBtn}` : `${theme.secondaryBtn} ${theme.border}`}`}
                                    >
                                        🔍 Filtros
                                    </button>

                                    {showFilters && (
                                        <label className="flex items-center space-x-1 cursor-pointer select-none" title="Filtrar em todo o banco de dados (ignora limite)">
                                            <input
                                                type="checkbox"
                                                checked={serverSideFilter}
                                                onChange={(e) => setServerSideFilter(e.target.checked)}
                                                className="rounded text-blue-600 focus:ring-blue-500 h-3 w-3"
                                            />
                                            <span className={`text-[10px] font-medium ${theme.sidebarText}`}>Filtrar Tudo (Servidor)</span>
                                        </label>
                                    )}
                                </div>

                                <div className="flex space-x-2">

                                    <button onClick={() => exportData('csv')} className={`text-xs border px-3 py-1.5 rounded transition-colors font-medium flex items-center ${theme.secondaryBtn} ${theme.border}`}>
                                        <span className="mr-1">📄</span> CSV
                                    </button>
                                    <button onClick={() => exportData('xlsx')} className={`text-xs px-3 py-1.5 rounded shadow-sm transition-colors font-medium flex items-center ${theme.primaryBtn}`}>
                                        <span className="mr-1">📊</span> Excel
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 w-full relative overflow-hidden">
                                <AutoSizer>
                                    {({ height, width }) => {
                                        const visibleCount = columnOrder.filter(c => visibleColumns[c]).length;
                                        // Calculate total width based on individual column widths
                                        const totalMinWidth = columnOrder.reduce((acc, col) => {
                                            if (visibleColumns[col]) {
                                                return acc + (columnWidths[col] || 150);
                                            }
                                            return acc;
                                        }, 0);

                                        // Prepare Header Row
                                        const headerRow = (
                                            <div className={`flex divide-x ${theme.border} ${theme.tableHeader} border-b font-bold text-xs uppercase tracking-wider h-full items-center bg-gray-50`}>
                                                {columnOrder.map(colName => {
                                                    if (!visibleColumns[colName]) return null;
                                                    const width = columnWidths[colName] || 150;
                                                    return (
                                                        <div
                                                            key={colName}
                                                            draggable
                                                            onDragStart={(e) => handleDragStart(e, colName)}
                                                            onDragOver={(e) => handleDragOver(e, colName)}
                                                            onDragEnd={handleDragEnd}
                                                            className={`relative px-2 py-3 flex-none overflow-hidden text-ellipsis cursor-move transition-colors ${draggingCol === colName ? 'opacity-50 bg-blue-50' : ''}`}
                                                            style={{ width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }}
                                                        >
                                                            <div className="flex flex-col space-y-2 w-full">
                                                                <span
                                                                    className="whitespace-normal break-words leading-tight cursor-pointer hover:text-blue-600"
                                                                    title="Clique duplo para auto-ajustar largura"
                                                                    onDoubleClick={() => {
                                                                        // Precise measurement using Canvas
                                                                        const canvas = document.createElement('canvas');
                                                                        const context = canvas.getContext('2d');
                                                                        context.font = '12px "Inter", "Segoe UI", sans-serif'; // Match table font roughly

                                                                        let maxWidth = context.measureText(colName).width; // Start with header width

                                                                        // Sample first 2000 rows for performance
                                                                        const rowsToScan = activeTab.results.rows.length > 2000 ? activeTab.results.rows.slice(0, 2000) : activeTab.results.rows;

                                                                        rowsToScan.forEach(row => {
                                                                            const originalIdx = activeTab.results.metaData.findIndex(m => m.name === colName);
                                                                            const val = String(row[originalIdx] || ''); // Use originalIdx to get correct column value
                                                                            const w = context.measureText(val).width;
                                                                            if (w > maxWidth) maxWidth = w;
                                                                        });

                                                                        // Add padding (approx 24px)
                                                                        const finalWidth = Math.min(Math.max(100, Math.ceil(maxWidth + 24)), 800);
                                                                        setColumnWidths(prev => ({ ...prev, [colName]: finalWidth }));
                                                                    }}
                                                                >
                                                                    {colName}
                                                                </span>
                                                                {showFilters && (
                                                                    <input
                                                                        type="text"
                                                                        placeholder={serverSideFilter ? "Filtrar (Enter)..." : "Filtrar..."}
                                                                        value={columnFilters[colName] || ''}
                                                                        onChange={(e) => setColumnFilters({ ...columnFilters, [colName]: e.target.value })}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Enter' && serverSideFilter) {
                                                                                executeQuery();
                                                                            }
                                                                        }}
                                                                        className={`w-full text-xs p-1 border rounded font-normal normal-case ${theme.input} ${theme.border} ${serverSideFilter ? 'border-blue-400 bg-blue-50' : ''}`}
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        title={serverSideFilter ? "Pressione Enter para buscar no servidor" : "Filtragem local"}
                                                                    />
                                                                )}
                                                            </div>
                                                            {/* Resizer Handle */}
                                                            <div
                                                                className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-10"
                                                                onMouseDown={(e) => startResizing(e, colName)}
                                                                onClick={(e) => e.stopPropagation()}
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );

                                        return (
                                            <VirtualList
                                                height={height}
                                                width={width}
                                                itemCount={filteredRows.length}
                                                itemSize={40}
                                                minWidth={totalMinWidth}
                                                header={headerRow}
                                                headerHeight={showFilters ? 80 : 45} // Adjust height if filters are shown
                                            >
                                                {Row}
                                            </VirtualList>
                                        );
                                    }}
                                </AutoSizer>
                            </div>
                        </div>
                    )}
                </div>

                {/* Sidebar (Saved Queries & Schema) */}
                {showSidebar && (
                    <div className={`w-64 border-l flex flex-col shadow-sm transition-all duration-300 ${theme.panel} ${theme.border} overflow-hidden`}>
                        <div className={`flex border-b ${theme.border}`}>
                            <button
                                onClick={() => setActiveSidebarTab('saved')}
                                className={`flex-1 py-2 text-xs font-bold uppercase ${activeSidebarTab === 'saved' ? `border-b-2 border-blue-500 ${theme.accent}` : 'text-gray-400'}`}
                            >
                                Salvas
                            </button>
                            <button
                                onClick={() => setActiveSidebarTab('schema')}
                                className={`flex-1 py-2 text-xs font-bold uppercase ${activeSidebarTab === 'schema' ? `border-b-2 border-blue-500 ${theme.accent}` : 'text-gray-400'}`}
                            >
                                Schema
                            </button>
                            <button onClick={() => setShowSidebar(false)} className="px-3 text-gray-400 hover:text-gray-600">✕</button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-2">
                            {activeSidebarTab === 'saved' ? (
                                <>
                                    {savedQueries.length === 0 && (
                                        <p className="text-gray-400 text-xs text-center italic mt-4">Nenhuma query salva.</p>
                                    )}
                                    {savedQueries.map(q => (
                                        <div key={q.id} className={`group p-3 rounded border transition-all cursor-pointer relative ${theme.border} hover:border-blue-300 hover:bg-blue-50`} onClick={() => loadQuery(q)}>
                                            <div className={`font-medium text-sm truncate pr-6 ${theme.text}`}>{q.name}</div>
                                            <div className="text-xs text-gray-400 truncate mt-1">{q.sql.substring(0, 30)}...</div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); deleteQuery(q.id); }}
                                                className="absolute top-2 right-2 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                                title="Excluir"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    ))}
                                </>
                            ) : (
                                <div className={`${theme.bg} p-2 border-t space-y-1 flex flex-col h-full`}>
                                    {/* Search Controls */}
                                    <div className="flex space-x-2 mb-2">
                                        <input
                                            type="text"
                                            placeholder="Buscar tabelas..."
                                            value={schemaSearch}
                                            onChange={(e) => setSchemaSearch(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && fetchSchemaTables(schemaSearch)}
                                            className={`w-full text-xs p-1.5 rounded border outline-none ${theme.input} ${theme.border}`}
                                        />
                                        <button
                                            onClick={() => fetchSchemaTables(schemaSearch)}
                                            disabled={loadingSchema}
                                            className={`px-3 py-1 text-xs rounded font-medium transition-colors ${theme.primaryBtn} disabled:opacity-50`}
                                        >
                                            {loadingSchema ? '...' : '🔍'}
                                        </button>
                                    </div>

                                    {/* Table List */}
                                    <div className="flex-1 overflow-y-auto space-y-1">
                                        {schemaTables.length === 0 && !loadingSchema && (
                                            <div className="text-[10px] text-gray-400 italic text-center mt-4">
                                                Use a busca para encontrar tabelas.
                                            </div>
                                        )}

                                        {schemaTables.map(tableName => (
                                            <div key={tableName} className={`rounded border ${theme.border} overflow-hidden`}>
                                                <div
                                                    onClick={() => handleExpandTable(tableName)}
                                                    className={`px-2 py-1.5 text-xs font-medium cursor-pointer flex justify-between items-center hover:bg-opacity-50 ${expandedTable === tableName ? 'bg-blue-50 text-blue-700' : theme.sidebarText} ${theme.tableRowHover}`}
                                                >
                                                    <span className="truncate" title={tableName}>{tableName}</span>
                                                    <span className="text-[10px] opacity-50">{expandedTable === tableName ? '▼' : '▶'}</span>
                                                </div>

                                                {expandedTable === tableName && (
                                                    <div className={`p-1 pl-3 border-t ${theme.border} bg-opacity-30 ${theme.bg}`}>
                                                        {(schemaData[tableName] || []).length === 0 ? (
                                                            <div className="text-[10px] text-gray-400 italic px-2">Carregando colunas...</div>
                                                        ) : (
                                                            <>
                                                                {(schemaData[tableName] || []).map(col => (
                                                                    <div
                                                                        key={col}
                                                                        className={`text-[10px] ${theme.text} flex justify-between group cursor-pointer hover:text-blue-600 py-0.5 px-1 rounded hover:bg-gray-100`}
                                                                        title="Clique duplo para inserir"
                                                                        onDoubleClick={() => insertTextAtCursor(col)}
                                                                    >
                                                                        <span>{col}</span>
                                                                    </div>
                                                                ))}
                                                                <div className="pt-1 mt-1 border-t border-dashed border-gray-200">
                                                                    <button
                                                                        onClick={() => insertTextAtCursor(`SELECT * FROM ${tableName}`)}
                                                                        className="w-full text-[10px] bg-blue-50 text-blue-600 rounded py-0.5 hover:bg-blue-100 transition-colors"
                                                                    >
                                                                        Gerar SELECT
                                                                    </button>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}


SqlRunner.propTypes = {
    isVisible: PropTypes.bool,
    tabs: PropTypes.array.isRequired,
    setTabs: PropTypes.func.isRequired,
    activeTabId: PropTypes.number.isRequired,
    setActiveTabId: PropTypes.func.isRequired,
    savedQueries: PropTypes.array.isRequired,
    setSavedQueries: PropTypes.func.isRequired
};

export default SqlRunner;
