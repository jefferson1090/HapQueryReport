
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

        // 2. Identify Type (Sub-select, Function, Simple) AND Extract Equivalences (DECODE)
        const upperExpr = expression.toUpperCase();
        let options = null;

        if (upperExpr.startsWith('(SELECT') || upperExpr.startsWith('( SELECT')) {
            type = 'subquery';
        } else if (upperExpr.includes('DECODE(') || upperExpr.includes('NVL(') || upperExpr.includes('CASE ')) {
            type = 'function';

            // Try to extract DECODE options
            // Format: DECODE(COLUMN, VAL1, 'LABEL1', VAL2, 'LABEL2'...)
            // Simplistic Regex for the provided T2212 format (multiline compatible)
            // DECODE(FL_STATUS, 0, 'REGISTRADO', 1, 'PENDENTE', ...)

            if (upperExpr.includes('DECODE')) {
                try {
                    // Extract content inside DECODE(...)
                    const decodeContentMatch = expression.match(/DECODE\s*\(([\s\S]*?)\)/i);
                    if (decodeContentMatch) {
                        const content = decodeContentMatch[1];
                        // Split by comma respecting quotes (reusing splitByTopLevelComma but treating single quotes as blocks?)
                        // The provided splitByTopLevelComma handles parens but not quotes, let's look at the content.
                        // Content: FL_STATUS, 0, 'REGISTRADO', 1, 'PENDENTE'

                        // Clean newlines
                        const cleanContent = content.replace(/\s+/g, ' ');
                        const parts = cleanContent.split(',').map(p => p.trim());

                        // part[0] is the column (e.g. FL_STATUS)
                        // parts[1] is val1, parts[2] is label1, parts[3] is val2, parts[4] is label2...

                        if (parts.length >= 3) {
                            options = [];
                            for (let i = 1; i < parts.length - 1; i += 2) {
                                const val = parts[i].replace(/'/g, ''); // 0 or '0'
                                const label = parts[i + 1].replace(/'/g, ''); // 'REGISTRADO'
                                options.push({ value: val, label: label });
                            }
                        }
                    }
                } catch (e) {
                    console.warn('Failed to parse DECODE options for', alias, e);
                }
            }

        } else if (upperExpr.includes('(')) {
            type = 'function'; // General function
        }

        // Clean Alias (remove quotes and Uppercase)
        alias = alias.replace(/"/g, '').toUpperCase();

        return {
            name: alias,
            original: expression,
            type: type,
            options: options // New field for UI filters
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

        // Update the column object
        const newCol = { ...col, name: uniqueName };
        finalColumns.push(newCol);

        // Rebuild the SQL part for this column
        // We look at the original expression. 
        // If it had an explicit alias (like "... AS ALIAS" or "... ALIAS"), we replace it.
        // If it was implicit, we append " AS NEW_ALIAS".

        // Simple and robust approach: 
        // Use the 'original' expression (which might include the old alias) 
        // but we stripped the alias in the parsing phase? 
        // Actually 'original' in 'processedColumns' currently *excludes* the parsed alias part if it was explicit "AS".

        // Let's look at how we populate 'original' in processColumnBlock above.
        // answer: expression = textBefore.substring(0, textBefore.length - 3).trim(); 
        // So 'col.original' is the pure expression without the alias.

        rebuiltColumnParts.push(`${newCol.original} AS "${uniqueName}"`);
    });

    // 4. Re-assemble valid SQL
    // We assume the original SQL structure: SELECT [Columns] FROM ...
    // We just replace the [Columns] part with our rebuilt parts.

    // We can't identify exact positions easily with regex, but we know the 'columnBlock' content.
    // The safest way is to find where columnBlock is in originalSql and replace it.
    // But normalized spaces might differ.

    // Better strategy for this specific use case:
    // We have 'originalSql'
    // We know 'columnBlock' existed in it (from parseSigoSql logic)
    // But parseSigoSql passed 'columnBlock' which might be from a match.

    // Let's change parseSigoSql to pass the bounds or do the replacement there.
    // For now, let's construct a "best effort" clean SQL if we can't do exact replacement?
    // User needs exact execution.

    // Let's modify the function signature or return to let the caller handle it?
    // No, parser is best place.

    // Just returning columns is not enough, we need the fixed SQL string.

    const newColumnBlock = rebuiltColumnParts.join(',\n       ');

    // We need to replace the *old* column block with *newColumnBlock* in *originalSql*.
    // Since we extracted columnBlock from originalSql (hopefully accurately), we can replace usage.
    // However, cleanSql has comments removed. originalSql (arg) is not passed here?
    // processColumnBlock receives originalSql (line 47).

    let fixedSql = originalSql;

    // We need to find the specific range of the column block we parsed.
    // In parseSigoSql we did regex or index finding.
    // We should perform that replacement there or here.

    // Since processColumnBlock operates on the extracted string 'columnBlock',
    // Replacing 'columnBlock' in 'originalSql' might be risky if 'columnBlock' is short/ambiguous.
    // But for a big SELECT it's usually unique. 

    // Let's simply replace the First Occurrence of columnBlock in originalSql?
    // Ideally yes.

    if (originalSql && originalSql.includes(columnBlock)) {
        fixedSql = originalSql.replace(columnBlock, newColumnBlock);
    } else {
        // Fallback: Construct a basic SELECT if we can't patch
        // (Risky if there are complex joins/where clauses we miss)
        // But wait, 'originalSql' passed to this function is the 'cleanSql' from parseSigoSql? 
        // Yes, line 41: return processColumnBlock(columnBlock, cleanSql);

        // If we can't find exact match (formatting?), let's try to assume we are replacing the content between SELECT and FROM.
        // It's safer to rely on the caller logic being consistent.

        // Let's regex replace the content between first SELECT and FROM again
        fixedSql = originalSql.replace(/^SELECT\s+(.*)\s+FROM\s+/i, `SELECT \n       ${newColumnBlock}\nFROM `);
    }

    return {
        columns: finalColumns,
        originalSql: originalSql,
        cleanedSql: fixedSql // The auto-corrected SQL
    };
}

/**
 * Splitting by comma while ignoring commas inside parentheses
 */
function splitByTopLevelComma(text) {
    let result = [];
    let current = '';
    let depth = 0;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (char === '(') {
            depth++;
        } else if (char === ')') {
            depth--;
        }

        if (char === ',' && depth === 0) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }

    if (current.trim()) {
        result.push(current);
    }

    return result;
}

module.exports = { parseSigoSql };
