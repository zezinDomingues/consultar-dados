// "Treino" do agente: o que o modelo precisa saber e não deve inventar.
// 1) DICIONARIO: termos do dia a dia → códigos CNAE reais desta base (conferidos
//    na tabela public.cnae em 04/11/2026). Pula uma ida à ferramenta e evita
//    código errado.
// 2) FATOS: referência tributária para as dúvidas gerais. Só entra aqui o que é
//    estável e conferido; o que muda (percentuais novos, prazos) vai com ressalva.

export const DICIONARIO = `
## Atalhos de códigos (use direto, sem buscar_codigos)
Transporte e logística
- transportadora / transporte de carga → cnaes ["4930201","4930202","4930203","4930204"] (municipal, intermunicipal, produtos perigosos, mudanças). "Transporte" em geral → ramos ["49"]
- logística, armazém, agenciamento de carga → ramos ["52"]
Comércio
- farmácia / drogaria → cnaes ["4771701"]; farmácia de manipulação → ["4771702"]; as duas → ["4771701","4771702"]
- supermercado / mercado → cnaes ["4711301","4711302","4712100"]
- padaria → cnaes ["4721102","1091102"]
- posto de combustível → cnaes ["4731800"]
- concessionária de carros → cnaes ["4511101","4511102"]; autopeças (comércio) → segmentos ["453"]
- material de construção (loja) → segmentos ["474"]; cosméticos (loja) → cnaes ["4772500"]
- atacadista de alimentos → segmentos ["463"]; comércio varejista em geral → ramos ["47"]; atacado em geral → ramos ["46"]
Alimentação e hotelaria
- restaurante → cnaes ["5611201"]; lanchonete → ["5611203"]; bar → ["5611204","5611205"]; alimentação em geral → ramos ["56"]
- hotel → cnaes ["5510801"]
Saúde
- clínica médica / consultório → cnaes ["8630501","8630502","8630503"]; odontologia / dentista → ["8630504"]
- hospital / pronto-socorro → cnaes ["8610101","8610102"]; laboratório / diagnóstico por imagem → segmentos ["864"]
- saúde em geral → setores ["Q"]; veterinária → cnaes ["7500100"]
Serviços
- contabilidade → cnaes ["6920601","6920602"]; advocacia → ["6911701"]; engenharia → ["7112000"]
- consultoria empresarial → cnaes ["7020400"]; publicidade / marketing → segmentos ["731"]
- TI / software / tecnologia → ramos ["62"] (dados e hospedagem: segmentos ["631"])
- vigilância / segurança privada → cnaes ["8011101"]; limpeza / facilities → cnaes ["8121400","8111700"]
- academia → cnaes ["9313100"]; escola / ensino / treinamento → ramos ["85"]
- imobiliária → cnaes ["6821801","6821802","6822600"]; incorporadora → ["4110700"]
- oficina mecânica → segmentos ["452"]
Construção
- construtora → cnaes ["4120400"] (com incorporadoras: + "4110700"); obras de infraestrutura → ramos ["42"]; instalações e serviços de obra → ramos ["43"]
Indústria (setor C)
- alimentos → ramos ["10"]; bebidas → ["11"]; têxtil e confecção → ["13","14"]; química → ["20"]; cosméticos (fábrica) → cnaes ["2063100"]
- plásticos e borracha → ramos ["22"]; metalurgia / produtos de metal → ["24","25"]; máquinas e equipamentos → ["28"]; veículos e autopeças (fábrica) → ["29"]
Outros
- agro / agronegócio → setores ["A"]; energia → setores ["D"]; geração de energia → cnaes ["3511501"]
- holding → cnaes ["6462000","6463800"] (ou tipos_negocio ["Holding / patrimonial"])
Se o termo não estiver aqui, use buscar_codigos (tente sinônimos antes de dizer que não existe).`

