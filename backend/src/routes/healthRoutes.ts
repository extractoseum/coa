
import express from 'express';
import { checkStatus } from '../controllers/healthController';

const router = express.Router();

router.get('/', checkStatus);

export default router;
