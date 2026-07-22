# Smart Reactivation Engine — Write-up

**Case Product Builder · Ume**
Protótipo: `app/` (React + Vite) · Dados: `(Ume) Case_builder_ base.xlsx` (100% dos números exibidos vêm da planilha; toda projeção que depende de premissa está rotulada como premissa e é editável na ferramenta)

---

> ## A Ume está sentada em R$ 19.861.944 de limite aprovado e não usado.
>
> Esse valor está distribuído em **43.188 clientes adimplentes** cujo CAC de R$ 50–75 **já foi pago**. Reativar um deles custa de R$ 0,00 (push) a R$ 0,30 (WhatsApp); adquirir um cliente novo custa R$ 50. Essa assimetria de ~170x é a maior alavanca de crescimento disponível na base — e hoje ela é operada no feeling, com blasts de WhatsApp cujo retorno ninguém consegue medir.
>
> A ferramenta que construí transforma essa assimetria em campanhas com **ROI provado**: cada campanha nasce como um experimento com grupo de controle, orçamento máximo, critério de parada e projeção de retorno explícita.

---

## Stage 0 — Framing: do problema vago ao problema tratável

**O problema como chegou:** "nossa base não recompra, e as campanhas de reativação são no achismo — exportamos planilha, escolhemos clientes no olho, disparamos WhatsApp em massa e ninguém sabe se deu lucro ou prejuízo."

**O problema reformulado:** *Maximizar a receita incremental da base adimplente dormente via campanhas de mensageria, garantindo que (a) cada campanha tenha ROI esperado positivo antes de ser disparada e (b) o ROI realizado seja mensurável depois — isolado de efeito orgânico por grupo de controle.*

**Métrica de sucesso (norte):**

```
ROI da campanha = (Receita incremental — Custo da campanha) / Custo da campanha
```

onde *receita incremental* = receita do grupo tratamento − receita esperada sem campanha (estimada pelo grupo de controle), e *receita* = taxa de processamento (3% sobre vendas) + juros do parcelamento.

**Métricas de guarda (não podem piorar):** taxa de opt-out/bloqueio nos canais, inadimplência da coorte reativada.

**Dentro do escopo:** os 43.188 adimplentes — quem tem limite aprovado e pode comprar agora.

**Fora do escopo (e por quê):**
| Excluído | Qtd | Razão |
|---|---|---|
| Crédito negado | 151.855 | Não têm limite para usar; reativá-los é outro produto (reanálise de crédito) |
| Inadimplentes | 5.549 | Estimular compra de quem já deve aumenta a perda; o produto certo é cobrança/renegociação |
| Aquisição de novos clientes | — | Outro motion, outro CAC, outro funil |

---

## Stage 1 — Leitura dos dados: o que a base diz

### O que fiz
Converti a planilha (200.592 linhas) em dados estruturados e explorei distribuições de compras, dormência, limite, score, canal e app. Tudo que está no protótipo é recalculado ao vivo a partir desses dados.

### As três descobertas que definem a estratégia

**1. A "reativação" da Ume é, na maioria, ativação.**
46,6% dos adimplentes (**20.141 clientes**) foram aprovados e **nunca fizeram uma compra**. Eles têm em média **R$ 393 de limite disponível** e score médio alto. O CAC deles já foi pago — cada conversão aqui é receita nova a custo de mensagem.

**2. Não existe cliente ativo na base.**
Entre os 23.047 adimplentes com histórico de compra, a compra mais recente foi há **~83 dias**. Distribuição da dormência: 1.657 clientes (90 dias ou menos), 10.391 (90–180d), 6.760 (180–365d), 4.074 (365d+). Implicação: não há risco de "incomodar cliente ativo" — toda a base é elegível, e o timing é urgente porque conversão cai com dormência.

**3. O canal grátis está subaproveitado.**
39,8% dos adimplentes (**17.175**) têm o app instalado — onde o push custa **R$ 0,00**. Qualquer estratégia que não comece por push está queimando dinheiro.

### Dimensionamento da oportunidade (cenário conservador)

Piloto real montado na ferramenta — segmento "nunca compraram, score 700+" (13.418 clientes, score médio 851, limite médio R$ 393):

