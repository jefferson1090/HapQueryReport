const { parseSigoSql } = require('../services/sigoSqlParser');

const testSql = `
  SELECT 
    t.id,
    CASE 
        WHEN t.status = 'P' THEN 'Pendente'
        WHEN t.status = 'C' THEN 'Concluido'
        ELSE 'Outro'
    END as status_desc,
    CASE t.type
        WHEN 'A' THEN 'Alpha'
        WHEN 'B' THEN 'Beta'
    END as type_desc,
    DECODE(t.region, 1, 'Norte', 2, 'Sul', 'Outro') as region_desc
  FROM table t
`;

try {
    const result = parseSigoSql(testSql);
    console.log("--- PARSED COLUMNS ---");
    result.columns.forEach(c => {
        console.log(`Column: ${c.name}`);
        console.log(`Type: ${c.type}`);
        console.log(`Options:`, c.options);
        console.log('----------------');
    });

} catch (e) {
    console.error("Test Failed:", e);
}
