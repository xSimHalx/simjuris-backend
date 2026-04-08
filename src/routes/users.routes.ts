import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../server';
import { ensureAuthenticated } from '../middlewares/auth.middleware';

const router = Router();
router.use(ensureAuthenticated);

// Buscar perfil atual
router.get('/me', async (req, res): Promise<any> => {
  try {
    const { userId } = req.user!;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, nome: true, email: true, role: true, telefone: true }
    });
    return res.json(user);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao buscar perfil.' });
  }
});

// Atualizar perfil (Nome, Email ou Senha)
router.patch('/profile', async (req, res): Promise<any> => {
  try {
    const { userId } = req.user!;
    const { nome, email, password } = req.body;

    const data: any = {};
    if (nome) data.nome = nome;
    if (email) data.email = email;
    if (password) {
      data.senha_hash = await bcrypt.hash(password, 10);
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, nome: true, email: true, role: true }
    });

    return res.json(updatedUser);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Este e-mail já está em uso.' });
    }
    return res.status(500).json({ error: 'Erro ao atualizar perfil.' });
  }
});

export default router;
