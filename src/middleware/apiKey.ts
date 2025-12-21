import { Request, Response, NextFunction } from 'express';
import { db } from '../config/supabase';

export const apiKeyMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Ambil key dari Header 'x-server-key'
    const serverKey = req.headers['x-server-key'] as string;

    if (!serverKey) {
      return res.status(401).json({ 
        success: false, 
        error: 'Unauthorized: Missing x-server-key header' 
      });
    }

    // 2. Cek ke Database Merchants
    const { data: merchant, error } = await db.merchants()
      .select('id, name')
      .eq('server_key', serverKey)
      .eq('is_active', true)
      .single();

    if (error || !merchant) {
      return res.status(403).json({ 
        success: false, 
        error: 'Forbidden: Invalid Server Key' 
      });
    }

    // 3. (Opsional) Attach info merchant ke request
    (req as any).merchant = merchant;

    next();
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error Check Key' });
  }
};