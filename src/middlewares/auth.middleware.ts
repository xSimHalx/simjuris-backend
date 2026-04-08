import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

interface TokenPayload {
  userId: string;
  tenantId: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export function ensureAuthenticated(req: Request, res: Response, next: NextFunction): any {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Token não fornecido. Necessário Login.' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2) {
    return res.status(401).json({ error: 'Erro no formato do Token JWT' });
  }

  const [scheme, token] = parts;
  if (!/^Bearer$/i.test(scheme)) {
    return res.status(401).json({ error: 'Token mal formatado' });
  }

  try {
    const jwtSecret = process.env.JWT_SECRET || 'legalmemo_default_secret_2026';
    const decoded = jwt.verify(token, jwtSecret) as TokenPayload;
    req.user = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Token JWT inválido ou expirado' });
  }
}
