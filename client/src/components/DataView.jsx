import React, { useState, useMemo } from 'react';

const DataView = ({ viewData, dataFilters, setDataFilters, dataSort, setDataSort, onSend, setInput, isDrillDown = false }) => {
    if (!viewData && !Array.isArray(viewData)) return <div className="p-4 text-gray-500">Nenhum dado para exibir.</div>;

    let rows = [];
    let columns = [];

    if (viewData.metaData && viewData.rows) {
        columns = viewData.metaData.map(m => m.name);
        rows = viewData.rows;
    } else if (Array.isArray(viewData) && viewData.length > 0) {
        rows = viewData;
        columns = Object.keys(rows[0]);
    } else {
        return <div className="p-4 text-gray-500">Nenhum dado encontrado.</div>;
    }

    // --- FILTER & SORT LOGIC (Memoized) ---
    const processedRows = useMemo(() => {
        if (!viewData) return [];
        let rows = [];
        let columns = [];

        if (viewData.metaData && viewData.rows) {
            columns = viewData.metaData.map(m => m.name);
            rows = viewData.rows;
        } else if (Array.isArray(viewData) && viewData.length > 0) {
            rows = viewData;
            columns = Object.keys(rows[0]);
        } else {
            return [];
        }


        // 1. Filter
        let filtered = rows;
        if (!isDrillDown) { // Only filter locally if NOT drillDown (server handles drilldown filters)
            filtered = rows.filter(row => {
                return columns.every((col, colIdx) => {
                    const filterVal = dataFilters[col] ? dataFilters[col].toLowerCase() : '';
                    if (!filterVal) return true;

                    const cellVal = Array.isArray(row) ? row[colIdx] : row[col];
                    const strVal = cellVal === null || cellVal === undefined ? '' : String(cellVal).toLowerCase();
                    return strVal.includes(filterVal);
                });
            });
        }

        // 2. Sort
        if (dataSort.key) {
            const colIdx = columns.indexOf(dataSort.key);
            filtered.sort((a, b) => {
                const valA = Array.isArray(a) ? a[colIdx] : a[dataSort.key];
                const valB = Array.isArray(b) ? b[colIdx] : b[dataSort.key];

                if (valA === valB) return 0;
                if (valA === null || valA === undefined) return 1;
                if (valB === null || valB === undefined) return -1;

                // Try numeric sort
                const numA = Number(valA);
                const numB = Number(valB);
                if (!isNaN(numA) && !isNaN(numB)) {
                    return dataSort.direction === 'asc' ? numA - numB : numB - numA;
                }

                // String sort
                return dataSort.direction === 'asc'
                    ? String(valA).localeCompare(String(valB))
                    : String(valB).localeCompare(String(valA));
            });
        }

        return filtered;
    }, [viewData, dataFilters, dataSort]);

    const handleSort = (col) => {
        setDataSort(prev => ({
            key: col,
            direction: prev.key === col && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const handleFilterChange = (col, val) => {
        setDataFilters(prev => ({ ...prev, [col]: val }));
    };

    const formatCell = (val) => {
        if (val === null || val === undefined) return <span className="text-gray-300 italic">null</span>;
        if (typeof val === 'object') return JSON.stringify(val);
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
            const date = new Date(val);
            if (!isNaN(date.getTime())) {
                const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0; // Check if valid time component
                return date.toLocaleString('pt-BR', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: hasTime ? '2-digit' : undefined,
                    minute: hasTime ? '2-digit' : undefined,
                    second: hasTime ? '2-digit' : undefined
                });
            }
        }
        return val;
    };

    const handleRemoteFilter = async (e) => {
        if (e.key === 'Enter' && onSend && setInput && !isDrillDown) {
            // Synthesize a prompt for the AI based on active filters
            const activeFilters = Object.entries(dataFilters)
                .filter(([_, val]) => val && val.trim() !== '')
                .map(([col, val]) => `${col} = "${val}"`)
                .join(", ");

            if (activeFilters.length > 0) {
                const prompt = `Filtre a tabela ${viewData.tableName || 'consulta'} onde: ${activeFilters}`;
                setInput(prompt); // Show in chat box
                await onSend(prompt); // Send to AI
            }
        }
    };

    if (!viewData || !rows) return <div className="p-4 text-gray-400">Nenhum dado para exibir.</div>;

    const isTruncated = rows.length >= 500;

    return (
        <div className="flex flex-col h-full bg-white relative">
            {/* TRUNCATION BANNER */}
            {isTruncated && !isDrillDown && (
                <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex justify-between items-center animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center gap-2 text-amber-800 text-xs font-semibold">
                        <span className="bg-amber-100 p-1 rounded">⚠️</span>
                        <span>Exibindo os primeiros 500 registros (Limite de Segurança)</span>
                    </div>
                    {window.dispatchEvent && (
                        <button
                            onClick={() => {
                                if (viewData.sql) {
                                    window.dispatchEvent(new CustomEvent('hap-run-sql', { detail: { query: viewData.sql } }));
                                } else {
                                    alert("SQL original não disponível.");
                                }
                            }}
                            className="bg-amber-100 hover:bg-amber-200 text-amber-900 px-3 py-1 rounded text-xs font-bold transition-colors flex items-center gap-1 border border-amber-200"
                        >
                            <span>⚡ Ver Tudo no Editor SQL</span>
                        </button>
                    )}
                </div>
            )}

            <div className="flex-1 overflow-auto custom-scroll relative">
                <table className="min-w-full divide-y divide-gray-200 border-collapse">
                    <thead className="bg-gray-50 sticky top-0 z-20 shadow-sm">
                        <tr>
                            {columns.map(col => (
                                <th key={col} className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider border-b border-gray-200 bg-gray-50 min-w-[150px]">
                                    <div className="flex flex-col gap-2">
                                        {/* Sortable Header */}
                                        <div
                                            className="flex items-center cursor-pointer hover:text-blue-600 transition-colors"
                                            onClick={() => handleSort(col)}
                                        >
                                            <span>{col}</span>
                                            <span className="ml-2 text-gray-400">
                                                {dataSort.key === col ? (dataSort.direction === 'asc' ? '▲' : '▼') : '⇅'}
                                            </span>
                                        </div>
                                        {/* Filter Input */}
                                        <input
                                            type="text"
                                            placeholder={`Filtrar ${col}...`}
                                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-blue-400 outline-none font-normal"
                                            value={dataFilters[col] || ''}
                                            onChange={(e) => handleFilterChange(col, e.target.value)}
                                            onKeyDown={handleRemoteFilter}
                                            disabled={false}
                                            title="Filtrar localmente"
                                        />
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {processedRows.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} className="px-6 py-10 text-center text-gray-500">
                                    Nenhum registro encontrado com os filtros atuais.
                                </td>
                            </tr>
                        ) : (
                            processedRows.map((row, i) => (
                                <tr key={i} className="hover:bg-blue-50 transition-colors group">
                                    {columns.map((col, colIdx) => {
                                        const cellVal = Array.isArray(row) ? row[colIdx] : row[col];
                                        return (
                                            <td key={colIdx} className="px-6 py-3 whitespace-nowrap text-sm text-gray-700 border-r border-transparent group-hover:border-gray-100 last:border-r-0">
                                                {formatCell(cellVal)}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-3">
                <span className="text-xs text-gray-500 font-medium">
                    Mostrando {processedRows.length} registros
                    {isTruncated && !isDrillDown && <span className="text-amber-600 ml-1">(Parcial)</span>}
                </span>

                <div className="flex items-center gap-2">
                    {/* Open SQL Button (Only if not in drilldown) */}
                    {!isDrillDown && (
                        <button
                            onClick={() => {
                                if (viewData.sql) {
                                    window.dispatchEvent(new CustomEvent('hap-run-sql', { detail: { query: viewData.sql } }));
                                } else {
                                    alert("SQL original indisponível.");
                                }
                            }}
                            className="bg-white hover:bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border border-gray-300 shadow-sm flex items-center gap-1.5"
                            title="Abrir no Editor SQL para análise avançada"
                        >
                            <span>⚡ Abrir SQL</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DataView;
