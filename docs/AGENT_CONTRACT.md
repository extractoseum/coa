# Agent Contract Definition (v1.0)

> **Status**: Frozen (v1.0.0)
> **Enforcement**: Automated via `drift-bot`
> **Source of Truth**: [`frontend/public/agentMap.json`](../frontend/public/agentMap.json)

## 1. Philosophy or "The UI as an API"
This application treats its User Interface (UI) as a stable, versioned API for AI Agents. We guarantee that if an Agent follows this contract, it can navigate and interact with the application without "hallucinating" routes or encountering broken selectors.

## 2. Guarantees
The **Drift Bot** enforces the following guarantees before every deployment:

1.  **Route Integrity**: Every route listed in `agentMap.json` resolves to a valid URL pattern in `routeManifest.json`.
2.  **Selector Validity**: Every `testid` (Capability ID) listed in the map is defined in the `uiMap.ts` registry.
3.  **Parameter Exactness**: If a route requires parameters (e.g., `/coa/:token`), the map strictly defines them (e.g., `params: { token: "demo" }`).

## 3. The Contract Spec (`agentMap.json`)
Agents should consume the JSON map at `/agentMap.json`.

```json
{
  "version": "1.0.0",
  "capabilities": [
    {
      "id": "nav.user.demo",        // The stable semantic ID
      "route": "/coa/:token",       // The URL pattern
      "params": { "token": "demo" }, // Required parameters for instantiation
      "auth": false,                // Is authentication required?
      "dynamic": false              // Is this a generated/list item?
    }
  ]
}
```

## 4. Breaking Changes
A change is considered **BREAKING** (requiring v2.0) if:
-   A capability `id` is removed or renamed.
-   A route pattern changes fundamentally (requiring different parameters).
-   Authentication requirements change from `false` to `true`.

## 5. Drift & Remediation
-   **Ghosts**: Usage of unregistered IDs. **Strictly Forbidden**.
-   **Zombies**: Registered IDs with no detected usage. **Vaccinated via Auto-Fix**.

---
**Maintained by**: Drift Bot System
**Last Auditor**: @bdelatorre8
