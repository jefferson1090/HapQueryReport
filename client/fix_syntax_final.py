
import os
import json

client_pkg_path = r"c:\Users\jeffe\.gemini\antigravity\scratch\oracle-lowcode\client\package.json"
server_pkg_path = r"c:\Users\jeffe\.gemini\antigravity\scratch\oracle-lowcode\server\package.json"
sqlrunner_path = r"c:\Users\jeffe\.gemini\antigravity\scratch\oracle-lowcode\client\src\components\SqlRunner.jsx"

# Bump version to 1.15.40
def bump_version(path):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    data["version"] = "1.15.40"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"Bumped version in {path}")

bump_version(client_pkg_path)
bump_version(server_pkg_path)

# Fix SqlRunner.jsx
with open(sqlrunner_path, "r", encoding="utf-8") as f:
    content = f.read()

# Look for the specific location where div is missing
# Pattern: Input end tag "/>" followed immediately by ");" (with whitespace)
# We want to insert "</div>" before ");"

# Use a string that we know acts as anchor
anchor_before = 'onClick={(e) => e.stopPropagation()}'
anchor_after = '});' # End of map? No, map ends with '})}'.
# The return ends with ');'.

# Let's find the input block end
if anchor_before in content:
    print("Found anchor")
    # Finding the index of the anchor
    idx = content.find(anchor_before)
    
    # Check what follows
    # content[idx:] starts with onClick...
    # We expect `/>` then `);`
    
    # We will look for the first `);` after `/>`
    # Warning: `/>` is common.
    
    # Let's use a simpler replacement if possible. 
    # The erroneous sequence likely lacks `</div>`
    
    # We can try to replace `/>\n                                                                    );`
    # But whitespace is tricky.
    
    # Let's read lines and iterate.
    lines = content.splitlines()
    new_lines = []
    
    fixed = False
    for i, line in enumerate(lines):
        new_lines.append(line)
        if anchor_before in line:
            # The next line should be `/>` (closing input)
            if i+1 < len(lines) and "/>" in lines[i+1]:
                # The line after that should be `</div>` (closing div)
                if i+2 < len(lines):
                    if ");" in lines[i+2] and "</div>" not in lines[i+2]:
                        print(f"Found missing div at line {i+2}")
                        # Insert div
                        # Indent matching the return line?
                        whitespace = lines[i+2].split(')')[0] # Get leading spaces
                        new_lines.append(whitespace + "    </div>") # Add div
                        fixed = True
    
    if fixed:
        with open(sqlrunner_path, "w", encoding="utf-8") as f:
            f.write("\n".join(new_lines))
        print("Fixed missing </div>")
    else:
        print("Could not locate missing div context (or already fixed)")

else:
    print("Anchor not found")
