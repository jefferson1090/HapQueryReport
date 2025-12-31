const { parseSigoSql } = require('../services/sigoSqlParser');

// Complex SQL cases mimicking real-world messiness
const testSqls = [
    {
        name: "Standard CASE (Previous)",
        sql: "SELECT CASE WHEN x = '1' THEN 'One' ELSE 'Other' END as status FROM t"
    },
    {
        name: "DECODE with DEFAULT",
        sql: "SELECT DECODE(col, 1, 'A', 2, 'B', 'Unknown') as decoded_col FROM t"
    },
    {
        name: "CASE inside SUBQUERY (Wrapper)",
        sql: "SELECT (SELECT CASE WHEN x='Y' THEN 'Yes' ELSE 'No' END FROM dual) as subquery_case FROM t"
    },
    {
        name: "DECODE inside SUBQUERY (Wrapper)",
        sql: "SELECT (SELECT DECODE(x, 'Y', 'Yes', 'No') FROM dual) as subquery_decode FROM t"
    },
    {
        name: "Multiline CASE with ELSE",
        sql: `SELECT 
            CASE 
                WHEN x=1 THEN 'One' 
                WHEN x=2 THEN 'Two' 
                ELSE 'Three' 
            END as numbers 
        FROM t`
    }
];

testSqls.forEach(test => {
    console.log(`\n\n--- TEST: ${test.name} ---`);
    try {
        const result = parseSigoSql(test.sql);
        console.log("Columns:", JSON.stringify(result.columns, null, 2));
    } catch (e) {
        console.error("ERROR:", e.message);
    }
});
