/// <reference types="vite/client" />

declare const __BUILD_ID__: string;
declare const __ENV__: string;

interface ImportMetaEnv {
    readonly VITE_API_URL: string;
    // more env variables...
}


interface ImportMeta {
    readonly env: ImportMetaEnv;
}

interface Window {
    gtag: (command: string, eventName: string, eventParams?: any) => void;
    Trakpilot: {
        track: (eventName: string, props?: any) => void;
        identify: (userId: string, traits?: any) => void;
    };
}

