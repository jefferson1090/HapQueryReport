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
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-[var(--bg-panel)] w-[500px] border border-[var(--border-main)] rounded-lg shadow-2xl flex flex-col max-h-[80vh]">
                {/* Header */}
                <div className="h-12 border-b border-[var(--border-main)] flex items-center justify-between px-4 bg-[var(--bg-header)] select-none">
                    <span className="font-semibold text-[var(--accent-primary)] flex items-center gap-2">
                        <span className="text-lg">⚡</span> Variáveis de Substituição
                    </span>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] rounded transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1">
                    <div className="space-y-4">
                        <p className="text-sm text-[var(--text-secondary)] mb-4">
                            O comando SQL contém variáveis. Por favor, forneça os valores para execução:
                        </p>

                        {variables.map((variable) => (
                            <div key={variable} className="group">
                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5 ml-1 font-mono">
                                    &{variable}
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={values[variable] || ''}
                                        onChange={(e) => handleChange(variable, e.target.value)}
                                        className="w-full h-10 px-3 bg-[var(--bg-main)] border border-[var(--border-main)] rounded 
                                                 text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-primary)]
                                                 focus:ring-1 focus:ring-[var(--accent-primary)] transition-all font-mono"
                                        placeholder={`Valor para &${variable}`}
                                        autoFocus={variables[0] === variable}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </form>

                {/* Footer */}
                <div className="p-4 border-t border-[var(--border-main)] bg-[var(--bg-main)] flex justify-end gap-3 rounded-b-lg">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded border border-transparent hover:border-[var(--border-main)] transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="px-6 py-2 text-sm font-medium text-white bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] rounded shadow-sm hover:shadow flex items-center gap-2 transition-all active:scale-95"
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
