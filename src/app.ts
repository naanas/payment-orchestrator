import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

// Routes
import paymentRoutes from './routes/payment.routes';
import adminRoutes from './routes/admin.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'payment-orchestrator',
    version: '1.0.0'
  });
});

// Root
app.get('/', (req, res) => {
  res.json({
    message: 'Payment Orchestrator API',
    endpoints: {
      health: '/health',
      payments: {
        methods: 'GET /api/payments/methods',
        create: 'POST /api/payments/create',
        status: 'GET /api/payments/status/:transaction_id'
      },
      admin: {
        login: 'POST /api/admin/login',
        dashboard: 'GET /api/admin/dashboard',
        partners: 'GET /api/admin/partners',
        transactions: 'GET /api/admin/transactions'
      }
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`
  });
});

// Error handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Server error:', err);
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 http://localhost:${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/health`);
});