import React, { useState } from 'react';

const ColumnSelection = ({ viewData, onSearch, onCancel }) => {
    if (!viewData) return null;
    const { tableName, value, columns } = viewData;
    const [selectedCols, setSelectedCols] = useState([]);

    const handleSearch = () => {
        // Construct a precise search query
        const colStr = selectedCols.length > 0 ? selectedCols.join(', ') : 'todas as colunas';
        onSearch(`Buscar valor "${value}" na tabela ${tableName} nas colunas: ${colStr}`);
    };

    const toggleCol = (colName) => {
        if (selectedCols.includes(colName)) {
            setSelectedCols(selectedCols.filter(c => c !== colName));
        } else {
            setSelectedCols([...selectedCols, colName]);
        }
    };

    return (
        <div className="w-full h-full overflow-auto bg-gray-50 flex flex-col items-center p-6">
            <div className="w-full max-w-2xl bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden flex flex-col max-h-full">
                <div className="p-6 border-b border-gray-100">
                    <h3 className="text-xl font-bold text-gray-800 mb-2">Refinar Busca</h3>
                    <p className="text-sm text-gray-500">
                        A tabela <span className="font-bold text-gray-700">{tableName}</span> tem muitas colunas.
                        Para tornar a busca pelo valor <span className="font-bold text-blue-600">"{value}"</span> mais rápida e precisa, selecione onde devemos procurar.
                    </p>
                </div>

                <div className="flex-1 overflow-y-auto p-2 bg-gray-50/50">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2">
                        {columns.map((col) => (
                            <label key={col.name} className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all ${selectedCols.includes(col.name) ? 'bg-blue-50 border-blue-300 shadow-sm' : 'bg-white border-gray-200 hover:border-blue-200'}`}>
                                <div className={`w-5 h-5 rounded border flex items-center justify-center mr-3 transition-colors ${selectedCols.includes(col.name) ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                                    {selectedCols.includes(col.name) && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                                </div>
                                <input
                                    type="checkbox"
                                    className="hidden"
                                    checked={selectedCols.includes(col.name)}
                                    onChange={() => toggleCol(col.name)}
                                />
                                <div className="flex flex-col">
                                    <span className={`text-sm font-bold ${selectedCols.includes(col.name) ? 'text-blue-800' : 'text-gray-700'}`}>{col.name}</span>
                                    <span className="text-[10px] text-gray-400 font-mono">{col.type}</span>
                                </div>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end space-x-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium text-sm"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSearch}
                        disabled={selectedCols.length === 0}
                        className={`px-6 py-2 rounded-lg font-bold text-white shadow-md transition-all transform active:scale-95 ${selectedCols.length > 0 ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 cursor-not-allowed'}`}
                    >
                        Buscar {selectedCols.length > 0 ? `em ${selectedCols.length} colunas` : ''}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ColumnSelection;
