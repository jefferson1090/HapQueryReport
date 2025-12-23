
const { parseSigoSql } = require('./services/sigoSqlParser');

// The massive SQL from the user
const testSql = `
SELECT 
       CD_EMPRESA_PLANO,
       CD_EMPRESA_CONVENIADA,
       CD_CONTRATO_MIGRADO,
       e.nm_pessoa_razao_social,
       NU_CGC_CPF, 
       nm_complemento, 
       e.fl_status,
       DECODE(FL_STATUS, 
              0, 'REGISTRADO', 
              1, 'PENDENTE', 
              2, 'ATIVO', 
              3, 'SUSPENSO', 
              4, 'CANCELADO') DS_SITUACAO,
       e.cd_modelo_corte,
       e.ds_endereco_eletronico,
       FL_TIPO_CONTRATO,
       DECODE(FL_TIPO_CONTRATO_EMP, 
              1, 'INDIVIDUAL/FAMILIAR', 
              3, 'ADESAO C/PATROCINIO', 
              4, 'ADESAO S/PATROCINIO', 
              5, 'COLETIVO C/PATROCINIO', 
              6, 'COLETIVO S/PATROCINIO') DS_TIPO_CONTRATO,
       FL_NATUREZA_EMPRESA,
       DECODE(FL_NATUREZA_EMPRESA, 
              0, 'NORMAL-PRE', 
              1, 'SINDICATO', 
              2, 'ASSOCIACAO', 
              3, 'COOPERATIVA', 
              4, 'GRUPO', 
              5, 'NORMAL-POS', 
              6, 'SIMPLES', 
              7, 'EMPRESA DO GOVERNO', 
              8, 'EMP.IND.VINC.COLET', 
              9, 'PEQ/MICRO EMPRESA') DS_TIPO_EMPRESA,
       dt_cadastramento, 
       dt_referencia_carencia,
       DT_CANCELAMENTO,
       e.cd_cancelamento,
       CD_EMPRESA_CONTROLE_UTILIZACAO,
       CD_EMPRESA_COBRANCA, 
       NVL(
           (SELECT v.cd_empresa_odonto 
            FROM tb_vcc_empresa v 
            WHERE v.cd_empresa_saude = e.cd_empresa_conveniada),
           (SELECT v.cd_empresa_saude 
            FROM tb_vcc_empresa v 
            WHERE v.cd_empresa_odonto = e.cd_empresa_conveniada)
          ) EMP_RELAC,
       CD_FILIAL, 
       CD_CARTEIRA_COBRANCA, 
       (SELECT DS_CARTEIRA 
        FROM TB_CARTEIRA_BANCO 
        WHERE CD_CARTEIRA= e.CD_CARTEIRA_COBRANCA) DS_CARTEIRA_COBRANCA,
       FL_TIPO_CONTRATO_EMP,
       DECODE(FL_TIPO_CONTRATO_EMP, 
              1, 'INDIVIDUAL/FAMILIAR', 
              3, 'ADESAO C/PATROCINIO', 
              4, 'ADESAO S/PATROCINIO', 
              5, 'COLETIVO C/PATROCINIO', 
              6, 'COLETIVO S/PATROCINIO') FL_TIPO_CONTRATO_EMP,
       FL_ENVIA_SIB,
       FL_TIPO_EMPRESA,
       DECODE(FL_TIPO_EMPRESA, 
              1, 'PRE-PAGAMENTO', 
              2, 'CONGENERE',
              3, 'C OPERACIONAL', 
              4, 'ABRANGE',
              5, 'CONG REP FIXO', 
              6, 'ADM CARTEIRA',
              7, 'EMP PARTICULAR', 
              8, 'SAUDE SIMPLES') DS_TIPO_EMPRESA,
       CD_CANAL_VENDA,
       DECODE(CD_CANAL_VENDA, 
              1, 'PIM  (individ/3-29 vidas)', 
              2, 'MPE (30-99 vidas)',
              3, 'MIDDLE (100-299 vidas)', 
              4, 'CORPORATE (acima de 300 vidas)',
              5, 'PROJ.ESPECIAL', 
              7, 'ADMINISTRADORA',
              8, 'LICITACAO', 
              9, 'CONVENCAO') DS_CANAL_VENDA,
       DT_DIA_PAGAMENTO,
       FL_TIPO_FATURAMENTO,
       DECODE(FL_TIPO_FATURAMENTO, 
              1, 'PRE PAGAMENTO', 
              2, 'POS PAGAMENTO') DS_TIPO_FATURAMENTO,
       CD_FORMA_PAGAMENTO,
       (SELECT DS_FORMA_PAGAMENTO 
        FROM TB_FORMA_PAGAMENTO 
        WHERE CD_FORMA_PAGAMENTO = e.CD_FORMA_PAGAMENTO) DS_FORMA_PAGAMENTO,
       CD_PLANO,
       (SELECT p.nm_plano 
        FROM tb_plano p 
        WHERE p.cd_plano = e.cd_plano) nm_plano,
       CD_TABELA,
       CD_TABELA_INATIVO,
       DT_VALIDADE_CONTRATO,
       (SELECT c.dt_validade_contrato 
        FROM incorpora.tb_ope_contrato_coletivo c 
        WHERE c.cd_operadora IN ('16','21') 
          AND c.cd_contrato = e.cd_contrato_migrado 
          AND ROWNUM = 1) DT_VALIDADE_CONTRATO_OPE,
       NU_EMPREGADO_CONVENIO,
       DT_DIA_COBERTURA,
       CD_EMPRESA_AGRUPADOR_AFASTADOS, 
       DT_DIA_LIMITE,				
				nvl((select l.dia_limite_acesso from tb_emp_limite_acesso_contra l 
			         Where l.cd_empresa_conveniada = e.cd_empresa_conveniada),
          (select TB_CONTROLE_INTERNET.DIA_LIMITE_ACESSO 
                  from
                  TB_CONTROLE_INTERNET,
                  tb_acesso_internet
                   where  
                      tb_acesso_internet.cd_pessoa =  e.cd_pessoa 
                  and tb_acesso_internet.cd_acesso = TB_CONTROLE_INTERNET.cd_acesso
                  and TB_CONTROLE_INTERNET.cd_servico = 7
                  and tb_acesso_internet.cd_tipo_acesso = 5)
          ) DIA_LIMITE_ACESSO,
        CD_MODALIDADE_PAG,
(select FL_CAD_FUT from TB_DIA_COBERTURA_EMP d where d.cd_empresa_conveniada = e.cd_empresa_conveniada) FL_CAD_FUT, 
(select FL_PRECO_FAMILIAR from TB_EMP_CONVENIADA_SAUDE_FLAGS s where e.cd_empresa_conveniada = s.cd_empresa_conveniada) FL_PRECO_FAMILIAR,
(select DT_DIA_FATURAMENTO from TB_EMP_CONVENIADA_SAUDE_FLAGS s where e.cd_empresa_conveniada = s.cd_empresa_conveniada) DT_DIA_FATURAMENTO,
(select d.qt_meses_faturamento from tb_emp_conveniada_saude_flags d where d.cd_empresa_conveniada = e.cd_empresa_conveniada) Mes_Faturamento, 
(select d.fl_gera_previa from tb_emp_conveniada_saude_flags d where d.cd_empresa_conveniada = e.cd_empresa_conveniada) fl_gera_previa,
(select d.dt_dia_geracao_previa from tb_emp_conveniada_saude_flags d where d.cd_empresa_conveniada = e.cd_empresa_conveniada) Val_Previa,
(select d.nu_dias_validade_previa from tb_emp_conveniada_saude_flags d where d.cd_empresa_conveniada = e.cd_empresa_conveniada) Dia_Previa,
(select d.qt_meses_previa from tb_emp_conveniada_saude_flags d where d.cd_empresa_conveniada = e.cd_empresa_conveniada) Mes_Previa,
nvl((Select l.dia_limite_acesso From tb_emp_limite_acesso_contra l Where e.cd_empresa_conveniada = l.cd_empresa_conveniada)
     ,( SELECT TB_CONTROLE_INTERNET.DIA_LIMITE_ACESSO
                  FROM TB_CONTROLE_INTERNET
                  JOIN tb_acesso_internet
                    ON tb_acesso_internet.cd_acesso = TB_CONTROLE_INTERNET.cd_acesso
                  WHERE tb_acesso_internet.cd_pessoa = e.cd_pessoa
                    AND TB_CONTROLE_INTERNET.cd_servico = 7
                    AND tb_acesso_internet.cd_tipo_acesso = 5
    )) dt_corte
From vw_empresa_conveniada_cad e;
`;

try {
    const result = parseSigoSql(testSql);
    console.log('--- PARSE RESULT ---');
    console.log(JSON.stringify(result, null, 2));

    // Check specific complex columns
    const columns = result.columns;
    const findCol = (name) => columns.find(c => c.name === name);

    // Test 1: Simple Aliased
    console.log('Test 1 (DS_SITUACAO):', findCol('DS_SITUACAO') ? 'OK' : 'FAIL');

    // Test 2: Subquery with Alias
    console.log('Test 2 (DS_CARTEIRA_COBRANCA):', findCol('DS_CARTEIRA_COBRANCA') ? 'OK' : 'FAIL');

    // Test 3: Complex NVL Subquery
    console.log('Test 3 (DIA_LIMITE_ACESSO):', findCol('DIA_LIMITE_ACESSO') ? 'OK' : 'FAIL');

    // Test 4: Implicit Subquery Alias (FL_CAD_FUT)
    console.log('Test 4 (FL_CAD_FUT):', findCol('FL_CAD_FUT') ? 'OK' : 'FAIL');

} catch (err) {
    console.error(err);
}
