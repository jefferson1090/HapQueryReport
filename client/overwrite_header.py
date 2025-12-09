
import os
import json

client_pkg_path = r"c:\Users\jeffe\.gemini\antigravity\scratch\oracle-lowcode\client\package.json"
server_pkg_path = r"c:\Users\jeffe\.gemini\antigravity\scratch\oracle-lowcode\server\package.json"
sqlrunner_path = r"c:\Users\jeffe\.gemini\antigravity\scratch\oracle-lowcode\client\src\components\SqlRunner.jsx"

# Bump version to 1.15.40
def bump_version(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        data["version"] = "1.15.40"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        print(f"Bumped version in {path}")
    except Exception as e:
        print(f"Error bumping version: {e}")

bump_version(client_pkg_path)
bump_version(server_pkg_path)

# Overwrite header block in SqlRunner.jsx
with open(sqlrunner_path, "r", encoding="utf-8") as f:
    content = f.read()

# Fix exportToFormat
if "exportToFormat" in content:
    content = content.replace("exportToFormat", "exportData")
    print("Fixed exportToFormat")

# Replacment Logic
start_marker = "minWidth={activeTab.results.metaData.length * 150} // Approximate Width"
end_marker = "{Row}"

# We need to find the specific instance inside VirtualList
start_idx = content.find(start_marker)
end_idx = content.find(end_marker, start_idx)

if start_idx != -1 and end_idx != -1:
    # We replace everything between start_marker and end_marker (exclusive of end_marker, inclusive of start_marker)
    # But we want to keep start_marker?
    # No, we will replace start_marker as well to append headerHeight
    
    new_block = """minWidth={activeTab.results.metaData.length * 150} // Approximate Width
                                                        headerHeight={showFilters ? 75 : 35}
                                                        header={
                                                            <div className={`flex divide-x border-b ${theme.border} ${theme.panel} sticky top-0 z-10 font-semibold text-xs text-gray-600`}>
                                                                {columnOrder.map((colName, idx) => {
                                                                    if (!visibleColumns[colName]) return null;
                                                                    const width = columnWidths[colName] || 150;
                                                                    return (
                                                                        <div
                                                                            key={colName}
                                                                            className="relative px-2 py-2 flex items-center justify-between select-none group hover:bg-gray-100 transition-colors bg-gray-50 border-gray-200"
                                                                            style={{ width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px`, height: showFilters ? '75px' : '35px' }} 
                                                                            draggable
                                                                            onDragStart={(e) => handleDragStart(e, colName)}
                                                                            onDragOver={(e) => handleDragOver(e, colName)}
                                                                            onDragEnd={handleDragEnd}
                                                                        >
                                                                            <div className="flex-1 flex flex-col h-full overflow-hidden">
                                                                                 {/* Row 1: Title and Sort/Handles */}
                                                                                 <div className="flex items-center justify-between h-[25px]">
                                                                                    <span className="truncate flex-1 font-bold px-1" title={colName}>{colName}</span>
                                                                                 </div>
                                                                                 
                                                                                 {/* Row 2: Filter Input (Conditional) */}
                                                                                 {showFilters && (
                                                                                    <div className="mt-1">
                                                                                        <input
                                                                                            type="text"
                                                                                            placeholder="Filtrar..."
                                                                                            className="w-full text-[10px] border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 font-normal bg-white"
                                                                                            value={columnFilters[colName] || ''}
                                                                                            onChange={(e) => setColumnFilters(prev => ({ ...prev, [colName]: e.target.value }))}
                                                                                            onClick={(e) => e.stopPropagation()}
                                                                                        />
                                                                                    </div>
                                                                                 )}
                                                                            </div>

                                                                            <div
                                                                                className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 group-hover:bg-blue-200"
                                                                                onMouseDown={(e) => startResizing(e, colName)}
                                                                                onDoubleClick={() => handleDoubleClickResizer(colName)}
                                                                            />
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        }
                                                    >
                                                        """
                                                        
    # We replace: content[start_idx : end_idx]
    # Check if end_idx points to "{Row}". We want to replace UP TO "{Row}".
    # The previous code ended effectively at "> \n {Row}" (approx).
    # We need to make sure we consume the old header and closing bracket.
    
    # Let's count back from end_idx to see if we are consuming the right amount.
    # The existing code has ">" before "{Row}".
    # Our new block ends with ">".
    # So we should be good.
    
    content = content[:start_idx] + new_block + content[end_idx:]
    print("Header block overwritten")
else:
    print("Could not find block markers")

with open(sqlrunner_path, "w", encoding="utf-8") as f:
    f.write(content)
