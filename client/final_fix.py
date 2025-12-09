
import os
import json

client_pkg_path = r"c:\Users\jeffe\.gemini\antigravity\scratch\oracle-lowcode\client\package.json"
server_pkg_path = r"c:\Users\jeffe\.gemini\antigravity\scratch\oracle-lowcode\server\package.json"
sqlrunner_path = r"c:\Users\jeffe\.gemini\antigravity\scratch\oracle-lowcode\client\src\components\SqlRunner.jsx"

# Bump version to 1.15.39
def bump_version(path):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    data["version"] = "1.15.39"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"Bumped version in {path}")

bump_version(client_pkg_path)
bump_version(server_pkg_path)

# Fix SqlRunner.jsx
with open(sqlrunner_path, "r", encoding="utf-8") as f:
    content = f.read()

# Fix exportToFormat -> exportData
if "exportToFormat" in content:
    content = content.replace("exportToFormat", "exportData")
    print("Fixed exportToFormat")
else:
    print("exportToFormat not found (maybe already fixed?)")

# Check for syntax issue around line 1160
lines = content.split('\n')
print("--- Lines around 1160 ---")
for i in range(1155, 1175):
    if i < len(lines):
        print(f"{i+1}: {lines[i]}")

# Write back
with open(sqlrunner_path, "w", encoding="utf-8") as f:
    f.write(content)