| | Valor |
|---|---|
| Custo da campanha (cascata push→WhatsApp) | R$ 3.433 |
| Conversões esperadas (premissa conservadora ~1% efetiva) | ~121 clientes |
| Receita estimada (processamento + juros) | R$ 10.237 |
| **ROI projetado** | **+198%** |
| CAC de reativação implícito | ~R$ 28 vs. R$ 50–75 de aquisição |
| Custo vs. blast WhatsApp na base toda | R$ 3.433 vs. R$ 12.956 (**economia de 73,5%**) |

### O que assumi (e por quê é honesto assumir)

A planilha não contém histórico de campanhas — logo, **taxas de conversão não podem ser derivadas dos dados**. Assumi taxas conservadoras por perfil (3% para quem nunca comprou; 15%→3% decrescendo com a dormência, aplicadas *após* a taxa de abertura do canal) e ticket = 50% do limite disponível. As três decisões de design que tornam essas premissas seguras:

1. Elas estão **expostas e editáveis** na ferramenta (painel "Premissas do modelo"), nunca escondidas no código;
2. A primeira campanha com grupo de controle existe **justamente para substituí-las por números medidos**;
3. Errar a premissa para baixo custa oportunidade; errar para cima custa no máximo o orçamento da campanha — que tem teto e kill switch.

### Perguntas que eu faria à Ume antes de escalar

1. **Existe vínculo cliente↔varejo?** A Base de Varejo (85 varejos, 16 segmentos) não se conecta à Base de Clientes no arquivo. Com esse vínculo, o targeting mudaria de "quem reativar" para "quem reativar *em qual parceiro*", e a oferta na mensagem ficaria muito mais forte (ex.: cliente dormente de farmácia ≠ cliente dormente de material de construção).
2. **A taxa de abertura de push é 4% mesmo?** Na planilha, a linha do push está rotulada como "taxa de abertura de SMS" (aparente erro de rótulo) com 4% — abaixo do benchmark típico de push. Como push é o canal de custo zero, esse número muda a estratégia inteira.
3. **Qual o histórico de opt-out/bloqueio dos blasts anteriores?** Define o quão agressivo o guardrail de frequência precisa ser.

---

## Stage 2 — Lógica de decisão: quem, como, com que proteções

### Quem entra na campanha

Segmentação por comportamento (os quatro presets da ferramenta espelham isto):

| Segmento | Tamanho | Tese |
|---|---|---|
| Nunca compraram, score alto (700+) | 13.418 | Ativação pura; risco de crédito baixo; maior massa |
| Compraram 1x, dormência < 180d | ~750 | Conheceram o produto e ainda estão "mornos" |
| Recorrentes de alto valor (5+ compras, limite ≥ R$ 300) | milhares | Hábito comprovado; maior ticket esperado |
| Tem app, nunca comprou | ~680 | Custo de contato zero; teste gratuito de mensagem |

### Quem NUNCA entra (exclusões automáticas da ferramenta)

- Crédito negado e inadimplentes (nem carregados no universo da ferramenta);
- Limite disponível = R$ 0 (não têm o que gastar — mensagem seria puro custo e desgaste);
- Contatados em campanha nos últimos 30 dias (guardrail de fadiga — a ferramenta avisa a sobreposição).

### Qual canal — cascata por custo-eficiência

```
tem app?  ──sim──▶  PUSH (R$ 0,00)
   │
   não
   ▼
valor esperado alto?  ──sim──▶  WHATSAPP (R$ 0,30 · 35% abertura)
   │
   não
   ▼
SMS (R$ 0,03 · 5% abertura)
```

A regra que liga custo a retorno: WhatsApp (canal caro) só é usado quando o valor esperado do cliente (limite disponível × taxa de processamento) justifica os R$ 0,30. Para o resto, SMS entrega alcance a 1/10 do custo.

### Guardrails (todos implementados na ferramenta)

