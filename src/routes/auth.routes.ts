import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../server';
import { sendMail } from '../utils/mail';

const router = Router();

router.post('/login', async (req, res): Promise<any> => {
  try {
    const loginSchema = z.object({
      email: z.string().email('E-mail inválido'),
      password: z.string().min(4, 'Senha muito curta')
    });

    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { tenant: true }
    });

    if (!user) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos. Verifique suas credenciais.' });
    }

    if (user.tenant.status_assinatura === 'CANCELADO') {
      return res.status(403).json({ error: 'Assinatura do escritório suspensa' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.senha_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos. Verifique suas credenciais.' });
    }

    const jwtSecret = process.env.JWT_SECRET || 'simjuris_default_secret_2026';
    const token = jwt.sign(
      { userId: user.id, tenantId: user.tenant_id, role: user.role },
      jwtSecret,
      { expiresIn: '1d' }
    );

    const { senha_hash, ...userWithoutPassword } = user;
    return res.json({ token, user: userWithoutPassword });

  } catch (error) {
    console.error('Erro no login:', error);
    return res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Solicitacao de recuperação de senha
router.post('/forgot-password', async (req, res): Promise<any> => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ 
      where: { email },
      include: { tenant: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'E-mail não encontrado no sistema.' });
    }

    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

    await prisma.user.update({
      where: { id: user.id },
      data: {
        reset_password_code: resetCode,
        reset_password_expires: expires
      }
    });

    const message = `🔐 *SimJuris - Recuperação de Senha*\n\nSeu código de verificação é: *${resetCode}*\n\nEste código expira em 15 minutos. Se você não solicitou isso, ignore este aviso.`;

    let sentViaWhatsApp = false;

    // 1. Tenta enviar via WhatsApp (se houver instancia conectada)
    if (user.tenant.evolution_instance_id && user.telefone) {
      try {
        const { evolutionQueue } = require('../queue/evolution.queue');
        await evolutionQueue.add('send-message', {
          numero_destino: user.telefone,
          conteudo_mensagem: message,
          evolution_instance_id: user.tenant.evolution_instance_id,
          tenant_id: user.tenant_id
        });
        sentViaWhatsApp = true;
      } catch (e) {
        console.error('Falha ao enfileirar recuperação por WhatsApp:', e);
      }
    }

    // 2. Fallback E-mail (via Nodemailer)
    const emailResult = await sendMail(
      user.email, 
      '🔐 Código de Recuperação - SimJuris', 
      message, 
      `<h3>Recuperação de Senha - SimJuris</h3><p>Seu código de verificação é: <b>${resetCode}</b></p><p>Válido por 15 minutos.</p>`
    );

    return res.json({ 
      success: true, 
      message: sentViaWhatsApp ? 'Código enviado via WhatsApp.' : 'Código enviado via E-mail.',
      method: sentViaWhatsApp ? 'whatsapp' : 'email'
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao processar recuperação.' });
  }
});

// Reset real da senha
router.post('/reset-password', async (req, res): Promise<any> => {
  try {
    const { email, code, newPassword } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || user.reset_password_code !== code) {
      return res.status(400).json({ error: 'Código inválido ou expirado.' });
    }

    if (user.reset_password_expires && user.reset_password_expires < new Date()) {
      return res.status(400).json({ error: 'Código expirado.' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        senha_hash: hashed,
        reset_password_code: null,
        reset_password_expires: null
      }
    });

    return res.json({ success: true, message: 'Senha alterada com sucesso!' });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao redefinir senha.' });
  }
});

export default router;
