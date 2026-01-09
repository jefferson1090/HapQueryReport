import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Icons
const Icons = {
    Magic: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>,
    Search: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>,
    Check: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>,
    Copy: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
};

const SmartFindRecord = ({ isVisible, connection, savedQueries, onShowData }) => {
    if (!isVisible) return null;

    const [inputText, setInputText] = useState('');
    const [detectedType, setDetectedType] = useState(null); // 'CPF', 'EMAIL', 'ID', 'NAME'
    const [stats, setStats] = useState({ count: 0, valid: 0, distinct: 0 });
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Auto-Analysis Effect
    useEffect(() => {
        if (!inputText.trim()) {
            setDetectedType(null);
            setStats({ count: 0, valid: 0, distinct: 0 });
            return;
        }

        const lines = inputText.split('\n').filter(l => l.trim().length > 0);
        const count = lines.length;
        const distinct = new Set(lines.map(l => l.trim())).size;

        // Heuristics
        const sample = lines.slice(0, 5).join(' ');
        let type = 'GENERIC';
        let valid = 0;

        if (sample.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/) || sample.match(/\d{11}/)) {
            type = 'CPF';
            valid = lines.filter(l => l.replace(/\D/g, '').length === 11).length;
        } else if (sample.match(/@/)) {
            type = 'EMAIL';
            valid = lines.filter(l => l.includes('@')).length;
        } else if (sample.match(/^\d+$/)) {
            type = 'ID';
            valid = lines.filter(l => !isNaN(l)).length;
        } else {
            type = 'NAME'; // Generic Text
            valid = count;
        }

        setDetectedType(type);
        setStats({ count, valid, distinct });

    }, [inputText]);

    return (
        <div className="h-full w-full bg-gray-50 flex flex-col p-6 overflow-hidden animate-fade-in relative">

            {/* --- HEADER --- */}
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                        <span className="p-2 bg-blue-600 rounded-xl text-white shadow-lg shadow-blue-200">
                            <Icons.Magic />
                        </span>
                        Busca Inteligente
                    </h1>
                    <p className="text-gray-500 mt-1 ml-14">
                        Cole seus dados e deixe a IA identificar o padrão.
                    </p>
                </div>
            </div>

            {/* --- MAIN CONTENT: 3-COLUMN LAYOUT (Inspired by Visual Cards) --- */}
            <div className="flex-1 flex gap-6 overflow-hidden pb-4">

                {/* COL 1: INPUT ("Jogue os Dados") */}
                <div className="flex-1 bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col overflow-hidden group hover:shadow-md transition-all">
                    <div className="p-5 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center">
                        <h3 className="font-bold text-gray-700">1. Dados de Entrada</h3>
                        <span className="text-xs font-mono text-gray-400 bg-white px-2 py-1 rounded border">RAW INPUT</span>
                    </div>
                    <div className="flex-1 relative">
                        <textarea
                            className="w-full h-full p-6 resize-none focus:outline-none text-gray-600 font-mono text-sm bg-transparent"
                            placeholder={"Cole aqui sua lista...\n\nExemplo:\n123.456.789-00\n987.654.321-99\n..."}
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                        />
                        {inputText.length === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
                                <div className="text-center">
                                    <div className="text-6xl mb-4">📋</div>
                                    <p className="text-xs uppercase tracking-widest font-bold">Aguardando Colagem</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* COL 2: INTELLIGENCE (Visual Metrics) */}
                <div className="w-[300px] flex flex-col gap-4">

                    {/* Metric Card: Count */}
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex flex-col items-center justify-center text-center relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-blue-500"></div>
                        <span className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Itens Detectados</span>
                        <div className="text-5xl font-black text-gray-800 tracking-tight">
                            {stats.count}
                        </div>
                        <div className="mt-2 text-xs text-green-500 font-bold bg-green-50 px-2 py-1 rounded-full">
                            {stats.valid} Validados
                        </div>
                    </div>

                    {/* Metric Card: Type */}
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex-1 flex flex-col items-center justify-center text-center relative overflow-hidden transition-all">
                        {detectedType ? (
                            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center">
                                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4 shadow-lg
                                    ${detectedType === 'CPF' ? 'bg-purple-100 text-purple-600' :
                                        detectedType === 'EMAIL' ? 'bg-orange-100 text-orange-600' :
                                            detectedType === 'ID' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}
                                `}>
                                    {detectedType === 'CPF' ? '🆔' : detectedType === 'EMAIL' ? '📧' : detectedType === 'ID' ? '#️⃣' : '📝'}
                                </div>
                                <h3 className="text-xl font-bold text-gray-800">{detectedType}</h3>
                                <p className="text-xs text-gray-400 mt-1">Padrão Identificado</p>

                                <div className="mt-6 w-full">
                                    <button className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2">
                                        <Icons.Search />
                                        Buscar na Base
                                    </button>
                                </div>
                            </motion.div>
                        ) : (
                            <div className="opacity-30 flex flex-col items-center">
                                <div className="text-4xl mb-2">🤖</div>
                                <p className="text-sm font-bold">IA Aguardando...</p>
                            </div>
                        )}
                    </div>

                </div>

                {/* COL 3: RESULTS PREVIEW (Placeholder for now) */}
                <div className="flex-1 bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col relative overflow-hidden opacity-60">
                    <div className="absolute inset-0 flex items-center justify-center flex-col text-gray-300">
                        <div className="text-6xl mb-4">📊</div>
                        <p className="font-bold text-sm">Resultados aparecerão aqui</p>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default SmartFindRecord;
