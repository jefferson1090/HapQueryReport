const { parseSigoSql } = require('./services/sigoSqlParser');

console.log("Testing inferDataType...");

const sql = "SELECT NU_CGC_CPF, DT_CADASTRAMENTO, nm_pessoa_razao_social FROM DUAL";
const result = parseSigoSql(sql);

console.log("Result:", JSON.stringify(result, null, 2));
