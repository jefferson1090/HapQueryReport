import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, Table, Columns, Check, Search, ArrowRight } from 'lucide-react';

const SmartResolver = ({ isVisible, resolverData, onSelection }) => {
    if (!isVisible) return null;

    const { type, data, contextText } = resolverData || { type: 'IDLE', data: [], contextText: '' };

    const handleSelect = (item) => {
        // Dispatch event back to Chat loop
        const value = type === 'table' ? (item.full_name || item.table_name) : item;
        const protocol = type === 'table' ? '[SYSTEM_SELECTION_TABLE]' : '[SELECTION_COLUMN]';

        const fullMessage = `${protocol} ${value}`;

        window.dispatchEvent(new CustomEvent('hap-trigger-chat-input', {
            detail: { text: fullMessage, autoSend: true }
        }));
    };

    return (
        <div className="h-full w-full bg-gray-50 flex flex-col p-8 overflow-hidden animate-fade-in relative">

            {/* HEADER */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                    <span className="p-2 bg-blue-600 rounded-xl text-white shadow-lg shadow-blue-200">
                        {type === 'table' ? <Database /> : <Columns />}
                    </span>
                    {type === 'table' ? 'Selecione a Tabela' : 'Selecione a Coluna'}
                </h1>
                <p className="text-gray-500 mt-2 text-lg">
                    {contextText || (type === 'table'
                        ? "A IA encontrou múltiplas tabelas. Qual delas você deseja consultar?"
                        : "Qual coluna contém a informação que você busca?")}
                </p>
            </div>

            {/* CONTENT GRID */}
            <div className="flex-1 overflow-y-auto pr-2">

                {/* TABLE SELECTION MODE */}
                {type === 'table' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {data.map((table, idx) => (
                            <motion.button
                                key={idx}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                onClick={() => handleSelect(table)}
                                className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-300 hover:ring-2 hover:ring-blue-100 transition-all text-left group flex flex-col h-full"
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className="p-3 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                        <Table size={24} />
                                    </div>
                                    <span className="text-xs font-mono text-gray-400 border px-2 py-1 rounded bg-gray-50">
                                        {table.owner}
                                    </span>
                                </div>

                                <h3 className="text-lg font-bold text-gray-800 break-all mb-2 group-hover:text-blue-700">
                                    {table.table_name}
                                </h3>

                                <p className="text-sm text-gray-500 line-clamp-2 flex-1">
                                    {table.comments || "Sem descrição disponível."}
                                </p>

                                <div className="mt-4 pt-4 border-t border-gray-50 flex items-center text-blue-600 font-bold text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                                    Selecionar <ArrowRight size={16} className="ml-2" />
                                </div>
                            </motion.button>
                        ))}
                    </div>
                )}

                {/* COLUMN SELECTION MODE */}
                {type === 'column' && (
                    <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 min-h-[50%]">
                        <div className="flex flex-wrap gap-3">
                            {data.map((col, idx) => {
                                if (!col) return null;
                                const label = (typeof col === 'object') ? (col.name || col.COLUMN_NAME || JSON.stringify(col)) : col;
                                return (
                                    <motion.button
                                        key={idx}
                                        initial={{ scale: 0.9, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => handleSelect(label)}
                                        className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-all font-mono text-sm flex items-center gap-2"
                                    >
                                        <div className="w-2 h-2 rounded-full bg-gray-300"></div>
                                        {label}
                                    </motion.button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {data.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                        <Search size={48} className="mb-4 opacity-50" />
                        <p>Nenhuma opção encontrada para exibição.</p>
                    </div>
                )}

            </div>
        </div>
    );
};

export default SmartResolver;
