import React, { useState, useEffect } from 'react';
import { X, Play, RotateCcw } from 'lucide-react';

const VariableInputModal = ({ open, variables, onSubmit, onClose }) => {
    const [values, setValues] = useState({});

    // Initialize values when variables change
    useEffect(() => {
        if (open && variables.length > 0) {
            const initialValues = {};
            variables.forEach(v => {
                initialValues[v] = '';
            });
            setValues(initialValues);
        }
    }, [open, variables]);

    if (!open) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(values);
    };

    const handleChange = (variable, value) => {
        setValues(prev => ({
            ...prev,
            [variable]: value
        }));
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
            {/* Modal Container - Force Solid Colors for better visibility */}
            <div className="bg-[#1e293b] w-[500px] border border-slate-600 rounded-xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden ring-1 ring-white/10 animation-fade-in-up">

                {/* Header */}
                <div className="h-14 border-b border-slate-700 flex items-center justify-between px-5 bg-slate-900/50 select-none">
                    <span className="font-bold text-orange-500 flex items-center gap-2 text-base tracking-wide">
                        <span className="flex items-center justify-center w-6 h-6 rounded bg-orange-500/10 text-orange-500">⚡</span>
                        Variáveis de Substituição
                    </span>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg transition-colors"
                        title="Fechar"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 bg-[#1e293b]">
                    <div className="space-y-5">
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                            <p className="text-sm text-blue-200/80 leading-relaxed">
                                O comando SQL contém variáveis dinâmicas. Preencha os valores abaixo para executar a consulta.
                            </p>
                        </div>

                        {variables.map((variable) => (
                            <div key={variable} className="group">
                                <label className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-2 font-mono uppercase tracking-wider">
                                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                                    {variable}
                                </label>
                                <div className="relative group-focus-within:scale-[1.01] transition-transform duration-200">
                                    <input
                                        type="text"
                                        value={values[variable] || ''}
                                        onChange={(e) => handleChange(variable, e.target.value)}
                                        className="w-full h-11 px-4 bg-[#0f172a] border border-slate-600 rounded-lg
                                                 text-white text-sm placeholder:text-slate-600
                                                 focus:outline-none focus:border-orange-500
                                                 focus:ring-1 focus:ring-orange-500/50 transition-all font-mono shadow-inner"
                                        placeholder={`Digite o valor...`}
                                        autoFocus={variables[0] === variable}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </form>

                {/* Footer */}
                <div className="p-4 border-t border-slate-700 bg-slate-900/30 flex justify-end gap-3 backdrop-blur-sm">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2.5 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 rounded-lg border border-transparent transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="px-6 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-lg shadow-lg shadow-orange-500/20 flex items-center gap-2 transition-all active:translate-y-0.5"
                    >
                        <Play size={16} fill="currentColor" />
                        Executar SQL
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VariableInputModal;
