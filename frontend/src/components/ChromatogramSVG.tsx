import React, { useMemo } from 'react';

interface Peak {
    analyte?: string;
    retention_time?: number;
    area?: number;
    result_pct?: string;
}

// Internal type for validated peaks
interface ValidPeak {
    analyte: string;
    retention_time: number;
    area: number;
}

interface ChromatogramSVGProps {
    peaks: Peak[];
    theme: {
        cardBg: string;
        text: string;
        textMuted: string;
        accent: string;
        border: string;
    };
    width?: number;
    height?: number;
}

/**
 * SVG Chromatogram Component
 * Renders a vectorial chromatogram that respects the current theme
 */
export const ChromatogramSVG: React.FC<ChromatogramSVGProps> = ({
    peaks,
    theme,
    width = 800,
    height = 400
}) => {
    // Filter and sort peaks by retention time
    const validPeaks: ValidPeak[] = useMemo(() =>
        peaks
            .filter((p): p is Peak & { retention_time: number; area: number; analyte: string } =>
                p.retention_time !== undefined && p.area !== undefined && p.area > 0 && p.analyte !== undefined
            )
            .sort((a, b) => a.retention_time - b.retention_time),
        [peaks]
    );

    // Chart dimensions - responsive margins for mobile
    const margin = { top: 30, right: 20, bottom: 45, left: 50 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // Calculate scales
    const xMin = 0;
    const xMax = 16; // 16 minutes standard for HPLC
    const xScale = (x: number) => margin.left + (x - xMin) / (xMax - xMin) * chartWidth;

    // Generate Gaussian curve data
    const curveData = useMemo(() => {
        if (validPeaks.length === 0) return [];

        const maxArea = Math.max(...validPeaks.map(p => p.area));
        const points: { x: number; y: number }[] = [];

        // Generate points from 0 to 16 with high resolution
        for (let t = 0; t <= 16; t += 0.02) {
            let signal = 0;
            for (const peak of validPeaks) {
                const rt = peak.retention_time;
                const area = peak.area;
                // Normalize height
                const peakHeight = (area / maxArea) * 1000;
                // Gaussian width (sigma)
                const sigma = 0.08;
                // Gaussian function
                signal += peakHeight * Math.exp(-Math.pow(t - rt, 2) / (2 * sigma * sigma));
            }
            points.push({ x: t, y: signal });
        }
        return points;
    }, [validPeaks]);

    // Calculate Y scale based on curve data
    const yMax = useMemo(() => {
        if (curveData.length === 0) return 100;
        return Math.max(...curveData.map(p => p.y)) * 1.15; // 15% headroom for labels
    }, [curveData]);

    const yScale = (y: number) => margin.top + chartHeight - (y / yMax) * chartHeight;

    // Generate SVG path for the curve
    const pathD = useMemo(() => {
        if (curveData.length === 0) return '';

        return curveData.map((point, i) => {
            const x = xScale(point.x);
            const y = yScale(point.y);
            return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
        }).join(' ');
    }, [curveData, xScale, yScale]);

    // Area fill path (closed)
    const areaPathD = useMemo(() => {
        if (curveData.length === 0) return '';

        const mainPath = curveData.map((point, i) => {
            const x = xScale(point.x);
            const y = yScale(point.y);
            return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
        }).join(' ');

        // Close the path along the baseline
        const lastX = xScale(curveData[curveData.length - 1].x);
        const firstX = xScale(curveData[0].x);
        const baseY = yScale(0);

        return `${mainPath} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
    }, [curveData, xScale, yScale]);

    // Grid lines
    const xGridLines = [0, 2, 4, 6, 8, 10, 12, 14, 16];
    const yGridLines = useMemo(() => {
        const lines = [];
        const step = yMax / 5;
        for (let i = 0; i <= 5; i++) {
            lines.push(Math.round(step * i));
        }
        return lines;
    }, [yMax]);

    // Calculate peak label positions
    const peakLabels = useMemo(() => {
        const maxArea = Math.max(...validPeaks.map(p => p.area));
        return validPeaks.map(peak => {
            const peakHeight = (peak.area / maxArea) * 1000;
            return {
                x: xScale(peak.retention_time),
                y: yScale(peakHeight) - 10,
                label: peak.analyte,
                rt: peak.retention_time.toFixed(4)
            };
        });
    }, [validPeaks, xScale, yScale]);

    if (validPeaks.length === 0) {
        return (
            <div
                className="flex items-center justify-center rounded-lg"
                style={{
                    width,
                    height,
                    backgroundColor: theme.cardBg,
                    color: theme.textMuted
                }}
            >
                No hay datos de cromatograma disponibles
            </div>
        );
    }

    return (
        <svg
            width="100%"
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="rounded-lg"
        >
            {/* Background rectangle */}
            <rect
                x="0"
                y="0"
                width={width}
                height={height}
                fill={theme.cardBg}
            />
            {/* Grid lines */}
            <g className="grid">
                {/* Vertical grid lines */}
                {xGridLines.map(x => (
                    <line
                        key={`x-${x}`}
                        x1={xScale(x)}
                        y1={margin.top}
                        x2={xScale(x)}
                        y2={height - margin.bottom}
                        stroke={theme.border}
                        strokeWidth="1"
                        strokeDasharray="2,2"
                        opacity="0.5"
                    />
                ))}
                {/* Horizontal grid lines */}
                {yGridLines.map(y => (
                    <line
                        key={`y-${y}`}
                        x1={margin.left}
                        y1={yScale(y)}
                        x2={width - margin.right}
                        y2={yScale(y)}
                        stroke={theme.border}
                        strokeWidth="1"
                        strokeDasharray="2,2"
                        opacity="0.5"
                    />
                ))}
            </g>

            {/* Axes */}
            <g className="axes">
                {/* X axis */}
                <line
                    x1={margin.left}
                    y1={height - margin.bottom}
                    x2={width - margin.right}
                    y2={height - margin.bottom}
                    stroke={theme.text}
                    strokeWidth="2"
                />
                {/* Y axis */}
                <line
                    x1={margin.left}
                    y1={margin.top}
                    x2={margin.left}
                    y2={height - margin.bottom}
                    stroke={theme.text}
                    strokeWidth="2"
                />
            </g>

            {/* X axis labels */}
            <g className="x-labels">
                {xGridLines.map(x => (
                    <text
                        key={`xlabel-${x}`}
                        x={xScale(x)}
                        y={height - margin.bottom + 20}
                        textAnchor="middle"
                        fill={theme.textMuted}
                        fontSize="12"
                        fontFamily="monospace"
                    >
                        {x}
                    </text>
                ))}
                {/* X axis title */}
                <text
                    x={width / 2}
                    y={height - 10}
                    textAnchor="middle"
                    fill={theme.text}
                    fontSize="14"
                    fontWeight="500"
                >
                    Time [min]
                </text>
            </g>

            {/* Y axis labels */}
            <g className="y-labels">
                {yGridLines.map(y => (
                    <text
                        key={`ylabel-${y}`}
                        x={margin.left - 10}
                        y={yScale(y) + 4}
                        textAnchor="end"
                        fill={theme.textMuted}
                        fontSize="11"
                        fontFamily="monospace"
                    >
                        {y.toLocaleString()}
                    </text>
                ))}
                {/* Y axis title */}
                <text
                    x={-height / 2}
                    y={15}
                    textAnchor="middle"
                    fill={theme.text}
                    fontSize="14"
                    fontWeight="500"
                    transform="rotate(-90)"
                >
                    Absorbance [mAU]
                </text>
            </g>

            {/* Area fill under curve */}
            <path
                d={areaPathD}
                fill={theme.accent}
                opacity="0.15"
            />

            {/* Main curve */}
            <path
                d={pathD}
                fill="none"
                stroke={theme.text}
                strokeWidth="1.5"
            />

            {/* Peak labels with vertical lines */}
            <g className="peak-labels">
                {peakLabels.map((peak, idx) => (
                    <g key={idx}>
                        {/* Vertical dashed line to peak */}
                        <line
                            x1={peak.x}
                            y1={peak.y + 8}
                            x2={peak.x}
                            y2={yScale(0)}
                            stroke={theme.accent}
                            strokeWidth="1"
                            strokeDasharray="3,3"
                            opacity="0.6"
                        />
                        {/* Peak name label */}
                        <text
                            x={peak.x}
                            y={peak.y - 2}
                            textAnchor="middle"
                            fill={theme.text}
                            fontSize="9"
                            fontWeight="500"
                            transform={`rotate(-45, ${peak.x}, ${peak.y - 2})`}
                        >
                            {peak.label} - {peak.rt}
                        </text>
                    </g>
                ))}
            </g>
        </svg>
    );
};

export default ChromatogramSVG;
