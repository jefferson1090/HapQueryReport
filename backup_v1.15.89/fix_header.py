
import os

file_path = r"c:\Users\jeffe\.gemini\antigravity\scratch\oracle-lowcode\client\src\components\SqlRunner.jsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Define the old code block to replace (partial match is safer)
old_code_start = 'style={{ width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px`, height: \'50px\' }} // Adjusted header height'
new_code_start = 'style={{ width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px`, height: showFilters ? \'75px\' : \'35px\' }}'

old_input_block = '''                                                                                 <span className="truncate w-full font-bold px-1" title={colName}>{colName}</span>
                                                                                 {/* Filter Input */}
                                                                                 <input
                                                                                     type="text"
                                                                                     placeholder="Filtro..."
                                                                                     className="w-full text-[10px] border rounded px-1 py-0.5 focus:outline-none focus:border-blue-500 font-normal ml-0.5 mb-1"
                                                                                     value={columnFilters[colName] || ''}
                                                                                     onChange={(e) => setColumnFilters(prev => ({ ...prev, [colName]: e.target.value }))}
                                                                                     onClick={(e) => e.stopPropagation()}
                                                                                 />'''

new_input_block = '''                                                                                 
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
                                                                                 )}'''

# Replace headerHeight prop insertion
if "headerHeight={showFilters ? 75 : 35}" in content:
    print("headerHeight already present")
else:
    content = content.replace("minWidth={activeTab.results.metaData.length * 150} // Approximate Width", "minWidth={activeTab.results.metaData.length * 150} // Approximate Width\n                                                        headerHeight={showFilters ? 75 : 35}")

# Replace Style
if new_code_start not in content:
    content = content.replace(old_code_start, new_code_start)
else:
    print("Style already updated")

# Replace Input Block (Using simple string replace might fail due to whitespace, let's try to be flexible)
# We will look for the unique signature of the Input block
input_signature = 'placeholder="Filtro..."'
if input_signature in content and "{showFilters &&" not in content:
     # Find start index of span
     span_part = '<span className="truncate w-full font-bold px-1" title={colName}>{colName}</span>'
     start_idx = content.find(span_part)
     
     # Find end index of input
     end_marker = 'onClick={(e) => e.stopPropagation()}\n                                                                                 />'
     end_idx = content.find(end_marker, start_idx) + len(end_marker)
     
     if start_idx != -1 and end_idx != -1:
         print(f"Replacing block from {start_idx} to {end_idx}")
         content = content[:start_idx] + new_input_block + content[end_idx:]
     else:
         print("Could not find block boundaries")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Patch applied")
