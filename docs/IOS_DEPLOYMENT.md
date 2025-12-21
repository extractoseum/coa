# iOS App Store Deployment Guide 🍎

## Prerequisites
-   **Xcode** installed (v15+ recommended).
-   **Apple Developer Account** (Enrollment active).
-   **App Store Connect** record created for `com.extractoseum.coaviewer`.

## Step 1: Open the Project
Run the following command in your terminal to open the native project in Xcode:
```bash
cd frontend
npx cap open ios
```

## Step 2: Configure Signing & Capabilities
1.  In Xcode, click on the **App** project root in the left navigator.
2.  Select the **App** target.
3.  Go to the **Signing & Capabilities** tab.
4.  **Team**: Select your Apple Developer Team.
5.  **Bundle Identifier**: Ensure it matches `com.extractoseum.coaviewer`.
6.  **Version**: Set to `2.0.0` (or your target version).
7.  **Build**: Increment this integer (e.g., `1`, `2`) for every upload.

## Step 3: Archive for Distribution
1.  Select **Any iOS Device (arm64)** as the build target (top bar next to the Play button).
2.  Go to **Product** > **Archive**.
3.  Wait for the build to complete. The **Organizer** window will open.

## Step 4: Validate & Distribute
1.  In the Organizer, select your new archive.
2.  Click **Distribute App**.
3.  Select **App Store Connect** -> **Upload**.
4.  Follow the wizard (keep default checks for "Upload your app's symbols" and "Manage Version and Build Number").
5.  Click **Upload**.

## Step 5: Submit for Review
1.  Go to [App Store Connect](https://appstoreconnect.apple.com).
2.  Select your app.
3.  Go to **TestFlight** to see the processing build.
4.  Once processed, go to the **App Store** tab, select the build, and click **Submit for Review**.

---

## Troubleshooting
-   **Build Failed?**: Check `capacitor.config.ts`. Ensure `webDir` exists (`dist`).
-   **Push Rejected?**: Ensure you don't have secrets in your git history (we handled this in Mission E!).
-   **App Record Creation Error?**: If Xcode says the "App Name" is already in use:
    1.  Go to the **General** tab in Xcode.
    2.  Change the **Display Name** to something unique (e.g., "SWIS Viewer 2.0" -> "SWIS Viewer V2").
    3.  Archive again.

## Appendix: Store Listing Reference (Copy/Paste)
Use these values for your App Store Connect submission:

**Promotional Text (170 chars):**
> SWIS is the immune system for modern frontend apps. Detect drift, heal UI, and secure your app with AI-driven telemetry. Verified by Extractoseum.

**Description:**
> SWIS (System Watch & Integrity System) is not just a monitoring tool; it is an active resilience layer for enterprise applications. It bridges the gap between static testing and production reality.
>
> **Key Features:**
> *   **Drift Detection**: Automatically alerts when QA automations break due to code changes.
> *   **Deep Telemetry**: Real-time signals for client-side errors, slow routes, and security anomalies.
> *   **AI Agent Trust**: A verified semantic map that allows AI agents to navigate your app reliability.
> *   **Security Hardening**: Built-in 3-layer defense strategy (Governance, Watchtower, Seal).

**Keywords:**
> telemetry, frontend, monitoring, security, react, dashboard, ai, resilience, extractoseum

**Support URL**: `https://github.com/extractoseum/swis-watch`
**Marketing URL**: `https://swis-watch.com`

---

## Step 6: Final Submission Checklist (App Store Connect)
When adding for review, ensure you complete these sections:

1.  **Content Rights**: Select **"No, this app does not contain, show, or access third-party content."** (Unless you have licensed third-party IP).
2.  **Primary Category**: Select **"Utilities"** or **"Developer Tools"**.
3.  **Build**: Click the (+) button. Your uploaded build (from Step 4) should appear here after ~5-10 minutes of processing. Select it.
4.  **Contact Information**:
    -   **First Name**: Your First Name
    -   **Last Name**: Your Last Name
    -   **Phone Number**: Your Phone Number (e.g., +52...)
    -   **Email**: `contact@swis-watch.com` (or your developer email)
5.  **Privacy Policy URL**: `https://github.com/extractoseum/swis-watch/blob/main/PRIVACY.md` (or your specific policy URL).
