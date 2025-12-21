import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../config/supabase';

export class AdminController {
  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      
      const { data: user } = await db.users()
        .select('*')
        .eq('email', email)
        .single();

      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET!,
        { expiresIn: 500 } // Gunakan angka 300 (detik) untuk 5 menit
      );

      // Update last login
      await db.users()
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', user.id);

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role
          },
          token
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getDashboard(req: Request, res: Response) {
    try {
      // Get stats
      const { count: totalTx } = await db.transactions()
        .select('*', { count: 'exact', head: true });

      const { count: successTx } = await db.transactions()
        .select('*', { count: 'exact', head: true })
        .eq('status', 'SUCCESS');

      const { count: pendingTx } = await db.transactions()
        .select('*', { count: 'exact', head: true })
        .eq('status', 'PENDING');

      const { count: activePartners } = await db.paymentPartners()
        .select('*', { count: 'exact', head: true })
        .eq('status', 'ACTIVE');

      // Get recent transactions
      const { data: recentTransactions } = await db.transactions()
        .select('*, payment_partners(name, code), payment_methods(name)')
        .order('created_at', { ascending: false })
        .limit(10);

      // Get today's revenue
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data: todayTx } = await db.transactions()
        .select('fee')
        .eq('status', 'SUCCESS')
        .gte('created_at', today.toISOString());

      const todayRevenue = todayTx?.reduce((sum: number, tx: any) => sum + (tx.fee || 0), 0) || 0;

      res.json({
        success: true,
        data: {
          stats: {
            total_transactions: totalTx || 0,
            success_transactions: successTx || 0,
            pending_transactions: pendingTx || 0,
            active_partners: activePartners || 0,
            today_revenue: todayRevenue,
            success_rate: totalTx ? ((successTx || 0) / totalTx * 100).toFixed(2) : 0
          },
          recent_transactions: recentTransactions
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getPartners(req: Request, res: Response) {
    try {
      const { data: partners } = await db.paymentPartners()
        .select('*')
        .order('created_at', { ascending: false });

      res.json({ success: true, data: partners });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async updatePartner(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const { data: partner } = await db.paymentPartners()
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      // Log audit
      await db.auditLogs().insert({
        user_id: (req as any).user.id,
        action: 'UPDATE_PARTNER',
        entity_type: 'payment_partner',
        entity_id: id,
        new_value: updates,
        ip_address: req.ip
      });

      res.json({ success: true, data: partner });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getTransactions(req: Request, res: Response) {
    try {
      const { page = 1, limit = 20, status, partner_id } = req.query;
      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

      let query = db.transactions()
        .select('*, payment_partners(name, code), payment_methods(name)')
        .order('created_at', { ascending: false })
        .range(offset, offset + parseInt(limit as string) - 1);

      if (status) query = query.eq('status', status);
      if (partner_id) query = query.eq('partner_id', partner_id);

      const { data: transactions, error, count } = await query;

      if (error) throw error;

      res.json({
        success: true,
        data: transactions,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total: count
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}