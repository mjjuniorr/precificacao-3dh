# Uso do sistema

1. Acesse o endereco do sistema.
2. Entre com a senha definida em `APP_PASSWORD`.
3. Selecione um ou mais XMLs de NF-e.
4. Informe os parametros gerais:
   - frete total da nota ou frete unitario por produto;
   - outros custos totais ou unitarios;
   - ICMS estimado, informado manualmente;
   - imposto de venda;
   - margem desejada.
5. Clique em **Processar NF-e**.
6. Revise o resumo no topo.
7. Revise o preco sugerido e ajuste categoria, frete, custos, impostos, margem ou valor de mercado em cada item.
8. Clique no icone de salvar da linha editada.
9. Consulte o resumo e a conclusao automatica abaixo da tabela.
10. Exporte para CSV ou XLSX quando a tabela estiver pronta. O XLSX inclui o resumo ao final.

## Consulta e versoes

- Use os campos do Historico para consultar pelo fornecedor, CNPJ ou numero da NF-e.
- Cada registro mostra o responsavel, data, hora e numero da versao.
- Se uma chave de acesso ja tiver sido usada, o sistema oferece abrir a precificacao existente ou criar uma nova versao.
- Alteracoes manuais registram o responsavel e o horario da ultima atualizacao.

Produtos repetidos pelo mesmo SKU sao consolidados automaticamente. O custo de compra unitario consolidado usa media ponderada pela quantidade.

Os impostos existentes no XML nao entram nos calculos. O custo completo estimado da venda usa apenas os percentuais informados no sistema.

Quando frete ou outros custos forem informados como total da nota, o sistema divide o valor pela quantidade total de unidades importadas.
