import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, Search, CheckCircle, AlertCircle, Loader2, Table as TableIcon, Columns, Play, Filter, X, ChevronDown, ChevronRight, Eye, Wand2 } from 'lucide-react';
import DataView from './DataView';
import { FixedSizeList as List } from 'react-window';

const SmartAnalysisPanel = ({
    resolverData,
    resultData,
    isActive,
    onAction
}) => {
    // Local state
    const [selectedColumns, setSelectedColumns] = useState({});
    const [showAllColumns, setShowAllColumns] = useState(false);
    const [isThinking, setIsThinking] = useState(false);

    // Initial Selection Logic (Strict & Smart)
    useEffect(() => {
        if (resolverData?.type === 'column') {
            const initial = {};
            let hasSuggested = false;

            if (Array.isArray(resolverData.data)) {
                resolverData.data.forEach(col => {
                    const colName = typeof col === 'object' ? (col.COLUMN_NAME || col.name) : col;
                    const meta = typeof col === 'object' ? col : {};

                    // Only auto-select if it is SUGGESTED (Exact match or high confidence)
                    if (colName && meta.suggested) {
                        initial[colName] = true;
                        hasSuggested = true;
                    }
                });
            }
            setSelectedColumns(initial);

            // If we have suggested columns, default to strict view. If not, ALWAYS SHOW ALL.
            setShowAllColumns(!hasSuggested || Object.keys(initial).length === 0);
            console.log("SmartAnalysis Init:", { hasSuggested, count: resolverData.data?.length });
        }
    }, [resolverData]);

    // Reset loading state when results arrive
    useEffect(() => {
        if (resultData) {
            setIsThinking(false);
        }
    }, [resultData]);

    if (!isActive) return null;

    const toggleColumn = (colName) => {
        setSelectedColumns(prev => ({ ...prev, [colName]: !prev[colName] }));
    };

    const handleConfirmColumns = () => {
        setIsThinking(true);
        const selected = Object.keys(selectedColumns).filter(k => selectedColumns[k]);

        // Pass the search term context if available
        let actionPayload = selected.join(', ');
        if (resolverData?.searchTerm) {
            actionPayload += ` | FILTER: ${resolverData.searchTerm}`;
        }

        onAction('confirm_columns', actionPayload);
    };

    // Filter Logic
    const DisplayedColumns = useMemo(() => {
        if (!resolverData?.data) return [];
        return resolverData.data.filter(col => {
            const meta = typeof col === 'object' ? col : {};
            if (showAllColumns) return true;
            return meta.suggested; // Strict Mode
        });
    }, [resolverData, showAllColumns]);

    return (
        <div className="h-full flex flex-col bg-gray-50 border-l border-gray-200 shadow-xl overflow-hidden animate-in slide-in-from-right-4 duration-500">
            {/* 1. Header Section */}
            <div className="p-5 border-b border-gray-100 bg-white flex items-center justify-between shrink-0 z-10">
                <div>
                    <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <div className="p-1.5 bg-violet-100 text-violet-600 rounded-lg">
                            <SparklesIcon className="w-5 h-5" />
                        </div>
                        Análise Inteligente
                    </h2>
                    <p className="text-xs text-gray-500 mt-1 ml-1">
                        O assistente verifica a estrutura do banco para você.
                    </p>
                </div>
                <button
                    onClick={() => onAction('close')}
                    className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* 2. Content Area */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden relative scroll-smooth">

                {/* STATE: IDLE */}
                {!resolverData && !resultData && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 opacity-60">
                        <div className="bg-white p-6 rounded-full shadow-sm border border-gray-100 mb-4 animate-pulse">
                            <Search className="w-12 h-12 text-violet-200" />
                        </div>
                        <p className="font-medium">Aguardando solicitação...</p>
                    </div>
                )}

                <div className="p-6 space-y-6">

                    {/* STATE: TABLE SUGGESTIONS */}
                    {resolverData?.type === 'table' && !resultData && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                                    <Database className="w-4 h-4 text-gray-400" />
                                    Tabelas Recomendadas
                                </h3>
                                <span className="text-[10px] font-bold bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">
                                    {resolverData.data.length} Opções
                                </span>
                            </div>

                            <div className="grid grid-cols-1 gap-3">
                                {resolverData.data.map((table, idx) => (
                                    <motion.div
                                        key={idx}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.1 }}
                                        onClick={() => onAction('select_table', table)}
                                        className="group relative bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-lg hover:border-violet-300 cursor-pointer transition-all duration-300"
                                    >
                                        <div className="flex items-start gap-4">
                                            <div className="p-3 bg-gray-50 rounded-xl group-hover:bg-violet-50 transition-colors">
                                                <TableIcon className="w-6 h-6 text-gray-400 group-hover:text-violet-600 transition-colors" />
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center justify-between mb-1">
                                                    <h4 className="font-bold text-gray-800 group-hover:text-violet-700 transition-colors">
                                                        {table.table_name}
                                                    </h4>
                                                    {table.owner && (
                                                        <span className="text-[10px] uppercase font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded border border-gray-200">
                                                            {table.owner}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-gray-500 line-clamp-2">
                                                    {table.comments || table.full_name}
                                                </p>
                                            </div>
                                            <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-violet-500 transform group-hover:translate-x-1 transition-all" />
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* STATE: COLUMN ANALYSIS */}
                    {resolverData?.type === 'column' && !resultData && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

                            {/* Pinned Context */}
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="bg-white p-4 rounded-xl border border-violet-100 shadow-sm relative overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 w-20 h-20 bg-violet-50 rounded-bl-full -mr-4 -mt-4 opacity-50 pointer-events-none" />
                                <div className="flex flex-col gap-2 relative z-10">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-violet-100 rounded-lg">
                                            <Database className="w-5 h-5 text-violet-600" />
                                        </div>
                                        <div>
                                            <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Tabela Selecionada</span>
                                            <h3 className="font-bold text-gray-800 text-lg leading-tight">
                                                {resolverData.contextText?.match(/\*\*(.*?)\*\*/)?.[1] || "Tabela"}
                                            </h3>
                                        </div>
                                    </div>

                                    {/* [NEW] Show Search Term Context */}
                                    {resolverData?.searchTerm && (
                                        <div className="mt-2 flex items-center gap-2 text-xs text-violet-700 bg-violet-50 px-3 py-1.5 rounded-md border border-violet-100 w-fit">
                                            <Search className="w-3 h-3" />
                                            <span className="font-medium">Filtrando por:</span>
                                            <span className="font-bold">"{resolverData.searchTerm}"</span>
                                        </div>
                                    )}
                                </div>
                            </motion.div>

                            {/* Column Selection */}
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col max-h-[500px]">
                                <div className="p-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                                    <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                                        <Columns className="w-4 h-4 text-violet-500" />
                                        Colunas ({DisplayedColumns.length})
                                    </h3>
                                    <button
                                        onClick={() => setShowAllColumns(!showAllColumns)}
                                        className={`text-xs px-2 py-1 rounded transition-colors ${showAllColumns ? 'bg-gray-200 text-gray-700' : 'bg-transparent text-gray-500 hover:text-violet-600'}`}
                                    >
                                        {showAllColumns ? 'Ocultar Não-Sugeridas' : 'Ver Todas'}
                                    </button>
                                </div>

                                <div className="overflow-y-auto p-2 space-y-1 custom-scroll">
                                    {DisplayedColumns.length === 0 && (
                                        <div className="py-8 text-center text-gray-400 text-sm">
                                            Nenhuma coluna correspondente encontrada.
                                            <br />
                                            <span
                                                className="text-violet-600 cursor-pointer hover:underline"
                                                onClick={() => setShowAllColumns(true)}
                                            >
                                                Ver todas as colunas
                                            </span>
                                        </div>
                                    )}

                                    {DisplayedColumns.map((col, idx) => {
                                        const colName = typeof col === 'object' ? (col.COLUMN_NAME || col.name) : col;
                                        if (!colName) return null;
                                        const isSelected = selectedColumns[colName];
                                        const meta = typeof col === 'object' ? col : {};

                                        return (
                                            <motion.div
                                                key={colName}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: idx * 0.03 }}
                                                onClick={() => toggleColumn(colName)}
                                                className={`
                                                    p-2.5 rounded-lg flex items-center justify-between cursor-pointer border transition-all
                                                    ${isSelected
                                                        ? 'bg-violet-50 border-violet-200 shadow-sm'
                                                        : 'bg-white border-transparent hover:bg-gray-50 hover:border-gray-200'}
                                                `}
                                            >
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div className={`
                                                        w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0
                                                        ${isSelected ? 'bg-violet-600 border-violet-600' : 'border-gray-300 bg-white'}
                                                     `}>
                                                        {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
                                                    </div>
                                                    <div className="truncate">
                                                        <p className={`text-sm font-mono truncate ${isSelected ? 'text-violet-900 font-semibold' : 'text-gray-600'}`}>
                                                            {colName}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 shrink-0">
                                                    {meta.suggested && (
                                                        <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-wide">
                                                            Match
                                                        </span>
                                                    )}
                                                    {meta.DATA_TYPE && (
                                                        <span className="text-[9px] text-gray-400 font-mono">
                                                            {meta.DATA_TYPE}
                                                        </span>
                                                    )}
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>

                                <div className="p-3 border-t border-gray-100 bg-gray-50/50">
                                    <button
                                        onClick={handleConfirmColumns}
                                        disabled={isThinking}
                                        className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white rounded-lg font-medium shadow-lg shadow-violet-200/50 transition-all flex items-center justify-center gap-2"
                                    >
                                        {isThinking ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Processando...
                                            </>
                                        ) : (
                                            <>
                                                <Search className="w-4 h-4" />
                                                Consultar Registros
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* 3. Result Grid Area (Overlays or appends) */}
                {resultData && (
                    <div className="absolute inset-0 bg-white z-20 flex flex-col animate-in fade-in zoom-in-95 duration-300">
                        <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-white shadow-sm shrink-0 gap-3">
                            <div className="flex-1 flex items-center gap-2">
                                <button
                                    onClick={() => onAction('close_results')}
                                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-violet-600 transition-colors flex items-center gap-1 text-xs font-medium"
                                    title="Voltar para seleção de colunas"
                                >
                                    <ChevronRight className="w-4 h-4 rotate-180" />
                                    Voltar
                                </button>

                                <div className="h-6 w-px bg-gray-200 mx-1" />

                                <h3 className="font-bold text-gray-800 flex items-center gap-2 text-sm whitespace-nowrap">
                                    <Database className="w-4 h-4 text-green-600" />
                                    Resultados
                                    <span className="bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded-full font-mono">
                                        {resultData?.rows?.length || 0}
                                    </span>
                                </h3>
                            </div>

                            {/* [NEW] Editable Search Field */}
                            <div className="flex-1 max-w-xs flex items-center gap-2">
                                <div className="relative flex-1">
                                    <Search className="w-3 h-3 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        placeholder="Filtrar valor..."
                                        defaultValue={resolverData?.searchTerm || ""}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                const val = e.target.value;
                                                // Trigger new search in same context
                                                onAction('update_search_value', { value: val, context: resolverData });
                                            }
                                        }}
                                        className="w-full pl-7 pr-2 py-1 h-8 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400 bg-gray-50 focus:bg-white transition-all"
                                    />
                                </div>
                            </div>

                            <button
                                onClick={() => onAction('close')}
                                className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-red-500 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-hidden relative">
                            {/* [NEW] Use DataView instead of SimpleResultGrid */}
                            <DataView
                                viewData={resultData}
                                dataFilters={{}} // Local state managing handled inside DataView usually or passed down
                                setDataFilters={() => { }}
                                dataSort={{}}
                                setDataSort={() => { }}
                                onSend={() => { }}
                                setInput={() => { }}
                                isDrillDown={true} // Simplified view
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// Simplified Result Grid Component for Professional Look
const SimpleResultGrid = ({ data }) => {
    if (!data || !data.rows || data.rows.length === 0) return (
        <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Search className="w-10 h-10 mb-2 opacity-20" />
            <p>Nenhum dado retornado para esta consulta.</p>
        </div>
    );

    const columns = data.metaData ? data.metaData.map(m => m.name) : Object.keys(data.rows[0] || {});

    return (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            {columns.map((col, i) => (
                                <th key={i} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                                    {col}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {data.rows.slice(0, 100).map((row, idx) => (
                            <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                {columns.map((col, colIdx) => {
                                    const val = Array.isArray(row) ? row[colIdx] : row[col];
                                    return (
                                        <td key={colIdx} className="px-6 py-3 whitespace-nowrap text-sm text-gray-700">
                                            {val === null ? <span className="text-gray-300 italic">null</span> : String(val)}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {data.rows.length > 100 && (
                <div className="p-3 text-center text-xs text-gray-500 bg-gray-50 border-t border-gray-200">
                    Exibindo os primeiros 100 registros.
                </div>
            )}
        </div>
    );
};

const SparklesIcon = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
    </svg>
);

export default SmartAnalysisPanel;
