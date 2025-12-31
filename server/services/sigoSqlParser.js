
const fs = require('fs');

/**
 * Parses a raw SQL string to extract columns and metadata.
 * TAILORED FOR ORACLE DIALECT (DECODE, NVL, Sub-selects).
 * 
 * @param {string} sqlContent - The raw SQL string.
 * @returns {object} - { columns: [{ name: string, alias: string, type: 'column'|'function'|'subquery' }], originalSql: string }
 */
function parseSigoSql(sqlContent) {
    // 1. Sanitize: Remove comments and normalize spaces
    let cleanSql = sqlContent
        .replace(/\/\*[\s\S]*?\*\/|--.*$/gm, '') // Remove comments
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();

    // 2. Extract SELECT block (between SELECT and FROM)
    // We assume the first SELECT and the LAST FROM (simplistic, improving for the provided sample)
    // The provided sample ends with "From vw_empresa_conveniada_cad e;"

    // Find the main SELECT
    const selectMatch = cleanSql.match(/^SELECT\s+(.*)\s+FROM\s+/i);

    if (!selectMatch) {
        // Fallback if regex fails due to complex nested FROMs, try to split by first SELECT and last FROM
        const selectIndex = cleanSql.toUpperCase().indexOf('SELECT');
        const fromIndex = cleanSql.toUpperCase().lastIndexOf(' FROM ');

        if (selectIndex === -1 || fromIndex === -1 || fromIndex < selectIndex) {
            throw new Error("Não foi possível identificar a estrutura SELECT ... FROM válida.");
        }

        // Extract the raw column block
        const columnBlock = cleanSql.substring(selectIndex + 6, fromIndex).trim();
        return processColumnBlock(columnBlock, cleanSql);
    }

    // Use the match
    const columnBlock = selectMatch[1];
    return processColumnBlock(columnBlock, cleanSql);
}

/**
 * Splits the column block by top-level commas and analyzes each part.
 */
