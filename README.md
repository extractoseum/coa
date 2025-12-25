# COA Viewer 2.0 (EUM Omnichannel Platform)

**Version**: 2.0 (Admin Suite & Deep Intelligence)
**Docs Generated**: Dec 25, 2025

The **COA Viewer 2.0** is a full-stack platform managing Certificates of Analysis, Omnichannel CRM (WhatsApp/Phone), and AI-driven Customer Engagement.

## 🏗 Architecture Overview

- **Frontend**: React (Vite) + TypeScript + TailwindCSS
- **Backend**: Node.js (Express) + TypeScript
- **Database**: Supabase (PostgreSQL)
- **AI Core**: Multi-provider Service (OpenAI, Anthropic, Google) + Vapi (Voice) + ElevenLabs (TTS)

## 🚀 Deployment

We use a **Hybrid Deployment Strategy** enforced by a Health Gate.

### Official: GitHub Actions
Push to `main` triggers the pipeline:
1.  **Health Gate**: Runs `scripts/system-diagnostics.js` (Type Check + Build).
2.  **Deploy**: SCPs artifacts to `/var/www/coa-viewer`.
3.  **Restart**: PM2 service `coa-backend`.

### Manual (Legacy/Emergency)
Scripts like `deploy_root.sh` or `deploy_backend_auto.sh`.
> ⚠️ **Note**: These scripts now automatically run the **Health Gate** before deploying. If diagnostics fail, deployment aborts.

## 🗺 API Route Manifest

Base URL: `/api/v1`

| Service Area | Endpoint | Description |
|--------------|----------|-------------|
| **Core COA** | `/coas` | Public/Private COA Data |
| **B2B / CRM** | `/crm` | Kanban & Customer 360 |
| **Admin Tools** | `/admin/tools` | AI Tool Definitions (Editor) |
| **Knowledge** | `/admin/knowledge` | RAG & Knowledge Base |
| **AI Operational**| `/ai` | Chat & Classification |
| **Orders** | `/orders` | Order History & Tracking |
| **Webhooks** | `/webhooks` | Shopify & Whapi Events |

## 🛠 AI Agent Capabilities
The "Admin Assistant" (Ara/Cerebro) has access to a registry of tools:
- **Communication**: `send_whatsapp_message`, `initiate_voice_call`.
- **Commerce**: `create_checkout_link`, `search_products_db`.
- **Diagnostics**: `get_system_health`, `get_logs`.

## 📁 Key Directories
- `backend/src/services`: Core business logic & integrations.
- `frontend/src/routes.ts`: Client-side navigation truth.
- `scripts/`: Operational tools & diagnostics.
- `.github/workflows`: CI/CD definitions.

---
*For detailed architecture decision records (ADRs), see the Knowledge Base.*
