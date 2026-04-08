import { Router } from 'express';
import { refineTemplate } from '../services/ai.service';

const router = Router();

// Rota para polir o template com IA
router.post('/polish', async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Texto é obrigatório para o refinamento.' });
  }

  try {
    const polishedText = await refineTemplate(text);
    return res.json({ polishedText });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao processar o refinamento da IA.' });
  }
});

export default router;
