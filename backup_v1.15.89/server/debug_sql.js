const db = require('./db');

async function test() {
    try {
        console.log("Connecting...");
        // Mock connection params - assuming you have a valid connection saved in db.js or we need to connect first
        // Since db.js stores params in memory after checkConnection, we can't easily test this without a real connection.
        // But we can test the SQL generation logic if we extract it or mock the driver.

        // Let's just mock the columns based on the user's input
        const rawHeader = "COD_OPERADORA;IDENTIFICADOR_CONTRATO_COLETIVO;CREDENCIAL;TIPO_BENEFICIARIO;CPF;NOME;NOME_SOCIAL;DT_NASCIMENTO;SEXO;NOME_MAE;TIPO_LOGRADOURO;ENDERECO;NUMERO;COMPLEMENTO;BAIRRO;CIDADE;ESTADO;CEP;PONTO_REFERENCIA;CODIGO_MUNICIPIO;EMAIL;TELEFONES;DT_INICIO;IDENTIFICADOR_TABELA_VIGENTE;DT_AGENDAMENTO_CANCELAMENTO;PLANO;VALOR_TOTAL_ULTIMA_MENSALIDADE;VALOR_DA_SAUDE;VALOR_ODONTOLOGIA;DT_REFERENCIA_CARENCIA;COBERTURA_PARCIAL_TEMPORARIA;IDENTIDADE;ORGAO_EMISSOR_DA_IDENTIDADE;UF_DA_IDENTIDADE;ESTADO_CIVIL;CNS;COBRA_COPARTICIPACAO;CCO;COBRA_FRANQUIA;TIPO_CONTRATO_COLETIVO;DIA_BASE_VENCIMENTO;MATRICULA;CODIGO_DO_VENDEDOR;CODIGO_LOCACAO;FLAG_APOSENTADORIA;CODIGO_CARTEIRINHA;DT_ADMISSAO;VINCULO_AUXILAR;PENSIONISTA_AUXILIAR;MATRICULA_AUXILIAR;SUBSIDIU;CODIGO_CONCESSIONARIA;GRUPO_CARENCIA;TIPO_FATURAMENTO;ABRANGE;STATUS;DATA_SUSPENSAO;MOTIVO_SUSPENSAO;DATA_REFERENCIA_REAJUSTE;TIPO_CONTRATACAO_DIGITAL;CODIGO_CARTEIRINHA_SIGO";

        const headers = rawHeader.split(';');

        const columns = headers.map(h => {
            let cleanName = h.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
            if (cleanName.length > 28) cleanName = cleanName.substring(0, 28);
            return { name: cleanName, type: 'VARCHAR2(255)' };
        });

        const tableName = "TB_TEST_CARTEIRINHA";

        const colDefs = columns.map(c => `"${c.name}" ${c.type}`).join(', ');
        const createSql = `CREATE TABLE "${tableName}" (${colDefs})`;

        console.log("--- CREATE SQL ---");
        console.log(createSql);

        const colNames = columns.map(c => `"${c.name}"`).join(', ');
        const bindVars = columns.map((_, i) => `:${i + 1}`).join(', ');
        const insertSql = `INSERT INTO "${tableName}" (${colNames}) VALUES (${bindVars})`;

        console.log("--- INSERT SQL ---");
        console.log(insertSql);

        // Check for invalid chars
        if (createSql.includes(';')) console.error("ERROR: Semicolon found in CREATE SQL");
        if (insertSql.includes(';')) console.error("ERROR: Semicolon found in INSERT SQL");

    } catch (e) {
        console.error(e);
    }
}

test();