export const FATOS = `
## Referência tributária (use nas dúvidas gerais; não contradiga)
Regimes de IRPJ/CSLL
- Simples Nacional: receita bruta até R$ 4,8 milhões/ano (ME até R$ 360 mil; EPP de R$ 360 mil a R$ 4,8 milhões). Guia única (DAS) com alíquota por faixa e anexo; fator R em alguns serviços. Não entrega ECF.
- Lucro Presumido: permitido com receita do ano anterior até R$ 78 milhões (e se a atividade não obrigar ao Real). Base presumida sobre a receita: IRPJ 8% (comércio e indústria), 16% (transporte de passageiros), 8% (transporte de carga), 32% (serviços em geral), 1,6% (revenda de combustíveis); CSLL 12% (comércio, indústria e transporte) e 32% (serviços). Sobre a base: IRPJ 15% + adicional de 10% na parcela acima de R$ 20 mil/mês (R$ 60 mil/trimestre) e CSLL 9%. Apuração trimestral. PIS 0,65% e Cofins 3% cumulativos (sem créditos).
  Contas prontas (sem adicional, sobre a receita): comércio/indústria ≈ 1,2% IRPJ + 1,08% CSLL = 2,28%; serviços ≈ 4,8% + 2,88% = 7,68%. Somando PIS/Cofins (3,65%): comércio ≈ 5,93% + ICMS; serviços ≈ 11,33% + ISS (2% a 5%).
  Ressalva: houve mudança recente nas regras de presunção para parte da receita acima de R$ 5 milhões (corte de benefícios fiscais com efeito a partir de 2026). Diga que os percentuais vigentes devem ser confirmados com o contador.
- Lucro Real: obrigatório com receita acima de R$ 78 milhões, para bancos e financeiras, factoring, quem tem lucro ou rendimento do exterior, quem usa benefício fiscal de isenção/redução do IR, e quem paga por estimativa mensal. Imposto sobre o lucro contábil ajustado (Lalur): IRPJ 15% + 10% adicional, CSLL 9% (financeiras têm alíquota maior). Prejuízo fiscal compensa até 30% do lucro de cada período. PIS 1,65% e Cofins 7,6% não cumulativos, com créditos sobre insumos. Apuração trimestral ou anual (estimativas mensais).
- Quando cada um compensa (regra geral): margem real baixa ou prejuízo → Real tende a ser melhor; margem alta e poucos créditos → Presumido. A decisão exige simulação com o contador.
- Lucro Arbitrado: aplicado pelo Fisco (ou pela empresa) quando a escrituração não permite apurar Real/Presumido.
Obrigações
- ECF (Escrituração Contábil Fiscal): anual, pelo SPED, até o último dia útil de julho do ano seguinte; obrigatória para Real, Presumido, Arbitrado e imunes/isentas (o Simples não entrega). É dela que vem o regime desta base.
- ECD (contabilidade digital): obrigatória no Real; no Presumido, obrigatória para quem distribui lucro isento acima da base presumida (descontados os tributos).
CNAE e cadastro
- CNAE: seção (letra) → divisão (2 dígitos) → grupo (3) → classe (5) → subclasse (7). Nesta plataforma: setor = seção, ramo = divisão, segmento = grupo, atividade = subclasse.
- Porte da Receita: ME (até R$ 360 mil), EPP (até R$ 4,8 milhões), "Demais" (acima ou sem enquadramento).
Reforma tributária (EC 132/2023 e LC 214/2025)
- CBS (federal) substitui PIS/Cofins; IBS (estados e municípios) substitui ICMS e ISS; Imposto Seletivo sobre itens prejudiciais à saúde e ao meio ambiente.
- 2026: ano de teste (CBS 0,9% e IBS 0,1% destacados na nota, compensáveis). 2027: CBS plena, fim de PIS/Cofins, IPI zerado (exceto Zona Franca), início do Imposto Seletivo. 2029 a 2032: ICMS e ISS caem gradualmente. 2033: modelo completo.
- Não cumulatividade ampla (crédito do que foi pago na cadeia) e cobrança "por fora". Regimes diferenciados: redução de 60% para saúde, educação e outros listados; algumas cestas com alíquota zero.
- Simples Nacional continua; a partir de 2027 a empresa do Simples pode recolher IBS/CBS por fora para dar crédito integral aos clientes.
- IRPJ e CSLL não mudam com essa reforma (a reforma da renda é outra discussão).
Prospecção e LGPD
- Dados de empresa (razão social, CNPJ, endereço comercial) não são dados pessoais; e-mail e celular de sócios ou de empresário individual são. Prospecção B2B pode usar legítimo interesse (art. 7º, IX da LGPD) com transparência, mensagem relevante para a empresa e opção de descadastro.`
