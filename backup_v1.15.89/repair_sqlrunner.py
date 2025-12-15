
import os

file_path = r"c:\Users\jeffe\.gemini\antigravity\scratch\oracle-lowcode\client\src\components\SqlRunner.jsx"

with open(file_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

# Truncate after line 1162 (index 1162, since 0-indexed)
# Line 1162 in the viewed file was </div> (inside the map loop)
# Actually, let's verify the content of line 1162 to be sure.
# It should be "                                                                        </div>" or similar.

valid_lines = lines[:1162]

sidebar_code = """                                                                    );
                                                                })}
                                                            </div>
                                                        }
                                                    >
                                                        {Row}
                                                    </VirtualList>
                                                )}
                                            </AutoSizer>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </Panel>
                    </PanelGroup>
                </Panel>

                {showSidebar && <PanelResizeHandle className="w-1 bg-gray-200 hover:bg-blue-400 transition-colors cursor-col-resize z-50" />}

                {/* Sidebar (Saved Queries & Schema) */}
                {showSidebar && (
                    <Panel defaultSize={20} minSize={15} maxSize={40} className={`border-l ${theme.border} flex flex-col`}>
                        <div className={`flex border-b ${theme.border}`}>
                            <button
                                onClick={() => setActiveSidebarTab('saved')}
                                className={`flex-1 py-2 text-sm font-medium transition-colors ${activeSidebarTab === 'saved' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Salvos
                            </button>
                            <button
                                onClick={() => setActiveSidebarTab('schema')}
                                className={`flex-1 py-2 text-sm font-medium transition-colors ${activeSidebarTab === 'schema' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Schema
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2">
                            {activeSidebarTab === 'saved' ? (
                                <div className="space-y-2">
                                    {savedQueries.length === 0 && <p className="text-center text-gray-400 text-sm mt-8">Nenhuma query salva.</p>}
                                    {savedQueries.map(q => (
                                        <div key={q.id} className={`group p-3 rounded border ${theme.border} hover:border-blue-400 transition-all cursor-pointer ${theme.panel}`} onClick={() => loadQuery(q)}>
                                            <div className="flex justify-between items-start mb-1">
                                                <span className={`font-semibold text-sm ${theme.text}`}>{q.name}</span>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); deleteQuery(q.id); }}
                                                    className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    X
                                                </button>
                                            </div>
                                            <div className="text-xs text-gray-500 truncate font-mono">{q.sql}</div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <input
                                        value={schemaSearch}
                                        onChange={(e) => { setSchemaSearch(e.target.value); fetchSchemaTables(e.target.value); }}
                                        placeholder="Buscar tabelas..."
                                        className={`w-full px-3 py-1.5 text-sm rounded border ${theme.border} ${theme.bg} ${theme.text} mb-2`}
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={() => fetchSchemaTables(schemaSearch)} className="flex-1 bg-gray-100 dark:bg-gray-700 text-xs py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                                            Atualizar
                                        </button>
                                    </div>

                                    {loadingSchema && <div className="text-center py-4 text-gray-400 text-xs">Carregando...</div>}

                                    <div className="space-y-1 mt-2">
                                        {schemaTables.map(table => (
                                            <div key={table} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                                                <div
                                                    className={`px-2 py-1.5 text-xs font-mono cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center justify-between ${expandedTable === table ? 'text-blue-600 font-bold' : theme.text}`}
                                                    onClick={() => handleExpandTable(table)}
                                                >
                                                    <span>{table}</span>
                                                    <span className="text-[10px] text-gray-400">{expandedTable === table ? '▼' : '▶'}</span>
                                                </div>
                                                {/* Expanded Columns */}
                                                {expandedTable === table && (
                                                    <div className="pl-4 py-1 bg-gray-50 dark:bg-gray-900/50">
                                                        {tableColumns.map(col => (
                                                            <div
                                                                key={col.name}
                                                                className="text-[10px] text-gray-500 flex justify-between group cursor-pointer hover:text-blue-500"
                                                                onClick={() => insertTextAtCursor(col.name)}
                                                            >
                                                                <span className="font-mono">{col.name}</span>
                                                                <span className="opacity-50 group-hover:opacity-100">{col.type}</span>
                                                            </div>
                                                        ))}
                                                        <div className="pt-1 mt-1 border-t border-dashed border-gray-200">
                                                            <button
                                                                onClick={() => insertTextAtCursor(`SELECT * FROM ${table}`)}
                                                                className="w-full text-[10px] bg-blue-50 text-blue-600 rounded py-0.5 hover:bg-blue-100 transition-colors"
                                                            >
                                                                Gerar SELECT
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </Panel>
                )}
            </PanelGroup>
        </div>
    );
}

SqlRunner.propTypes = {
    isVisible: PropTypes.bool,
    tabs: PropTypes.array.isRequired,
    setTabs: PropTypes.func.isRequired,
    activeTabId: PropTypes.number.isRequired,
    setActiveTabId: PropTypes.func.isRequired,
    savedQueries: PropTypes.array.isRequired,
    setSavedQueries: PropTypes.func.isRequired
};

export default SqlRunner;
"""

with open(file_path, "w", encoding="utf-8") as f:
    f.writelines(valid_lines)
    f.write(sidebar_code)

print("Repair complete")
