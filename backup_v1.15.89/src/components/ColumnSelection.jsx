import React, { useState } from 'react';

const ColumnSelection = ({ viewData, onSearch, onCancel }) => {
    if (!viewData) return null;
    const { tableName, value, columns, mode, filterColumn, originalShowColumns } = viewData;

    // State
    const [selectedProbeCols, setSelectedProbeCols] = useState([]); // Standard select
    const [selectedFilterCol, setSelectedFilterCol] = useState(filterColumn || null); // For Filter Mode
    const [selectedProjCols, setSelectedProjCols] = useState([]); // For Projection Mode (Target columns)

    // Determine Mode Interaction
    const isFilterMode = mode === 'filter';
    const isProjectionMode = mode === 'projection';
    const isStandardMode = !mode;

    const handleSearch = () => {
        if (isFilterMode) {
            if (!selectedFilterCol) return;
            // User selected the filter column. Now we just execute the search.
            // We return a command that executes the find
            let newPrompt = `Localize o valor "${value}" na tabela ${tableName} usando a coluna ${selectedFilterCol}`;

            // RE-APPEND PROJECTION REQUEST if it existed (persisted context)
            if (originalShowColumns && originalShowColumns.length > 0) {
                newPrompt += ` exibindo as colunas ${originalShowColumns.join(', ')}`;
            }

            onSearch(newPrompt);
        } else if (isProjectionMode) {
            const cols = selectedProjCols.length > 0 ? selectedProjCols.join(', ') : '*';
            // User selected output columns. We specify them.
            // MUST include the filter column if we have it, otherwise we loop back to filter selection!
            let prompt = `Localize o valor "${value}" na tabela ${tableName}`;
            if (filterColumn) {
                prompt += ` usando a coluna ${filterColumn}`;
            }
            prompt += ` exibindo as colunas: ${cols}`;

            onSearch(prompt);
        } else {
            // Standard (Original)
            const cols = selectedProbeCols.length > 0 ? selectedProbeCols.join(', ') : 'todas';
            onSearch(`Mostrar colunas: ${cols}`);
        }
    };

    const toggleProjCol = (colName) => {
        if (selectedProjCols.includes(colName)) setSelectedProjCols(selectedProjCols.filter(c => c !== colName));
        else setSelectedProjCols([...selectedProjCols, colName]);
    };

    const toggleProbeCol = (colName) => {
        if (selectedProbeCols.includes(colName)) setSelectedProbeCols(selectedProbeCols.filter(c => c !== colName));
        else setSelectedProbeCols([...selectedProbeCols, colName]);
    };

    const renderHeader = () => {
        if (isFilterMode) return (
            <div className="p-6 border-b border-gray-100 bg-orange-50">
                <h3 className="text-xl font-bold text-gray-800 mb-2">🤔 Onde devo buscar?</h3>
                <p className="text-sm text-gray-600">
                    Tenho o valor <span className="font-bold">"{value}"</span>, mas não sei qual coluna da tabela <span className="font-bold">{tableName}</span> usar para filtrar.
                </p>
            </div>
        );
        if (isProjectionMode) return (
            <div className="p-6 border-b border-gray-100 bg-blue-50">
                <h3 className="text-xl font-bold text-gray-800 mb-2">👁️ O que você quer ver?</h3>
                <p className="text-sm text-gray-600">
                    Achei o registro usando a coluna <span className="font-bold text-blue-600">{filterColumn}</span>. Agora, selecione quais campos deseja visualizar no resultado.
                </p>
            </div>
        );
        return (
            <div className="p-6 border-b border-gray-100">
                <h3 className="text-xl font-bold text-gray-800 mb-2">Refinar Busca</h3>
                <p className="text-sm text-gray-500">Selecione as colunas desejadas.</p>
            </div>
        );
    };

    return (
        <div className="w-full h-full overflow-auto bg-gray-50 flex flex-col items-center p-6">
            <div className="w-full max-w-3xl bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden flex flex-col max-h-full">
                {renderHeader()}

                <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {columns.map((col) => {
                            const isSelected = isFilterMode
                                ? selectedFilterCol === col.name
                                : (isProjectionMode ? selectedProjCols.includes(col.name) : selectedProbeCols.includes(col.name));

                            return (
                                <label key={col.name} className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all ${isSelected ? 'bg-blue-50 border-blue-300 shadow-sm ring-1 ring-blue-200' : 'bg-white border-gray-200 hover:border-blue-200'}`}>
                                    {isFilterMode ? (
                                        <input
                                            type="radio"
                                            name="filterCol"
                                            className="w-4 h-4 text-blue-600"
                                            checked={isSelected}
                                            onChange={() => setSelectedFilterCol(col.name)}
                                        />
                                    ) : (
                                        <input
                                            type="checkbox"
                                            className="rounded text-blue-600 w-4 h-4"
                                            checked={isSelected}
                                            onChange={() => isProjectionMode ? toggleProjCol(col.name) : toggleProbeCol(col.name)}
                                        />
                                    )}

                                    <div className="ml-3 flex flex-col overflow-hidden">
                                        <span className={`text-sm font-bold truncate ${isSelected ? 'text-blue-800' : 'text-gray-700'}`}>{col.name}</span>
                                        <span className="text-[10px] text-gray-400 font-mono">{col.type}</span>
                                    </div>
                                </label>
                            );
                        })}
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
                        disabled={isFilterMode ? !selectedFilterCol : false}
                        className={`px-6 py-2 rounded-lg font-bold text-white shadow-md transition-all transform active:scale-95 ${(isFilterMode && !selectedFilterCol) ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                            }`}
                    >
                        {isFilterMode ? 'Buscar usando esta Coluna' : (isProjectionMode ? 'Exibir Selecionadas' : 'Confirmar')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ColumnSelection;