function processColumnBlock(columnBlock, originalSql) {
    const rawColumns = splitByTopLevelComma(columnBlock);

    const processedColumns = rawColumns.map(colDef => {
        colDef = colDef.trim();

        // 1. Identify Alias
        // format: EXPRESSION [AS] ALIAS, or EXPRESSION ALIAS
        // We look for the last whitespace content

        let alias = '';
        let expression = '';
        let type = 'column';

        // Check for parens (Sub-select or Function) to treat them as a single block
        // basic check: does it end with a word that is NOT inside parens?

        const aliasMatch = colDef.match(/\s+("?[a-zA-Z0-9_]+"?)(\s*)$/);

        // SPECIAL CASE: The provided SQL has ") ALIAS" for subqueries
        // e.g. (select ...) FL_CAD_FUT

        if (aliasMatch) {
            const possibleAlias = aliasMatch[1];
            const textBefore = colDef.substring(0, colDef.lastIndexOf(possibleAlias)).trim();

            if (textBefore.toUpperCase().endsWith(' AS')) {
                alias = possibleAlias;
                expression = textBefore.substring(0, textBefore.length - 3).trim();
            } else {
                alias = possibleAlias;
                expression = textBefore;
            }
        } else {
            // No explicit alias found
            expression = colDef;

            // Logic to clean implicit alias:
            // 1. Remove table aliases (e.g. "t.column" -> "column")
            // 2. Remove anything that looks like a function call if possible, or just keep it
            // Simple approach: Take the part after the last dot if no parens at end

            let possibleName = colDef;
            const lastDot = possibleName.lastIndexOf('.');
            if (lastDot !== -1 && !possibleName.endsWith(')')) {
                possibleName = possibleName.substring(lastDot + 1);
            }
            alias = possibleName;
        }

        // 2. Identify Type and Extract Options
        const upperExpr = expression.toUpperCase();
        let options = null;
        // type was already declared above or we should reuse/reassign
        // Actually, type is declared in the original scope of map?
        // Let's check line 59.
        // If line 59 declares 'let type = ...', then lines 99-100 shouldn't redeclare.

        // Wait, I am replacing a block.
        // Let's just remove 'let' if it was declared before.
        // But I don't see the full file.
        // The error says line 100.
        // I will just use assignment if already declared.
        // Or declare it if not.

        // Looking at previous 'replace_file_content' output (Step 368):
        // It replaced lines around 94-171.
        // Line 59 was NOT shown. 
        // The linter said line 59 has it.
        // So I should remove 'let type = "column"' and just do 'type = "column"'.

        type = 'column';

        // TYPE DETECTION
        if (upperExpr.startsWith('(SELECT') || upperExpr.startsWith('( SELECT')) {
            type = 'subquery';
        } else if (upperExpr.includes('DECODE') || upperExpr.includes('NVL') || upperExpr.includes('CASE') || upperExpr.includes('(')) {
            type = 'function';
        }

        // AGGRESSIVE OPTION EXTRACTION (Run regardless of type)
        // This ensures even Subqueries containing CASE/DECODE get options extracted
        if (upperExpr.includes('DECODE')) {
            try {
                const decodeContentMatch = expression.match(/DECODE\s*\(([\s\S]*?)\)/i);
                if (decodeContentMatch) {
                    options = extractDecodeOptions(decodeContentMatch[1]);
                }
            } catch (e) {
                console.warn('Failed to parse DECODE options for', alias, e);
            }
        } else if (upperExpr.includes('CASE')) {
            try {
                options = extractCaseOptions(expression);
            } catch (e) {
                console.warn('Failed to parse CASE options for', alias, e);
            }
        }

        // Clean Alias (remove quotes and Uppercase)
        alias = alias.replace(/"/g, '').toUpperCase();

        return {
            name: alias,
            original: expression,
            type: type,
            options: options,
            dataType: inferDataType(alias, expression)
        };
    });

    // 3. Deduplicate Aliases and Reconstruct Column Block
    const seenNames = new Map(); // Name -> Count
    const finalColumns = [];
    const rebuiltColumnParts = [];

    processedColumns.forEach(col => {
        let uniqueName = col.name;

        if (seenNames.has(uniqueName)) {
            const count = seenNames.get(uniqueName) + 1;
            seenNames.set(uniqueName, count);
            uniqueName = `${uniqueName}_${count}`;
        } else {
            seenNames.set(uniqueName, 1);
        }

        const newCol = { ...col, name: uniqueName };
        finalColumns.push(newCol);
        rebuiltColumnParts.push(`${newCol.original} AS "${uniqueName}"`);
    });

    let fixedSql = originalSql;

    // Attempt to replace the column block safely
    if (originalSql && originalSql.includes(columnBlock)) {
        fixedSql = originalSql.replace(columnBlock, rebuiltColumnParts.join(',\n       '));
    } else {
        fixedSql = originalSql.replace(/^SELECT\s+(.*)\s+FROM\s+/i, `SELECT \n       ${rebuiltColumnParts.join(',\n       ')}\nFROM `);
    }

    return {
        columns: finalColumns,
        originalSql: originalSql,
        cleanedSql: fixedSql
    };
}

/**
 * Extracts options from a DECODE content string.
 * Handles quoted strings containing commas.
 */
function extractDecodeOptions(content) {
    const options = [];
    const parts = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';
    let depth = 0;

    // specialized split that respects quotes and parenthesis
    for (let i = 0; i < content.length; i++) {
        const char = content[i];

        if (inQuote) {
            current += char;
            if (char === quoteChar) {
                inQuote = false;
            }
        } else {
            if (char === "'" || char === '"') {
                inQuote = true;
                quoteChar = char;
                current += char;
            } else if (char === '(') {
                depth++;
                current += char;
            } else if (char === ')') {
                depth--;
                current += char;
            } else if (char === ',' && depth === 0) {
                parts.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
    }
    if (current.trim()) parts.push(current.trim());

    // parts[0] is Column. 
    // pairs: 1=val, 2=label, 3=val, 4=label... 

    if (parts.length >= 3) {
        // Loop pairs
        for (let i = 1; i < parts.length - 1; i += 2) {
            const val = cleanValue(parts[i]);
            const label = cleanValue(parts[i + 1]);
            options.push({ value: val, label: label });
        }

        // CHECK FOR DEFAULT VALUE (last item if count is even)
        // parts: [col, v1, l1, v2, l2, DEF] -> length 6
        // parts: [col, v1, l1, v2, l2] -> length 5 (no default)
        // So if parts.length IS even, there is a distinct default.
        if (parts.length % 2 === 0) {
            const def = cleanValue(parts[parts.length - 1]);
            options.push({ value: def, label: def });
        }
    }
    return options;
}

/**
 * Extracts options from a CASE statement.
 * Supports: 
 * 1. CASE WHEN x='a' THEN 'A' ...
 * 2. CASE x WHEN 'a' THEN 'A' ...
 * 3. ELSE support
 */
function extractCaseOptions(expression) {
    const options = [];
    // Normalize spaces
    const cleanExpr = expression.replace(/\s+/g, ' ');

    const whenRegex = /WHEN\s+(.+?)\s+THEN\s+(.+?)(?=\s+WHEN|\s+ELSE|\s+END)/gi;
    let match;

    while ((match = whenRegex.exec(cleanExpr)) !== null) {
        let valRaw = match[1];
        let labelRaw = match[2];

        let val = '';
        let label = cleanValue(labelRaw);

        if (valRaw.includes('=')) {
            const parts = valRaw.split('=');
            val = cleanValue(parts[1]);
        } else {
            val = cleanValue(valRaw);
        }

        options.push({ value: val, label: label });
    }

    // Capture ELSE
    const elseRegex = /ELSE\s+(.+?)\s+END/i;
    const elseMatch = cleanExpr.match(elseRegex);
    if (elseMatch) {
        const elseVal = cleanValue(elseMatch[1]);
        options.push({ value: elseVal, label: elseVal });
    }

    return options;
}

function cleanValue(str) {
    if (!str) return '';
    let s = str.trim();
    if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
        return s.slice(1, -1);
    }
    return s;
}

/**
 * Splitting by comma while ignoring commas inside parentheses
 */
function splitByTopLevelComma(text) {
    let result = [];
    let current = '';
    let depth = 0;
    // ... existing implementation ...
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '(') depth++;
        else if (char === ')') depth--;

        if (char === ',' && depth === 0) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    if (current.trim()) result.push(current);
    return result;
}

/**
 * Heuristic Type Inference based on Naming and Expression
 */
function inferDataType(alias, expression) {
    const name = alias.toUpperCase();
    const expr = expression.toUpperCase();

    // DATES
    if (name.startsWith('DT_') || name.startsWith('DATA_') || name.endsWith('_DATA') ||
        name.endsWith('_DT') || expr.includes('TO_DATE') || expr.includes('SYSDATE') || expr.includes('TRUNC(')) {
        return 'DATE';
    }

    // NUMBERS
    // CD_ -> Kode/Code (usually ID, treated as number or string, but for equivalence user likely wants list/equals)
    // NU_ -> Number
    // QT_ -> Quantity
    // VL_ -> Value
    // ID_ -> ID
    if (name.startsWith('QT_') || name.startsWith('VL_') || name.startsWith('NU_') ||
        name.startsWith('NR_') ||
        expr.includes('TO_NUMBER') || expr.includes('COUNT(') || expr.includes('SUM(')) {
        return 'NUMBER';
    }

    return 'VARCHAR2';
}

module.exports = { parseSigoSql };
