declare const __BUILD_ID__: string;
declare const __ENV__: string;

export function BuildStamp() {
    // Only show in non-production environments or if force-enabled
    if (__ENV__ === 'production') return null;

    return (
        <div
            style={{
                position: "fixed",
                bottom: 8,
                right: 8,
                fontSize: 10,
                opacity: 0.6,
                zIndex: 99999,
                pointerEvents: "none",
                fontFamily: "monospace",
                color: "#fff",
                background: "rgba(0,0,0,0.5)",
                padding: "2px 6px",
                borderRadius: "4px"
            }}
            data-testid="build.stamp"
        >
            {__ENV__} · {__BUILD_ID__}
        </div>
    );
}
