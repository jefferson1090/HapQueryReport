import React, { useState, useEffect, useContext, useRef } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { ThemeContext } from '../App';
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';

function SqlRunner() {
    const { theme } = useContext(ThemeContext);

    const [sqlContent, setSqlContent] = useState('');
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isExporting, setIsExporting] = useState(false);
    const [limit, setLimit] = useState(1000);
    const [savedQueries, setSavedQueries] = useState([]);
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
    const [draggingCol, setDraggingCol] = useState(null);

    useEffect(() => {
        const saved = localStorage.getItem('hap_saved_queries');
        if (saved) {
            try {
                setSavedQueries(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to parse saved queries", e);
            }
        }
    }, []);

    // Initialize column state when results change
    useEffect(() => {
        if (results && results.metaData) {
            const initialVisible = {};
            const initialOrder = results.metaData.map(m => m.name);
            results.metaData.forEach(m => initialVisible[m.name] = true);

            setVisibleColumns(initialVisible);
            setColumnOrder(initialOrder);
            setColumnFilters({});
        }
    }, [results]);

    // Fetch Tables for Schema Browser
    useEffect(() => {
        if (activeSidebarTab === 'schema') {
            fetchSchemaTables(schemaSearch);
        }
    }, [activeSidebarTab, schemaSearch]);

    const fetchSchemaTables = async (search = '') => {
        setLoadingSchema(true);
        try {
            const res = await fetch(`http://localhost:3001/api/tables?search=${encodeURIComponent(search)}`);
            const data = await res.json();
            setSchemaTables(data);

            // Build schema object for autocomplete if needed (simple version)
            // Ideally we'd fetch all columns but that's expensive. 
            // We can add tables to autocomplete schema.
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

            // Update schema data for autocomplete
            setSchemaData(prev => ({
                ...prev,
                [tableName]: data.map(c => c.name)
            }));
        } catch (err) {
            console.error("Failed to fetch columns", err);
        }
    };

    const insertTextAtCursor = (text) => {
        // CodeMirror handles this via state binding, but for direct insertion we append
        // A better way with CodeMirror is to use the ref, but for simplicity let's just append 
        // or replace if we can. 
        // Since we are using controlled component, updating state works.
        // However, to insert *at cursor*, we need the view instance.
        // For now, let's just append to end if we don't have cursor tracking, 
        // or just update the content.
        setSqlContent(prev => prev + ' ' + text);
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        setLoading(true);
        try {
            const res = await fetch('http://localhost:3001/api/upload/sql', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setSqlContent(data.sql);
            // Suggest a name based on filename
            setQueryName(file.name.replace(/\.sql$/i, ''));
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const executeQuery = async () => {
        setLoading(true);
        setError(null);
        try {
            // Remove trailing semicolon if present, as it causes ORA-00933
            const cleanSql = sqlContent.trim().replace(/;$/, '');

            const res = await fetch('http://localhost:3001/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql: cleanSql, limit: limit })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setResults(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const saveQuery = () => {
        if (!queryName) {
            alert("Please enter a name for the query.");
            return;
        }
        const newQuery = { id: Date.now(), name: queryName, sql: sqlContent };
        const updatedQueries = [...savedQueries, newQuery];
        setSavedQueries(updatedQueries);
        localStorage.setItem('hap_saved_queries', JSON.stringify(updatedQueries));
        setShowSaveInput(false);
        setQueryName('');
    };

    const deleteQuery = (id) => {
        if (window.confirm("Are you sure you want to delete this query?")) {
            const updatedQueries = savedQueries.filter(q => q.id !== id);
            setSavedQueries(updatedQueries);
            localStorage.setItem('hap_saved_queries', JSON.stringify(updatedQueries));
        }
    };

    const loadQuery = (query) => {
        setSqlContent(query.sql);
        setQueryName(query.name);
    };

    // --- Filtering Logic ---
    const getFilteredRows = () => {
        if (!results) return [];

        // If no filters, return all rows (or limited set)
        const hasFilters = Object.values(columnFilters).some(val => val && val.trim() !== '');
        if (!hasFilters) return results.rows;

        return results.rows.filter(row => {
            return columnOrder.every((colName, idx) => {
                const filterVal = columnFilters[colName];
                if (!filterVal) return true;

                // Find original index of this column in results.metaData
                const originalIdx = results.metaData.findIndex(m => m.name === colName);
                const cellValue = String(row[originalIdx] || '').toLowerCase();
                return cellValue.includes(filterVal.toLowerCase());
            });
        });
    };

    const filteredRows = getFilteredRows();

    const exportData = async (type) => {
        if (!results || !results.rows || results.rows.length === 0) {
            alert("Não há dados para exportar.");
            return;
        }

        setIsExporting(true);

        // Determine what data to export
        let dataToExport = { metaData: results.metaData, rows: filteredRows };

        // Check if we are filtering. If filtering, we export what is seen (filteredRows).
        // If NOT filtering, and we have a limit, ask if we want ALL data.
        const hasFilters = Object.values(columnFilters).some(val => val && val.trim() !== '');

        if (!hasFilters && limit !== 'all' && results.rows.length >= limit) {
            const confirmFetchAll = window.confirm(`A visualização atual está limitada a ${limit} linhas. Deseja exportar TODAS as linhas? (Isso pode demorar um pouco)`);
            if (confirmFetchAll) {
                try {
                    const cleanSql = sqlContent.trim().replace(/;$/, '');
                    const res = await fetch('http://localhost:3001/api/query', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sql: cleanSql, limit: 'all' })
                    });
                    const data = await res.json();
                    if (data.error) throw new Error(data.error);
                    dataToExport = data;
                } catch (err) {
                    alert("Falha ao buscar todos os dados: " + err.message);
                    setIsExporting(false);
                    return;
                }
            }
        }

        setTimeout(() => {
            try {
                const header = dataToExport.metaData.map(m => m.name);
                const data = [header, ...dataToExport.rows];
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const filename = `sql_export_${timestamp}`;

                if (type === 'xlsx') {
                    const wb = XLSX.utils.book_new();
                    const ws = XLSX.utils.aoa_to_sheet(data);
                    XLSX.utils.book_append_sheet(wb, ws, "Results");
                    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                    const blob = new Blob([wbout], { type: 'application/octet-stream' });
                    saveAs(blob, `${filename}.xlsx`);
                } else if (type === 'csv') {
                    const ws = XLSX.utils.aoa_to_sheet(data);
                    const csvOutput = XLSX.utils.sheet_to_csv(ws);
                    const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8' });
                    saveAs(blob, `${filename}.csv`);
                } else if (type === 'txt') {
                    const txtContent = data.map(row => row.join('\t')).join('\n');
                    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
                    saveAs(blob, `${filename}.txt`);
                }
            } catch (err) {
                console.error("Export Error:", err);
                alert("Falha ao exportar: " + err.message);
            } finally {
                setIsExporting(false);
            }
        }, 100);
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

    return (
        <div className={`space-y-6 relative h-full flex flex-col ${theme.bg}`}>
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
                <div className="flex-1 space-y-4 flex flex-col overflow-hidden">
                    <div className={`p-4 rounded border shadow-sm flex justify-between items-center ${theme.panel} ${theme.border}`}>
                        <div>
                            <h3 className={`font-bold ${theme.sidebarText}`}>Editor SQL</h3>
                            <p className="text-xs text-gray-500">Escreva ou importe sua query</p>
                        </div>
                        <div className="flex items-center space-x-3">
                            <button
                                onClick={() => setShowSidebar(!showSidebar)}
                                className={`text-sm px-3 py-1.5 rounded border transition-colors ${showSidebar ? `${theme.primaryBtn}` : `${theme.secondaryBtn}`}`}
                                title={showSidebar ? "Ocultar Lateral" : "Mostrar Lateral"}
                            >
                                {showSidebar ? 'Ocultar Lateral' : 'Mostrar Lateral'}
                            </button>
                            <input
                                type="file"
                                accept=".sql"
                                onChange={handleFileUpload}
                                className="text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-colors"
                            />
                        </div>
                    </div>

                    <div className="flex-none">
                        <div className={`border rounded overflow-hidden ${theme.border}`}>
                            <CodeMirror
                                value={sqlContent}
                                height="200px"
                                extensions={[sql({ schema: schemaData })]}
                                onChange={(value) => setSqlContent(value)}
                                theme={theme.name === 'Modo Escuro' || theme.name === 'Dracula' ? 'dark' : 'light'}
                                className="text-sm"
                            />
                        </div>
                        <div className={`mt-2 flex items-center justify-between p-2 rounded border ${theme.panel} ${theme.border}`}>
                            <div className="flex items-center space-x-3">
                                <button
                                    onClick={executeQuery}
                                    disabled={!sqlContent || loading}
                                    className={`py-2 px-6 rounded-lg shadow-md transition-all font-semibold flex items-center disabled:opacity-50 ${theme.primaryBtn}`}
                                >
                                    {loading ? (
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

                                <div className={`flex items-center space-x-2 border-l pl-3 ${theme.border}`}>
                                    <span className={`text-sm font-medium ${theme.sidebarText}`}>Limite:</span>
                                    <select
                                        value={limit}
                                        onChange={(e) => setLimit(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                                        className={`border rounded p-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none ${theme.input} ${theme.border}`}
                                    >
                                        <option value={100}>100 linhas</option>
                                        <option value={500}>500 linhas</option>
                                        <option value={1000}>1000 linhas</option>
                                        <option value={5000}>5000 linhas</option>
                                        <option value="all">Todas (Cuidado)</option>
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
                                        disabled={!sqlContent}
                                        className={`px-3 py-2 rounded transition-colors text-sm font-medium flex items-center disabled:opacity-50 ${theme.secondaryBtn}`}
                                    >
                                        <span className="mr-1">💾</span> Salvar Query
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded shadow-sm">
                            <p className="text-red-700 font-medium">Erro ao executar query:</p>
                            <p className="text-sm text-red-600 mt-1">{error}</p>
                        </div>
                    )}

                    {results && (
                        <div className={`rounded-lg shadow-md border flex-1 flex flex-col overflow-hidden min-h-0 ${theme.panel} ${theme.border}`}>
                            <div className={`p-3 border-b flex justify-between items-center ${theme.header}`}>
                                <div className="flex items-center space-x-4">
                                    <h3 className={`text-sm font-bold ${theme.sidebarText}`}>
                                        Resultados ({filteredRows.length} linhas {limit !== 'all' && results.rows.length >= limit ? '(Limitado)' : ''})
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
                                </div>

                                <div className="flex space-x-2">
                                    <button onClick={() => exportData('csv')} className={`text-xs border px-3 py-1.5 rounded transition-colors font-medium flex items-center ${theme.secondaryBtn} ${theme.border}`}>
                                        <span className="mr-1">📄</span> CSV
                                    </button>
                                    <button onClick={() => exportData('xlsx')} className={`text-xs px-3 py-1.5 rounded shadow-sm transition-colors font-medium flex items-center ${theme.primaryBtn}`}>
                                        <span className="mr-1">📊</span> Excel
                                    </button>
                                    <button onClick={() => exportData('txt')} className={`text-xs border px-3 py-1.5 rounded transition-colors font-medium flex items-center ${theme.secondaryBtn} ${theme.border}`}>
                                        <span className="mr-1">📝</span> TXT
                                    </button>
                                </div>
                            </div>

                            <div className="overflow-auto flex-1 w-full relative">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className={`sticky top-0 z-10 shadow-sm ${theme.tableHeader}`}>
                                        <tr className={`divide-x ${theme.border}`}>
                                            {columnOrder.map(colName => visibleColumns[colName] && (
                                                <th
                                                    key={colName}
                                                    draggable
                                                    onDragStart={(e) => handleDragStart(e, colName)}
                                                    onDragOver={(e) => handleDragOver(e, colName)}
                                                    onDragEnd={handleDragEnd}
                                                    className={`px-6 py-3 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap border-b cursor-move transition-colors ${theme.border} ${draggingCol === colName ? 'opacity-50 bg-blue-50' : ''}`}
                                                >
                                                    <div className="flex flex-col space-y-2">
                                                        <span>{colName}</span>
                                                        {showFilters && (
                                                            <input
                                                                type="text"
                                                                placeholder="Filtrar..."
                                                                value={columnFilters[colName] || ''}
                                                                onChange={(e) => setColumnFilters({ ...columnFilters, [colName]: e.target.value })}
                                                                className={`w-full text-xs p-1 border rounded font-normal normal-case ${theme.input} ${theme.border}`}
                                                                onClick={(e) => e.stopPropagation()} // Prevent drag start when clicking input
                                                            />
                                                        )}
                                                    </div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className={`divide-y ${theme.border} ${theme.panel}`}>
                                        {filteredRows.map((row, i) => (
                                            <tr key={i} className={`transition-colors divide-x ${theme.border} ${theme.tableRowHover}`}>
                                                {columnOrder.map(colName => {
                                                    if (!visibleColumns[colName]) return null;
                                                    // Find original index
                                                    const originalIdx = results.metaData.findIndex(m => m.name === colName);
                                                    return (
                                                        <td key={`${i}-${colName}`} className={`px-6 py-2 whitespace-nowrap text-sm ${theme.sidebarText}`}>
                                                            {row[originalIdx]}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
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
                                            <div className={`font-medium text-sm truncate pr-6 ${theme.sidebarText}`}>{q.name}</div>
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
                                <div className="space-y-2">
                                    <input
                                        type="text"
                                        placeholder="Buscar tabela..."
                                        value={schemaSearch}
                                        onChange={(e) => setSchemaSearch(e.target.value)}
                                        className={`w-full text-xs p-2 border rounded mb-2 ${theme.input} ${theme.border}`}
                                    />
                                    {loadingSchema && <div className="text-center text-xs text-gray-400">Carregando...</div>}
                                    {schemaTables.map(table => (
                                        <div key={table} className={`border rounded ${theme.border}`}>
                                            <div
                                                className={`p-2 text-xs font-medium cursor-pointer flex justify-between items-center hover:bg-gray-100 ${theme.sidebarText}`}
                                                onClick={() => handleExpandTable(table)}
                                            >
                                                <span className="truncate" title={table}>{table}</span>
                                                <span>{expandedTable === table ? '▼' : '▶'}</span>
                                            </div>
                                            {expandedTable === table && (
                                                <div className="bg-gray-50 p-2 border-t space-y-1">
                                                    {tableColumns.length === 0 && <div className="text-[10px] text-gray-400 italic">Carregando colunas...</div>}
                                                    {tableColumns.map(col => (
                                                        <div
                                                            key={col.name}
                                                            className="text-[10px] text-gray-600 flex justify-between group cursor-pointer hover:text-blue-600"
                                                            title="Clique duplo para inserir"
                                                            onDoubleClick={() => insertTextAtCursor(col.name)}
                                                        >
                                                            <span>{col.name}</span>
                                                            <span className="text-gray-400">{col.type}</span>
                                                        </div>
                                                    ))}
                                                    <div className="pt-1 border-t mt-1">
                                                        <button
                                                            onClick={() => insertTextAtCursor(`SELECT * FROM ${table}`)}
                                                            className="w-full text-[10px] bg-blue-100 text-blue-700 rounded py-1 hover:bg-blue-200"
                                                        >
                                                            Gerar SELECT
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default SqlRunner;
