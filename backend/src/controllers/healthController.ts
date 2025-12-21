
import { Request, Response } from 'express';
import { HealthService } from '../services/healthService';

const healthService = HealthService.getInstance();

export const checkStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const status = await healthService.checkHealth();
        // Return 200 even if degraded, so frontend can read the body. 
        // Only return 500 if the check itself blew up completely (which shouldn't happen due to internal try/catch)
        res.json(status);
    } catch (error: any) {
        res.status(500).json({
            status: 'offline',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
};
