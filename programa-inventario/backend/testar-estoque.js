const axios = require('axios');

const OMIE_APP_KEY = '2694922638408';
const OMIE_APP_SECRET = '02995c034ba5ba2ef1a297240bbb5bf5';

async function testarEstoque() {
  try {
    const hoje = new Date();
    const diaFormatado = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`;

    console.log('='.repeat(80));
    console.log('TESTE DE CONSULTA DE ESTOQUE');
    console.log('='.repeat(80));
    console.log(`Data: ${diaFormatado}`);
    console.log(`Produto teste: 2304889148 (PRFAACPPH29X95)`);
    console.log('');

    const response = await axios.post('https://app.omie.com.br/api/v1/estoque/resumo/', {
      call: 'ObterEstoqueProduto',
      app_key: OMIE_APP_KEY,
      app_secret: OMIE_APP_SECRET,
      param: [{
        cEAN: '',
        nIdProduto: 2304889148,
        cCodigo: '',
        dDia: diaFormatado
      }]
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    console.log('RESPOSTA DA API:');
    console.log('='.repeat(80));

    if (response.data.faultstring) {
      console.error('❌ ERRO NA API:', response.data.faultstring);
      console.log(JSON.stringify(response.data, null, 2));
      return;
    }

    console.log('✅ Sucesso! Dados recebidos:');
    console.log('');

    // Mostra estrutura completa
    console.log('ESTRUTURA COMPLETA DA RESPOSTA:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('');

    // Analisa os locais de estoque
    if (response.data.listaEstoque && Array.isArray(response.data.listaEstoque)) {
      console.log('='.repeat(80));
      console.log(`LOCAIS DE ESTOQUE ENCONTRADOS: ${response.data.listaEstoque.length}`);
      console.log('='.repeat(80));

      response.data.listaEstoque.forEach((loc, index) => {
        console.log(`\n[${index + 1}] Local: ${loc.cDescricaoLocal || 'SEM NOME'}`);
        console.log(`    Saldo: ${loc.nSaldo || 0}`);
        console.log(`    ID Local: ${loc.nIdlocal || 'N/A'}`);

        const descLower = (loc.cDescricaoLocal || '').toLowerCase();
        const isAlmoxarifado = descLower.includes('almoxarifado') || descLower.includes('materia prima');
        const isComercial = descLower.includes('comercial');

        if (isAlmoxarifado) {
          console.log(`    >>> MATCH ALMOXARIFADO ✓`);
        }
        if (isComercial) {
          console.log(`    >>> MATCH COMERCIAL ✓`);
        }
      });

      console.log('\n' + '='.repeat(80));
    } else {
      console.log('❌ ATENÇÃO: Não há array "listaEstoque" na resposta!');
      console.log('Campos disponíveis:', Object.keys(response.data));
    }

  } catch (error) {
    console.error('❌ ERRO AO FAZER REQUISIÇÃO:', error.message);
    if (error.response) {
      console.log('Resposta do servidor:', error.response.data);
    }
  }
}

console.log('\n');
testarEstoque().then(() => {
  console.log('\n\nTESTE CONCLUÍDO!\n');
}).catch(err => {
  console.error('Erro fatal:', err);
});
