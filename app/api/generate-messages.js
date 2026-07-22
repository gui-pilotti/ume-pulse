// Vercel serverless function — gera variantes de mensagem de reativação via Claude.
// A chave fica em ANTHROPIC_API_KEY (env var na Vercel); nunca chega ao browser.
import Anthropic from '@anthropic-ai/sdk';

const MESSAGE_SCHEMA = {
  type: 'object',
  properties: {
    channels: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          channel: { type: 'string', enum: ['whatsapp', 'sms', 'push'] },
          variants: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', enum: ['A', 'B'] },
                title: { type: 'string' },
                body: { type: 'string' },
              },
              required: ['label', 'title', 'body'],
              additionalProperties: false,
            },
          },
        },
        required: ['channel', 'variants'],
        additionalProperties: false,
      },
    },
  },
  required: ['channels'],
  additionalProperties: false,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(501).json({ demo: true, error: 'ANTHROPIC_API_KEY não configurada' });
  }

  const { profile } = req.body || {};
  if (!profile) {
    return res.status(400).json({ error: 'profile obrigatório' });
  }

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2048,
      output_config: { format: { type: 'json_schema', schema: MESSAGE_SCHEMA } },
      system:
        'Você é copywriter de CRM da Ume, plataforma de crédito e pagamentos que permite ' +
        'clientes parcelarem compras nos varejos parceiros. Escreva mensagens de reativação ' +
        'em português brasileiro, tom caloroso e direto, sem pressão agressiva, sem emojis em excesso ' +
        '(máx 1 por mensagem). Restrições por canal: WhatsApp até 300 caracteres; SMS até 160 caracteres ' +
        '(sem emoji); push com título até 40 caracteres e corpo até 120. Nunca invente valores de limite ' +
        'específicos por cliente — fale em "seu limite disponível". Sempre inclua um call-to-action claro. ' +
        'Gere exatamente 2 variantes (A e B) por canal, com abordagens diferentes entre si para teste A/B.',
      messages: [
        {
          role: 'user',
          content:
            `Gere mensagens de reativação para este segmento de clientes:\n${JSON.stringify(profile, null, 2)}\n` +
            `Canais necessários: ${(profile.channels || ['whatsapp', 'sms', 'push']).join(', ')}.`,
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      return res.status(502).json({ error: 'Geração recusada pelo modelo' });
    }

    const text = response.content.find((b) => b.type === 'text')?.text || '{}';
    return res.status(200).json({ demo: false, result: JSON.parse(text) });
  } catch (err) {
    return res.status(502).json({ error: err?.message || 'Erro na geração' });
  }
}
