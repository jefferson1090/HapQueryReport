import React, { useState, useEffect, useMemo, useContext } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { ThemeContext } from '../App';

// Debounce helper
const useDebounce = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);
    return debouncedValue;
};

function QueryBuilder({ isVisible }) {
    // Theme State
    const { theme } = useContext(ThemeContext);

    if (!isVisible) return null;

    // Layout State
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [showSavedQueries, setShowSavedQueries] = useState(false);
    const [showSaveModal, setShowSaveModal] = useState(false);

    // Data State
    const [tables, setTables] = useState([]);
    const [primaryTable, setPrimaryTable] = useState('');
    const [joins, setJoins] = useState([]);
    const [columns, setColumns] = useState({}); // { tableName: [columns] }
    const [selectedColumns, setSelectedColumns] = useState([]); // ["Table.Column"]
    const [filters, setFilters] = useState([]);
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isExporting, setIsExporting] = useState(false);

    // Saved Queries State
    const [savedQueries, setSavedQueries] = useState(() => JSON.parse(localStorage.getItem('saved_queries') || '[]'));
    const [queryName, setQueryName] = useState('');

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);

    // Search State
    const [tableSearch, setTableSearch] = useState('');
    const debouncedTableSearch = useDebounce(tableSearch, 500);

    // Fetch tables when debounced search changes
    useEffect(() => {
        fetchTables(debouncedTableSearch);
    }, [debouncedTableSearch]);

    const fetchTables = async (search = '') => {
        try {
            const res = await fetch(`http://127.0.0.1:3001/api/tables?search=${encodeURIComponent(search)}`);
            const data = await res.json();
            setTables(data);
        } catch (err) {
            console.error(err);
        }
    };

    const handleTableSelect = (tableName) => {
        setPrimaryTable(tableName);
        // Reset everything when primary table changes
        setJoins([]);
        setSelectedColumns([]);
        setFilters([]);
        setResults(null);
        setCurrentPage(1);
        fetchColumns(tableName);
    };

    const fetchColumns = async (table) => {
        if (!table || columns[table]) return; // Already fetched or invalid
        try {
            const res = await fetch(`http://127.0.0.1:3001/api/columns/${encodeURIComponent(table)}`);
            const data = await res.json();
            setColumns(prev => ({ ...prev, [table]: data }));
        } catch (err) {
            console.error(err);
        }
    };

    const addJoin = () => {
        setJoins([...joins, { table: '', type: 'INNER', leftCol: '', rightCol: '', conversion: null }]);
    };

    const updateJoin = (index, field, value) => {
        const newJoins = [...joins];
        newJoins[index][field] = value;

        // Reset conversion if columns change
        if (field === 'leftCol' || field === 'rightCol') {
            newJoins[index].conversion = null;
        }

        setJoins(newJoins);
        if (field === 'table' && value) {
            fetchColumns(value);
        }
    };

    const applySmartFix = (index, fixType) => {
        const newJoins = [...joins];
        newJoins[index].conversion = fixType;
        setJoins(newJoins);
    };

    const removeJoin = (index) => {
        setJoins(joins.filter((_, i) => i !== index));
    };

    const handleColumnToggle = (table, colName) => {
        const fullColName = `${table}.${colName}`;
        if (selectedColumns.includes(fullColName)) {
            setSelectedColumns(selectedColumns.filter(c => c !== fullColName));
        } else {
            setSelectedColumns([...selectedColumns, fullColName]);
        }
    };

    const addFilter = () => {
        setFilters([...filters, { column: '', operator: '=', value: '' }]);
    };

    const updateFilter = (index, field, value) => {
        const newFilters = [...filters];
        newFilters[index][field] = value;
        setFilters(newFilters);
    };

    const removeFilter = (index) => {
        setFilters(filters.filter((_, i) => i !== index));
    };

    // Saved Queries Logic
    const saveQuery = () => {
        if (!queryName.trim()) {
            alert("Please enter a name for your query.");
            return;
        }
        const newQuery = {
            id: Date.now(),
            name: queryName,
            config: {
                primaryTable,
                joins,
                selectedColumns,
                filters
            },
            date: new Date().toLocaleString()
        };
        const updatedQueries = [...savedQueries, newQuery];
        setSavedQueries(updatedQueries);
        localStorage.setItem('saved_queries', JSON.stringify(updatedQueries));
        setQueryName('');
        setShowSaveModal(false);
        alert("Query saved successfully!");
    };

    const loadQuery = (savedQuery) => {
        const { config } = savedQuery;
        setPrimaryTable(config.primaryTable);
        setJoins(config.joins);
        setSelectedColumns(config.selectedColumns);
        setFilters(config.filters);

        // Re-fetch columns for all involved tables
        if (config.primaryTable) fetchColumns(config.primaryTable);
        config.joins.forEach(j => {
            if (j.table) fetchColumns(j.table);
        });

        setShowSavedQueries(false);
    };

    const deleteQuery = (id) => {
        const updatedQueries = savedQueries.filter(q => q.id !== id);
        setSavedQueries(updatedQueries);
        localStorage.setItem('saved_queries', JSON.stringify(updatedQueries));
    };

    const buildQuery = () => {
        if (!primaryTable) return null;

        let sql = `SELECT ${selectedColumns.length > 0 ? selectedColumns.join(', ') : '*'} FROM ${primaryTable}`;

        joins.forEach(join => {
            if (join.table && join.leftCol && join.rightCol) {
                let onCondition = '';

                if (join.conversion === 'TO_CHAR_LEFT') {
                    onCondition = `TO_CHAR(${join.leftCol}) = ${join.table}.${join.rightCol}`;
                } else if (join.conversion === 'TO_NUMBER_RIGHT') {
                    onCondition = `${join.leftCol} = TO_NUMBER(${join.table}.${join.rightCol})`;
                } else if (join.conversion === 'TO_CHAR_RIGHT') {
                    onCondition = `${join.leftCol} = TO_CHAR(${join.table}.${join.rightCol})`;
                } else if (join.conversion === 'TO_NUMBER_LEFT') {
                    onCondition = `TO_NUMBER(${join.leftCol}) = ${join.table}.${join.rightCol}`;
                } else {
                    onCondition = `${join.leftCol} = ${join.table}.${join.rightCol}`;
                }

                sql += ` ${join.type} JOIN ${join.table} ON ${onCondition}`;
            }
        });

        const params = [];

        if (filters.length > 0) {
            const whereClauses = filters.map((f, i) => {
                if (!f.column) return null;
                params.push(f.value);
                return `${f.column} ${f.operator} :${i + 1}`;
            }).filter(Boolean);

            if (whereClauses.length > 0) {
                sql += ` WHERE ${whereClauses.join(' AND ')}`;
            }
        }
        return { sql, params };
    };

    const executeQuery = async () => {
        setLoading(true);
        setError(null);
        setCurrentPage(1);
        try {
            const query = buildQuery();
            if (!query) return;

            const res = await fetch('http://127.0.0.1:3001/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(query)
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

    const handleExport = (type) => {
        if (!results || !results.rows || results.rows.length === 0) {
            alert("No data to export.");
            return;
        }

        setIsExporting(true);
        // Use setTimeout to allow the UI to update with the spinner before the heavy sync operation
        setTimeout(() => {
            try {
                const header = results.metaData.map(m => m.name);
                const data = [header, ...results.rows];
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const filename = `export_${timestamp}`;

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
                alert("Failed to export: " + err.message);
            } finally {
                setIsExporting(false);
            }
        }, 100);
    };

    // Helper to get all available columns for filters/joins
    const getAllColumns = () => {
        let cols = [];
        if (primaryTable && columns[primaryTable]) {
            cols = [...cols, ...columns[primaryTable].map(c => `${primaryTable}.${c.name}`)];
        }
        joins.forEach(j => {
            if (j.table && columns[j.table]) {
                cols = [...cols, ...columns[j.table].map(c => `${j.table}.${c.name}`)];
            }
        });
        return cols;
    };

    // Helper to get columns for the left side of a join (Primary + previous joins)
    const getAvailableLeftColumns = (joinIndex) => {
        let cols = [];
        if (primaryTable && columns[primaryTable]) {
            cols = [...cols, ...columns[primaryTable].map(c => ({ name: `${primaryTable}.${c.name}`, type: c.type }))];
        }
        // Add columns from joins BEFORE this one
        for (let i = 0; i < joinIndex; i++) {
            const j = joins[i];
            if (j.table && columns[j.table]) {
                cols = [...cols, ...columns[j.table].map(c => ({ name: `${j.table}.${c.name}`, type: c.type }))];
            }
        }
        return cols;
    };

    // Pagination Logic
    const paginatedRows = useMemo(() => {
        if (!results || !results.rows) return [];
        const start = (currentPage - 1) * rowsPerPage;
        return results.rows.slice(start, start + rowsPerPage);
    }, [results, currentPage, rowsPerPage]);

    const totalPages = results && results.rows ? Math.ceil(results.rows.length / rowsPerPage) : 0;

    return (
        <div className={`flex h-screen ${theme.bg} overflow-hidden transition-colors duration-300 relative`}>
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

            {/* Sidebar */}
            <div
                className={`${theme.sidebar} shadow-lg transition-all duration-300 ease-in-out flex flex-col ${isSidebarOpen ? 'w-96' : 'w-12'} border-r ${theme.border} z-20`}
            >
                <div className={`p-2 border-b ${theme.border} flex justify-between items-center ${theme.sidebar}`}>
                    {isSidebarOpen && <h2 className={`font-bold ${theme.sidebarText}`}>Query Builder</h2>}
                    <button
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        className={`p-1 hover:bg-gray-200 rounded ${theme.sidebarText}`}
                        title={isSidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
                    >
                        {isSidebarOpen ? '◀' : '▶'}
                    </button>
                </div>

                {isSidebarOpen && (
                    <div className="flex-1 overflow-y-auto p-4 space-y-6">
                        {/* Saved Queries Controls */}
                        <div className={`rounded-lg border ${theme.border} p-3 shadow-sm ${theme.sidebar}`}>
                            <button
                                onClick={() => setShowSavedQueries(true)}
                                className={`w-full text-xs border ${theme.border} py-1 rounded hover:bg-gray-100 ${theme.sidebarText}`}
                            >
                                📂 Manage Saved Queries
                            </button>
                        </div>

                        {/* Primary Table Selection */}
                        <div className={`rounded-lg border ${theme.border} p-3 shadow-sm ${theme.sidebar}`}>
                            <label className={`block text-xs font-bold uppercase mb-2 ${theme.sidebarText}`}>1. Select Primary Table</label>
                            <input
                                type="text"
                                placeholder="Search tables..."
                                className={`w-full border rounded p-2 mb-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none ${theme.input} ${theme.border}`}
                                value={tableSearch}
                                onChange={(e) => setTableSearch(e.target.value)}
                            />
                            <div className={`border rounded h-32 overflow-y-auto ${theme.bg} ${theme.border}`}>
                                {tables.map(t => (
                                    <div
                                        key={t}
                                        onClick={() => handleTableSelect(t)}
                                        className={`px-3 py-2 cursor-pointer text-sm border-b last:border-b-0 transition-colors ${theme.border} ${primaryTable === t ? `${theme.primaryBtn} font-semibold` : `hover:bg-gray-100 ${theme.text}`}`}
                                    >
                                        {t}
                                    </div>
                                ))}
                            </div>
                            {primaryTable && <div className={`text-xs mt-2 flex items-center ${theme.accent}`}>✓ Selected: <span className="font-bold ml-1">{primaryTable}</span></div>}
                        </div>

                        {/* Joins Section */}
                        {primaryTable && (
                            <div className={`rounded-lg border ${theme.border} p-3 shadow-sm ${theme.sidebar}`}>
                                <div className="flex justify-between items-center mb-3">
                                    <label className={`block text-xs font-bold uppercase ${theme.sidebarText}`}>2. Connections (Joins)</label>
                                    <button onClick={addJoin} className={`text-xs px-2 py-1 rounded border transition-colors ${theme.secondaryBtn} ${theme.border}`}>+ Add</button>
                                </div>
                                <div className="space-y-3">
                                    {joins.map((join, idx) => {
                                        const leftCols = getAvailableLeftColumns(idx);
                                        const rightCols = join.table && columns[join.table] ? columns[join.table] : [];

                                        // Compatibility Check
                                        let compatibility = null;
                                        let fixSuggestion = null;

                                        if (join.leftCol && join.rightCol) {
                                            const leftType = leftCols.find(c => c.name === join.leftCol)?.type;
                                            const rightType = rightCols.find(c => c.name === join.rightCol)?.type;

                                            if (leftType && rightType) {
                                                if (leftType === rightType) {
                                                    compatibility = 'valid';
                                                } else {
                                                    compatibility = 'warning';
                                                    if (leftType === 'NUMBER' && (rightType === 'VARCHAR2' || rightType === 'CHAR')) fixSuggestion = 'TO_CHAR_LEFT';
                                                    else if ((leftType === 'VARCHAR2' || leftType === 'CHAR') && rightType === 'NUMBER') fixSuggestion = 'TO_CHAR_RIGHT';
                                                }
                                            }
                                        }

                                        return (
                                            <div key={idx} className={`p-3 rounded border space-y-2 relative group ${theme.bg} ${theme.border}`}>
                                                <div className="flex space-x-2">
                                                    <select
                                                        className={`border rounded text-xs py-1 px-2 w-1/3 ${theme.input} ${theme.border}`}
                                                        value={join.type}
                                                        onChange={(e) => updateJoin(idx, 'type', e.target.value)}
                                                    >
                                                        <option value="INNER">INNER</option>
                                                        <option value="LEFT">LEFT</option>
                                                        <option value="RIGHT">RIGHT</option>
                                                    </select>
                                                    <select
                                                        className={`border rounded text-xs py-1 px-2 w-2/3 ${theme.input} ${theme.border}`}
                                                        value={join.table}
                                                        onChange={(e) => updateJoin(idx, 'table', e.target.value)}
                                                    >
                                                        <option value="">Link Table...</option>
                                                        {tables.filter(t => t !== primaryTable).map(t => <option key={t} value={t}>{t}</option>)}
                                                    </select>
                                                </div>

                                                {join.table && (
                                                    <div className="flex flex-col space-y-2">
                                                        <div className="flex items-center space-x-1">
                                                            <select
                                                                className={`w-full text-xs border rounded py-1 px-2 ${theme.input} ${theme.border}`}
                                                                value={join.leftCol}
                                                                onChange={(e) => updateJoin(idx, 'leftCol', e.target.value)}
                                                            >
                                                                <option value="">{primaryTable} Col...</option>
                                                                {leftCols.map(c => <option key={c.name} value={c.name}>{c.name} ({c.type})</option>)}
                                                            </select>
                                                        </div>
                                                        <div className="text-center text-gray-400 text-xs font-bold">=</div>
                                                        <div className="flex items-center space-x-1">
                                                            <select
                                                                className={`w-full text-xs border rounded py-1 px-2 ${theme.input} ${theme.border}`}
                                                                value={join.rightCol}
                                                                onChange={(e) => updateJoin(idx, 'rightCol', e.target.value)}
                                                            >
                                                                <option value="">{join.table} Col...</option>
                                                                {rightCols.map(c => <option key={c.name} value={c.name}>{c.name} ({c.type})</option>)}
                                                            </select>
                                                        </div>
                                                    </div>
                                                )}

                                                {compatibility === 'valid' && <div className="text-xs text-green-600 flex items-center mt-1">✓ Types match</div>}
                                                {compatibility === 'warning' && !join.conversion && (
                                                    <div className="mt-2 bg-orange-50 p-2 rounded border border-orange-100">
                                                        <div className="text-xs text-orange-600 font-semibold flex items-center">⚠ Type Mismatch</div>
                                                        {fixSuggestion && (
                                                            <button
                                                                onClick={() => applySmartFix(idx, fixSuggestion)}
                                                                className="mt-1 w-full bg-orange-100 hover:bg-orange-200 text-orange-800 py-1 rounded text-xs transition-colors"
                                                            >
                                                                Auto-Fix (Convert)
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                                {join.conversion && <div className="text-xs text-blue-600 mt-1">✨ Fix applied: {join.conversion}</div>}

                                                <button onClick={() => removeJoin(idx)} className="absolute top-1 right-1 text-gray-400 hover:text-red-500 p-1">×</button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Columns Section */}
                        {primaryTable && (
                            <div className={`rounded-lg border ${theme.border} p-3 shadow-sm ${theme.sidebar}`}>
                                <label className={`block text-xs font-bold uppercase mb-2 ${theme.sidebarText}`}>3. Select Columns</label>
                                <div className={`max-h-48 overflow-y-auto border rounded p-2 space-y-2 ${theme.bg} ${theme.border}`}>
                                    {/* Primary Table Columns */}
                                    <div>
                                        <div className={`font-bold text-xs mb-1 sticky top-0 py-1 ${theme.text} ${theme.bg}`}>{primaryTable}</div>
                                        {columns[primaryTable]?.map(col => (
                                            <label key={`${primaryTable}.${col.name}`} className="flex items-center px-2 py-1 hover:bg-gray-200 rounded cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedColumns.includes(`${primaryTable}.${col.name}`)}
                                                    onChange={() => handleColumnToggle(primaryTable, col.name)}
                                                    className="mr-2 rounded text-blue-600 focus:ring-blue-500"
                                                />
                                                <span className={`text-xs ${theme.text}`}>{col.name}</span>
                                            </label>
                                        ))}
                                    </div>

                                    {/* Joined Tables Columns */}
                                    {joins.map((join, idx) => (
                                        join.table && columns[join.table] && (
                                            <div key={idx} className={`border-t pt-2 mt-2 ${theme.border}`}>
                                                <div className={`font-bold text-xs mb-1 sticky top-0 py-1 ${theme.text} ${theme.bg}`}>{join.table}</div>
                                                {columns[join.table].map(col => (
                                                    <label key={`${join.table}.${col.name}`} className="flex items-center px-2 py-1 hover:bg-gray-200 rounded cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedColumns.includes(`${join.table}.${col.name}`)}
                                                            onChange={() => handleColumnToggle(join.table, col.name)}
                                                            className="mr-2 rounded text-blue-600 focus:ring-blue-500"
                                                        />
                                                        <span className={`text-xs ${theme.text}`}>{col.name}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        )
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Filters Section */}
                        {primaryTable && (
                            <div className={`rounded-lg border ${theme.border} p-3 shadow-sm ${theme.sidebar}`}>
                                <div className="flex justify-between items-center mb-2">
                                    <label className={`block text-xs font-bold uppercase ${theme.sidebarText}`}>4. Filters</label>
                                    <button onClick={addFilter} className={`text-xs px-2 py-1 rounded border ${theme.secondaryBtn} ${theme.border}`}>+ Add</button>
                                </div>
                                <div className="space-y-2">
                                    {filters.map((filter, idx) => (
                                        <div key={idx} className={`flex flex-col space-y-1 p-2 rounded border relative ${theme.bg} ${theme.border}`}>
                                            <select
                                                className={`text-xs border rounded py-1 px-2 ${theme.input} ${theme.border}`}
                                                value={filter.column}
                                                onChange={(e) => updateFilter(idx, 'column', e.target.value)}
                                            >
                                                <option value="">Column...</option>
                                                {getAllColumns().map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                            <div className="flex space-x-1">
                                                <select
                                                    className={`text-xs border rounded w-1/3 py-1 px-2 ${theme.input} ${theme.border}`}
                                                    value={filter.operator}
                                                    onChange={(e) => updateFilter(idx, 'operator', e.target.value)}
                                                >
                                                    <option value="=">=</option>
                                                    <option value=">">&gt;</option>
                                                    <option value="<">&lt;</option>
                                                    <option value="LIKE">LIKE</option>
                                                </select>
                                                <input
                                                    type="text"
                                                    className={`text-xs border rounded w-2/3 py-1 px-2 ${theme.input} ${theme.border}`}
                                                    placeholder="Value"
                                                    value={filter.value}
                                                    onChange={(e) => updateFilter(idx, 'value', e.target.value)}
                                                />
                                            </div>
                                            <button onClick={() => removeFilter(idx)} className="absolute top-1 right-1 text-gray-400 hover:text-red-500 p-1">×</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Save Query Section */}
                        {primaryTable && (
                            <div className={`rounded-lg border ${theme.border} p-3 shadow-sm ${theme.sidebar}`}>
                                <label className={`block text-xs font-bold uppercase mb-2 ${theme.sidebarText}`}>Save Query</label>
                                <div className="flex space-x-2">
                                    <button onClick={() => setShowSaveModal(true)} className={`w-full text-xs px-2 py-2 rounded ${theme.primaryBtn}`}>💾 Save Query</button>
                                </div>
                            </div>
                        )}

                        <button
                            onClick={executeQuery}
                            disabled={!primaryTable || loading}
                            className={`w-full py-3 rounded-lg shadow-md transition-all font-semibold disabled:opacity-50 ${theme.primaryBtn}`}
                        >
                            {loading ? 'Running Query...' : 'Run Query'}
                        </button>
                    </div>
                )}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col h-full overflow-hidden relative">
                {/* Header */}
                <div className={`p-4 shadow-sm flex justify-between items-center z-10 ${theme.header}`}>
                    <h1 className={`text-xl font-bold ${theme.headerText}`}>Results Explorer</h1>
                    {results && (
                        <div className="flex space-x-2">
                            <button onClick={() => handleExport('csv')} className={`flex items-center space-x-1 px-3 py-1.5 rounded shadow-sm transition-colors text-sm font-medium border ${theme.secondaryBtn} border-gray-300`}>
                                <span>CSV</span>
                            </button>
                            <button onClick={() => handleExport('xlsx')} className={`flex items-center space-x-1 px-3 py-1.5 rounded shadow-sm transition-colors text-sm font-medium ${theme.primaryBtn}`}>
                                <span>Excel</span>
                            </button>
                            <button onClick={() => handleExport('txt')} className={`flex items-center space-x-1 px-3 py-1.5 rounded shadow-sm transition-colors text-sm font-medium border ${theme.secondaryBtn} border-gray-300`}>
                                <span>TXT</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* Results Table Area */}
                <div className={`flex-1 overflow-auto p-4 ${theme.bg}`}>
                    {error && (
                        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4 rounded shadow-sm">
                            <div className="flex">
                                <div className="flex-shrink-0">
                                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                    </svg>
                                </div>
                                <div className="ml-3">
                                    <p className="text-sm text-red-700">{error}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {results ? (
                        <div className={`rounded-lg shadow-md border overflow-hidden flex flex-col h-full ${theme.sidebar} ${theme.border}`}>
                            {/* Table Container with Horizontal Scroll */}
                            <div className="flex-1 overflow-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className={`sticky top-0 z-10 ${theme.tableHeader}`}>
                                        <tr>
                                            {results.metaData.map(m => (
                                                <th key={m.name} className={`px-6 py-3 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap border-b ${theme.border}`}>
                                                    {m.name}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className={`divide-y divide-gray-200 ${theme.sidebar}`}>
                                        {paginatedRows.map((row, i) => (
                                            <tr key={i} className={`transition-colors ${theme.tableRowHover}`}>
                                                {row.map((cell, j) => (
                                                    <td key={j} className={`px-6 py-4 whitespace-nowrap text-sm border-r last:border-r-0 ${theme.border} ${theme.sidebarText}`}>
                                                        {cell}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination Footer */}
                            <div className={`px-4 py-3 border-t flex items-center justify-between sm:px-6 ${theme.bg} ${theme.border}`}>
                                <div className="flex-1 flex justify-between sm:hidden">
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        Previous
                                    </button>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        Next
                                    </button>
                                </div>
                                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                                    <div className="flex items-center gap-4">
                                        <p className={`text-sm ${theme.sidebarText}`}>
                                            Showing <span className="font-medium">{(currentPage - 1) * rowsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * rowsPerPage, results.rows.length)}</span> of <span className="font-medium">{results.rows.length}</span> results
                                        </p>
                                        <select
                                            value={rowsPerPage}
                                            onChange={(e) => {
                                                setRowsPerPage(Number(e.target.value));
                                                setCurrentPage(1);
                                            }}
                                            className="text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                                        >
                                            <option value={10}>10 per page</option>
                                            <option value={25}>25 per page</option>
                                            <option value={50}>50 per page</option>
                                            <option value={100}>100 per page</option>
                                            <option value={results.rows.length}>All</option>
                                        </select>
                                    </div>
                                    <div>
                                        <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                                            <button
                                                onClick={() => setCurrentPage(1)}
                                                disabled={currentPage === 1}
                                                className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                                            >
                                                First
                                            </button>
                                            <button
                                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                disabled={currentPage === 1}
                                                className="relative inline-flex items-center px-2 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                                            >
                                                Previous
                                            </button>
                                            <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                                                Page {currentPage} of {totalPages}
                                            </span>
                                            <button
                                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                                disabled={currentPage === totalPages}
                                                className="relative inline-flex items-center px-2 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                                            >
                                                Next
                                            </button>
                                            <button
                                                onClick={() => setCurrentPage(totalPages)}
                                                disabled={currentPage === totalPages}
                                                className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                                            >
                                                Last
                                            </button>
                                        </nav>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className={`text-center p-8 rounded-lg shadow-md ${theme.sidebar} ${theme.border}`}>
                            <p className={`text-lg font-semibold ${theme.sidebarText}`}>No results to display.</p>
                            <p className={`text-sm text-gray-500 mt-2`}>Run a query to see results here.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Saved Queries Modal */}
            {showSavedQueries && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl w-96 max-h-[80vh] flex flex-col">
                        <div className="p-4 border-b flex justify-between items-center">
                            <h3 className="font-bold text-lg">Saved Queries</h3>
                            <button onClick={() => setShowSavedQueries(false)} className="text-gray-500 hover:text-gray-700">×</button>
                        </div>
                        <div className="p-4 overflow-y-auto flex-1">
                            {savedQueries.length === 0 ? (
                                <p className="text-gray-500 text-center text-sm">No saved queries yet.</p>
                            ) : (
                                <div className="space-y-2">
                                    {savedQueries.map(q => (
                                        <div key={q.id} className="border rounded p-3 hover:bg-gray-50 flex justify-between items-center">
                                            <div>
                                                <div className="font-bold text-sm">{q.name}</div>
                                                <div className="text-xs text-gray-500">{q.date}</div>
                                            </div>
                                            <div className="flex space-x-2">
                                                <button onClick={() => loadQuery(q)} className="text-blue-600 hover:text-blue-800 text-xs font-semibold">Load</button>
                                                <button onClick={() => deleteQuery(q.id)} className="text-red-500 hover:text-red-700 text-xs">Delete</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Save Query Name Modal */}
            {showSaveModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl w-96 p-6">
                        <h3 className="font-bold text-lg mb-4">Save Query</h3>
                        <input
                            type="text"
                            placeholder="Enter query name..."
                            className="w-full border rounded p-2 mb-4 focus:ring-2 focus:ring-blue-500 outline-none"
                            value={queryName}
                            onChange={(e) => setQueryName(e.target.value)}
                        />
                        <div className="flex justify-end space-x-2">
                            <button onClick={() => setShowSaveModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
                            <button onClick={saveQuery} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default QueryBuilder;
