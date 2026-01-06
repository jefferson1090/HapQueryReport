import os

file_path = r'c:\Users\jeffe\.gemini\antigravity\scratch\oracle-lowcode\client\src\components\AiBuilder.jsx'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Indices (0-based)
# Line 1660 (1-based) -> Index 1659
start_move_idx = 1659
# Line 5524 (1-based) -> Index 5523. We want to include it.
end_move_idx = 5524  # logic: slice up to 5524 will separate 5524 line into next chunk? No. slice[start:end] excludes end. 
# So we want slice[1659:5524] -> includes 1659...5523.
# Line 5524 is `});` which closes StartScreen.
# So we want to INCLUDE line 5524.
# So end_move_idx should be 5524 + 1 = 5525.

# Line 1260 (1-based) -> Index 1259
insert_idx = 1259

chunk_before = lines[:insert_idx]
chunk_middle = lines[insert_idx:start_move_idx]
chunk_move = lines[start_move_idx:5525]
chunk_end = lines[5525:]

print(f"Chunk Before: {len(chunk_before)} lines")
print(f"Chunk Middle: {len(chunk_middle)} lines")
print(f"Chunk Move: {len(chunk_move)} lines")
print(f"Chunk End: {len(chunk_end)} lines")

# Verify boundaries
print(f"Last line of before: {chunk_before[-1].strip()}") # Should be line 1259
print(f"First line of middle: {chunk_middle[0].strip()}") # Should be line 1260
print(f"Last line of middle: {chunk_middle[-1].strip()}") # Should be line 1659
print(f"First line of move: {chunk_move[0].strip()}") # Should be line 1660
print(f"Last line of move: {chunk_move[-1].strip()}") # Should be line 5524
print(f"First line of end: {chunk_end[0].strip() if chunk_end else 'EOF'}") # Should be line 5525

new_content = chunk_before + chunk_move + chunk_middle + chunk_end

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(new_content)

print("File updated successfully.")