| Guardrail | Como funciona | Contra o quê protege |
|---|---|---|
| Orçamento máximo | Bloqueio com alerta se custo > teto | Campanha desproporcional |
| Grupo de controle (default 10%) | Split determinístico por ID; controle não recebe nada | Atribuir à campanha o que era conversão orgânica |
| Kill switch | "Pausar se conversão < X% após N dias" registrado por campanha | Queimar orçamento em campanha morta |
| Anti-fadiga | Alerta se o público intersecta campanhas dos últimos 30 dias | Desgastar a base / opt-out |
| ROI projetado antes do disparo | Nenhuma campanha sai sem projeção explícita de custo vs. retorno | O blast no feeling |

---

## Stage 4 — Prova e handoff

### Como saber se funcionou (de verdade)

O desenho é experimental por padrão:

1. **Randomização:** todo público é dividido em tratamento (recebe) e controle (não recebe) — split determinístico por ID, exportado no CSV da campanha (coluna `grupo`).
2. **Janela de medição:** 30 dias pós-disparo.
3. **Efeito real** = conversão(tratamento) − conversão(controle). Receita incremental = esse delta × ticket médio realizado × (3% + juros efetivos).
4. **Decisão ao fim da janela:** ROI realizado > 0 → escalar o segmento; ROI ≤ 0 → matar ou re-segmentar. Sem zona cinzenta.

### Critérios de parada (kill criteria)

- **Durante a campanha:** conversão do tratamento < 1% após 7 dias → pausa automática sugerida (parâmetro editável por campanha);
- **Guarda de reputação:** opt-out/bloqueio > 5% no canal → pausa imediata independente do ROI;
- **Guarda de crédito:** se a inadimplência da coorte reativada superar a da base, o segmento sai do targeting (reativar quem não paga é prejuízo disfarçado de receita).

### Handoff para o negócio

> "Antes: exportávamos a planilha, escolhíamos no olho e disparávamos WhatsApp para todo mundo — R$ 12.956 por blast, retorno desconhecido. Agora: a ferramenta ranqueia a base, monta o público, escolhe o canal mais barato que alcança cada cliente, projeta o ROI antes do disparo e separa um grupo de controle que prova o efeito depois. A primeira campanha piloto custa R$ 3.433 (73% menos que um blast) e já sai medindo a si mesma."

Rotina proposta para o Growth: 1 campanha-piloto por segmento nas primeiras 4 semanas (começando por "tem app, nunca comprou", que custa R$ 0) → calibrar as premissas com os resultados do controle → escalar os segmentos vencedores.

### Handoff para a engenharia (o que falta para produção)

O protótipo decide; não dispara. Para produção, em ordem de prioridade:

1. **Integração de disparo** (API WhatsApp Business / gateway SMS / push) consumindo o CSV que a ferramenta já exporta — é o único bloqueio real;
2. **Ingestão de conversões** (webhook de vendas) para fechar o loop de medição automaticamente, substituindo a análise manual do CSV;
3. **Dados vivos**: trocar o snapshot da planilha por leitura do banco (a lógica de segmentação/scoring é pura função sobre os mesmos campos — porta direta);
4. **Frequency cap centralizado** se outras áreas também disparam mensagens.

Dívidas conscientes do protótipo (escolhas, não esquecimentos): dados em snapshot local, persistência em localStorage, premissas de conversão assumidas — todas resolvidas pelos itens acima e pela primeira rodada de campanhas medidas.

---

## Apêndice — Decision log (resumo)

| Decisão | Alternativa descartada | Por quê |
|---|---|---|
| Universo = só adimplentes | Incluir negados/inadimplentes | Outros produtos (reanálise, cobrança); misturar contamina a métrica |
| Experimento por padrão (controle em toda campanha) | Medir "antes vs. depois" | Antes/depois não isola sazonalidade nem conversão orgânica |
| Premissas expostas e editáveis na UI | Hardcode no modelo | Premissa escondida vira "verdade"; exposta, vira hipótese a calibrar |
| Cascata de canal começando por push | WhatsApp para todos (status quo) | 39,8% da base alcançável a custo zero; WhatsApp só onde o valor esperado paga |
| Base de Varejo fora do targeting | Forçar um uso decorativo | Sem vínculo cliente↔varejo nos dados, qualquer uso seria inventado — virou a pergunta #1 à Ume |
