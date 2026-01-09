import React, { useState, useEffect } from 'react';
import TableSelection from './TableSelection';
import ColumnSelection from './ColumnSelection';
import { Search } from 'lucide-react';

const FindRecordFlow = ({ onComplete, onCancel }) => {
    const [step, setStep] = useState(1); // 1: Select Table, 2: Select Column/Value
    const [selectedTable, setSelectedTable] = useState(null);
    const [searchValue, setSearchValue] = useState('');
    const [searchValueConfirmed, setSearchValueConfirmed] = useState(false);

    // Data for ColumnSelection
    const [tableColumns, setTableColumns] = useState([]);
    const [loadingCols, setLoadingCols] = useState(false);

    // Step 1: Handle Table Selection
    const handleTableSelect = (tableName) => {
        setSelectedTable(tableName);
        setStep(2);
    };

    // Step 2 Fetch Columns when table is selected
    useEffect(() => {
        if (selectedTable && step === 2) {
            setLoadingCols(true);
            const apiUrl = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
            fetch(`${apiUrl}/api/columns/${encodeURIComponent(selectedTable)}`)
                .then(r => r.json())
                .then(data => {
                    setTableColumns(data);
                    setLoadingCols(false);
                })
                .catch(err => {
                    console.error(err);
                    setLoadingCols(false);
                });
        }
    }, [selectedTable, step]);

    // Step 2.5: Value Input Component (Internal)
    const ValueInputStep = () => (
        <div className="w-full h-full bg-gray-50 flex items-center justify-center p-6">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-200 p-8">
                <div className="flex flex-col items-center mb-6">
                    <div className="p-3 bg-orange-100 rounded-full mb-4">
                        <Search className="text-orange-600" size={32} />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-800">O que você procura?</h2>
                    <p className="text-gray-500 text-center mt-2">
                        Digite o valor que deseja encontrar na tabela <span className="font-bold text-gray-700">{selectedTable}</span>.
                    </p>
                </div>

                <input
                    type="text"
                    placeholder="Ex: 12345, Maria Silva, REF-99..."
                    className="w-full p-4 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none mb-6"
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && searchValue && setSearchValueConfirmed(true)}
                />

                <div className="flex gap-3">
                    <button
                        onClick={() => setStep(1)}
                        className="flex-1 py-3 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition-colors"
                    >
                        Voltar
                    </button>
                    <button
                        onClick={() => setSearchValueConfirmed(true)}
                        disabled={!searchValue.trim()}
                        className={`flex-1 py-3 font-bold text-white rounded-xl shadow-lg transition-transform active:scale-95
                            ${!searchValue.trim() ? 'bg-gray-300 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600'}
                        `}
                    >
                        Continuar
                    </button>
                </div>
            </div>
        </div>
    );

    // Final Step: Execute Search
    const handleSearchExecution = (finalPrompt) => {
        // We received the final prompt from ColumnSelection (logic already exists)
        // Or we can manually construct if just passed params.
        // ColumnSelection returns a prompt string via onSearch.
        onComplete(finalPrompt);
    };

    // Render Logic
    if (step === 1) {
        return <TableSelection onSelect={handleTableSelect} onCancel={onCancel} />;
    }

    if (step === 2 && !searchValueConfirmed) {
        return <ValueInputStep />;
    }

    if (step === 2 && searchValueConfirmed) {
        if (loadingCols) {
            return <div className="flex h-full items-center justify-center">Carregando colunas...</div>;
        }

        // Prepare ViewData for ColumnSelection
        const viewData = {
            tableName: selectedTable,
            value: searchValue,
            columns: tableColumns,
            mode: 'filter' // Force filter mode to select WHERE column
        };

        return (
            <ColumnSelection
                viewData={viewData}
                onSearch={handleSearchExecution}
                onCancel={() => setSearchValueConfirmed(false)}
            />
        );
    }

    return null;
};

export default FindRecordFlow;
