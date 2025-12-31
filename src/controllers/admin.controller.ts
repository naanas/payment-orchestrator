import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../config/supabase';

export class AdminController {
  
  // =================================================================
  // [CONFIG] Ambil Fee Dinamis dari Payment Method
  // =================================================================
  static async getConfig(req: Request, res: Response) {
    try {
      const methodCode = req.query.code as string;

      if (!methodCode) {
        return res.status(400).json({ 
          success: false, 
          message: "Parameter 'code' wajib dikirim (contoh: ?code=BCA_VA)" 
        });
      }

      const { data, error } = await db.paymentMethods()
        .select(`
          code,
          name,
          payment_partners (
            name,
            fee_structure
          )
        `)
        .eq('code', methodCode)
        .eq('is_active', true) // Pastikan tabel payment_methods punya kolom is_active
        .single();

      if (error || !data) {
        console.warn(`Metode pembayaran '${methodCode}' tidak ditemukan atau tidak aktif.`);
        return res.status(404).json({
          success: false,
          message: `Metode pembayaran '${methodCode}' tidak tersedia.`
        });
      }

      let adminFee = 0;
      const partner = (data as any).payment_partners; 

      if (partner && partner.fee_structure) {
        const structure = partner.fee_structure;
        if (typeof structure === 'number') {
           adminFee = structure;
        } else if (typeof structure === 'object') {
           adminFee = Number(structure.flat || structure.fixed || structure.admin_fee || 0);
        } else if (typeof structure === 'string') {
           adminFee = Number(structure);
        }
      }

      res.json({
        success: true,
        data: {
          admin_fee: adminFee,
          method_name: data.name,
          provider: partner?.name,
          currency: 'IDR'
        }
      });

    } catch (error: any) {
      console.error("Config Error:", error.message);
      res.status(500).json({ 
        success: false, 
        message: "Gagal mengambil konfigurasi Admin Fee",
        error: error.message 
      });
    }
  }

  // =================================================================
  // AUTH & DASHBOARD
  // =================================================================

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
        { expiresIn: 500 }
      );

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

      const { data: recentTransactions } = await db.transactions()
        .select('*, payment_partners(name, code), payment_methods(name)')
        .order('created_at', { ascending: false })
        .limit(10);

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

  // =================================================================
  // PARTNERS MANAGEMENT
  // =================================================================

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

  // [PERBAIKAN UTAMA ADA DI SINI]
  static async createPartner(req: Request, res: Response) {
    try {
      const { name, code, type, is_active, fee_structure, credentials, mapping_schema } = req.body;

      // Validasi Input
      if (!name || !code || !type) {
        return res.status(400).json({ success: false, error: 'Name, code, and type are required' });
      }

      // Logic Mapping: Jika is_active false -> INACTIVE, selain itu ACTIVE
      const statusValue = (is_active === false) ? 'INACTIVE' : 'ACTIVE';

      // Insert ke DB
      const { data: partner, error } = await db.paymentPartners()
        .insert({
          name,
          code,
          type,
          // Field 'is_active' dihapus, diganti dengan 'status'
          status: statusValue,
          fee_structure,
          credentials,
          mapping_schema,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      // Log Audit
      await db.auditLogs().insert({
        user_id: (req as any).user.id,
        action: 'CREATE_PARTNER',
        entity_type: 'payment_partner',
        entity_id: partner.id,
        new_value: req.body,
        ip_address: req.ip
      });

      res.status(201).json({ success: true, data: partner });
    } catch (error: any) {
      console.error("Create Partner Failed:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updatePartner(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Jika update menyertakan is_active, perlu dimapping ke status juga
      if (updates.is_active !== undefined) {
         updates.status = (updates.is_active === false) ? 'INACTIVE' : 'ACTIVE';
         delete updates.is_active; // Hapus field agar tidak error saat update
      }

      const { data: partner } = await db.paymentPartners()
        .update(updates)
        .eq('id', id)
        .select()
        .single();

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