import React, { useState, useEffect } from 'react';
import { Search, Database, ArrowRight, Loader } from 'lucide-react';

const TableSelection = ({ onSelect, onCancel }) => {
    const [tables, setTables] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [selectedTable, setSelectedTable] = useState(null);

    useEffect(() => {
        const fetchTables = async () => {
            setLoading(true);
            try {
                // Determine API URL based on environment or window location
                const apiUrl = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
                const res = await fetch(`${apiUrl}/api/tables?search=${encodeURIComponent(search)}`);
                const data = await res.json();
                setTables(data);
            } catch (err) {
                console.error("Failed to fetch tables", err);
            } finally {
                setLoading(false);
            }
        };

        // Debounce search
        const timer = setTimeout(() => {
            fetchTables();
        }, 300);

        return () => clearTimeout(timer);
    }, [search]);

    return (
        <div className="w-full h-full overflow-hidden bg-gray-50 flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden flex flex-col max-h-[80vh]">

                {/* Header */}
                <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
                    <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Database className="text-blue-600" size={24} />
                        Selecionar Tabela
                    </h2>
                    <p className="text-gray-500 text-sm mt-1">Escolha a tabela onde deseja realizar a busca.</p>
                </div>

                {/* Search Bar */}
                <div className="p-4 border-b border-gray-100 bg-white">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar tabela..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            autoFocus
                        />
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-2 bg-gray-50/50">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                            <Loader className="animate-spin mb-2" size={24} />
                            <p className="text-sm">Carregando tabelas...</p>
                        </div>
                    ) : tables.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                            <Database size={32} className="mb-2 opacity-50" />
                            <p>Nenhuma tabela encontrada.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-2">
                            {tables.map((table) => (
                                <button
                                    key={table}
                                    onClick={() => setSelectedTable(table)}
                                    className={`
                                        flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all
                                        ${selectedTable === table
                                            ? 'bg-blue-50 border-blue-500 shadow-sm ring-1 ring-blue-200'
                                            : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-sm'}
                                    `}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg ${selectedTable === table ? 'bg-blue-200 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                                            <Database size={16} />
                                        </div>
                                        <span className={`font-medium ${selectedTable === table ? 'text-blue-800' : 'text-gray-700'}`}>
                                            {table}
                                        </span>
                                    </div>
                                    {selectedTable === table && <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-white border-t border-gray-200 flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-gray-500 hover:text-gray-700 font-medium text-sm transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => selectedTable && onSelect(selectedTable)}
                        disabled={!selectedTable}
                        className={`
                            px-6 py-2 rounded-lg font-bold text-white shadow-md flex items-center gap-2 transition-all transform active:scale-95
                            ${!selectedTable ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}
                        `}
                    >
                        Continuar
                        <ArrowRight size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TableSelection;
