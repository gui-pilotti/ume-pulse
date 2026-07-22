# Ume Pulse — Smart Reactivation Engine

Plataforma interativa para decidir campanhas de reativação de clientes em bases adimplentes. Estrutura a decisão em 4 passos: **Quem reativar → Vale a pena → Executar → Medir**.

## Links

- **Aplicativo:** https://ume-pulse.vercel.app
- **Documentação do Case:** https://ume-pulse.vercel.app/case_document.html

## Rodando localmente

```bash
cd app
npm install
npm run dev
```

Acesse http://localhost:5173

## Arquitetura

- **Frontend:** React + Vite
- **Dados:** Planilha Excel (clientes adimplentes, histórico de compras, limite, score)
- **Deploy:** Vercel

## Fluxo

1. **Quem reativar?** — Escolha um segmento pré-definido ou crie um customizado
2. **Vale a pena?** — Veja projeção de retorno por cenário (2%, 5%, 10% de conversão)
3. **Executar** — Configure canal, grupo controle, revise mensagens e exporte CSV
4. **Medir** — Registre conversões e calcule ROI incremental

## Guard Rails

- Sobreposição de campanhas verificada
- Cooldown de 30 dias entre contatos
- Score mínimo configurável

## Documentação

Ver `app/public/case_document.html` para análise completa: estruturação do problema, leitura dos dados, lógica de decisão, comprovação e decisões tomadas.
