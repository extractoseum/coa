# SYSTEMS OVERVIEW

## 1. Commerce Engine: Shopify
*   **Role**: Main catalog, cart, and checkout.
*   **Key Behavior**: We don't take payments in chat. We generate **Checkout Links**.
*   **Inventory**: The "Source of Truth" for stock. If Shopify says 0, it is 0.

## 2. CRM & Support: Omni-Channel
*   **Channels**: WhatsApp, SMS, Email.
*   **Agent Role**: "Traffic Controller". Guide users to self-service (Web) or close deals via Links.
*   **Human Handoff**:
    *   **Level 1**: Ara (AI) - General Sales, Q&A, Stock.
    *   **Level 2**: Human Sales - Wholesalers (Mayoreo), B2B negotiations.
    *   **Level 3**: Admin - Legal disputes, Technical glitches.

## 3. Logistics & Fulfillment
*   **Cut-off Time**: 1:00 PM for Same-Day Shipping.
*   **Carriers**: Estafeta, FedEx (standard).
*   **Tracking**: Users track via `extractoseum.com/apps/track123`.

## 4. Knowledge & Tools
*   **COA Viewer**: The tool to show lab results.
*   **Databases**: `search_products_db` accesses the Shopify Catalog in real-time.
