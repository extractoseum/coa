
import express from 'express';
import { requireAuth, requireRole } from '../middleware/authMiddleware';
import { listKnowledgeFiles, readKnowledgeFile, saveKnowledgeFile, uploadKnowledgeFile, deleteKnowledgeFile, setActiveAgent, createNewAgent, markAsInstructive, getToolsRegistry, getAgentsMetadata } from '../controllers/knowledgeController';
import multer from 'multer';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Protected Routes (Admin/Staff/SuperAdmin only)
// Standardizing access control for Knowledge Base management
router.use(requireAuth);
router.use(requireRole('admin', 'super_admin', 'staff'));

// List all folders and files
router.get('/', listKnowledgeFiles);

// Upload file
router.post('/upload', upload.single('file'), uploadKnowledgeFile);

// Get specific file content
router.get('/:folder/file', readKnowledgeFile);

// Save/Update file
router.post('/:folder/file', saveKnowledgeFile);

// Set active agent
router.post('/:folder/active-agent', setActiveAgent);

// Mark as instructive
router.post('/:folder/mark-instructive', markAsInstructive);

// Create new agent
router.post('/:folder/new-agent', createNewAgent);

// Get tools registry
router.get('/tools-registry', getToolsRegistry);

// Get agents metadata (Cerebro CRM context)
router.get('/agents-metadata', getAgentsMetadata);

// Delete file
router.delete('/:folder/file', deleteKnowledgeFile);

export default router;
