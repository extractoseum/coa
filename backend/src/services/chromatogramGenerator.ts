import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { Cannabinoid } from '../types/coa';

interface ChromatogramOptions {
    width?: number;
    height?: number;
    backgroundColor?: string;
    lineColor?: string;
    peakColor?: string;
    labelColor?: string;
    gridColor?: string;
}

/**
 * Generates a synthetic chromatogram image from cannabinoid data
 * Uses Gaussian peaks to simulate HPLC chromatogram appearance
 */
export async function generateChromatogram(
    cannabinoids: Cannabinoid[],
    options: ChromatogramOptions = {}
): Promise<Buffer> {
    const {
        width = 800,
        height = 300,
        backgroundColor = '#ffffff',
        lineColor = '#000000',
        peakColor = 'rgba(0, 0, 0, 0.8)',
        labelColor = '#333333',
        gridColor = '#e0e0e0'
    } = options;

    // Filter cannabinoids that have chromatogram data
    const peaksData = cannabinoids
        .filter(c => c.retention_time !== undefined && c.area !== undefined && c.area > 0)
        .sort((a, b) => (a.retention_time || 0) - (b.retention_time || 0));

    if (peaksData.length === 0) {
        // Return empty chart if no chromatogram data
        return generateEmptyChart(width, height, backgroundColor);
    }

    // Generate time points (0 to 16 minutes with 0.01 resolution)
    const timePoints: number[] = [];
    for (let t = 0; t <= 16; t += 0.02) {
        timePoints.push(Math.round(t * 100) / 100);
    }

    // Calculate the signal at each time point (sum of Gaussian peaks)
    const maxArea = Math.max(...peaksData.map(p => p.area || 1));
    const signalData = timePoints.map(t => {
        let signal = 0;
        for (const peak of peaksData) {
            const rt = peak.retention_time || 0;
            const area = peak.area || 0;
            // Normalize height based on area (scale to reasonable visual height)
            const height = (area / maxArea) * 1000;
            // Peak width (sigma) - narrower peaks for better visualization
            const sigma = 0.08;
            // Gaussian function
            signal += height * Math.exp(-Math.pow(t - rt, 2) / (2 * sigma * sigma));
        }
        return signal;
    });

    // Create chart
    const chartJSNodeCanvas = new ChartJSNodeCanvas({
        width,
        height,
        backgroundColour: backgroundColor
    });

    // Generate peak annotations for labels
    const annotations: any = {};
    peaksData.forEach((peak, idx) => {
        const rt = peak.retention_time || 0;
        const area = peak.area || 0;
        const normalizedHeight = (area / maxArea) * 1000;

        // Vertical line at peak
        annotations[`line${idx}`] = {
            type: 'line',
            xMin: rt,
            xMax: rt,
            yMin: 0,
            yMax: normalizedHeight * 0.95,
            borderColor: 'rgba(0, 0, 255, 0.5)',
            borderWidth: 1,
            borderDash: [2, 2]
        };

        // Label annotation
        annotations[`label${idx}`] = {
            type: 'label',
            xValue: rt,
            yValue: normalizedHeight + 50,
            content: `${peak.analyte}`,
            font: {
                size: 8,
                family: 'Arial'
            },
            color: labelColor,
            rotation: -45,
            textAlign: 'left'
        };
    });

    const configuration: any = {
        type: 'line',
        data: {
            labels: timePoints,
            datasets: [{
                data: signalData,
                borderColor: peakColor,
                borderWidth: 1.5,
                fill: false,
                pointRadius: 0,
                tension: 0.1
            }]
        },
        options: {
            responsive: false,
            animation: false,
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: false
                },
                annotation: {
                    annotations
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    min: 0,
                    max: 16,
                    title: {
                        display: true,
                        text: 'Time [min]',
                        font: { size: 10 }
                    },
                    ticks: {
                        stepSize: 2,
                        font: { size: 8 }
                    },
                    grid: {
                        color: gridColor
                    }
                },
                y: {
                    min: -50,
                    title: {
                        display: true,
                        text: 'Absorbance [mAU]',
                        font: { size: 10 }
                    },
                    ticks: {
                        font: { size: 8 }
                    },
                    grid: {
                        color: gridColor
                    }
                }
            }
        },
        plugins: []
    };

    // Try to use annotation plugin if available
    try {
        const annotationPlugin = require('chartjs-plugin-annotation');
        configuration.plugins = [annotationPlugin];
    } catch (e) {
        // Annotation plugin not available, continue without it
        delete configuration.options.plugins.annotation;
    }

    const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
    return buffer;
}

/**
 * Generates an empty chart placeholder
 */
async function generateEmptyChart(width: number, height: number, backgroundColor: string): Promise<Buffer> {
    const chartJSNodeCanvas = new ChartJSNodeCanvas({
        width,
        height,
        backgroundColour: backgroundColor
    });

    const configuration: any = {
        type: 'line',
        data: {
            labels: [0, 4, 8, 12, 16],
            datasets: [{
                data: [0, 0, 0, 0, 0],
                borderColor: '#cccccc',
                borderWidth: 1,
                fill: false,
                pointRadius: 0
            }]
        },
        options: {
            responsive: false,
            animation: false,
            plugins: {
                legend: { display: false },
                title: {
                    display: true,
                    text: 'No chromatogram data available',
                    font: { size: 12 }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Time [min]' }
                },
                y: {
                    title: { display: true, text: 'Absorbance [mAU]' }
                }
            }
        }
    };

    return chartJSNodeCanvas.renderToBuffer(configuration);
}

/**
 * Generate a simple chromatogram without annotation plugin dependency
 * This version adds peak labels directly as chart data points
 */
export async function generateSimpleChromatogram(
    cannabinoids: Cannabinoid[],
    options: ChromatogramOptions = {}
): Promise<Buffer> {
    const {
        width = 800,
        height = 300,
        backgroundColor = '#ffffff',
        peakColor = '#000000',
        gridColor = '#e5e5e5'
    } = options;

    // Filter cannabinoids that have chromatogram data
    const peaksData = cannabinoids
        .filter(c => c.retention_time !== undefined && c.area !== undefined && c.area > 0)
        .sort((a, b) => (a.retention_time || 0) - (b.retention_time || 0));

    if (peaksData.length === 0) {
        return generateEmptyChart(width, height, backgroundColor);
    }

    // Generate time points (0 to 16 minutes)
    const resolution = 0.02;
    const timePoints: number[] = [];
    for (let t = 0; t <= 16; t += resolution) {
        timePoints.push(Math.round(t * 100) / 100);
    }

    // Calculate signal using Gaussian peaks
    const maxArea = Math.max(...peaksData.map(p => p.area || 1));
    const signalData = timePoints.map(t => {
        let signal = 0;
        for (const peak of peaksData) {
            const rt = peak.retention_time || 0;
            const area = peak.area || 0;
            const normalizedHeight = (area / maxArea) * 1200;
            const sigma = 0.06; // Peak width
            signal += normalizedHeight * Math.exp(-Math.pow(t - rt, 2) / (2 * sigma * sigma));
        }
        return signal;
    });

    const chartJSNodeCanvas = new ChartJSNodeCanvas({
        width,
        height,
        backgroundColour: backgroundColor,
        plugins: {
            modern: ['chartjs-plugin-datalabels']
        }
    });

    // Create peak label points (for showing cannabinoid names at peak positions)
    const peakLabelPoints = peaksData.map(peak => ({
        x: peak.retention_time || 0,
        y: ((peak.area || 0) / maxArea) * 1200 + 80, // Position above peak
        label: peak.analyte
    }));

    const configuration: any = {
        type: 'line',
        data: {
            labels: timePoints,
            datasets: [
                {
                    // Main chromatogram line
                    data: signalData,
                    borderColor: peakColor,
                    borderWidth: 1.2,
                    fill: {
                        target: 'origin',
                        above: 'rgba(0, 0, 0, 0.05)'
                    },
                    pointRadius: 0,
                    tension: 0.2,
                    order: 2
                },
                {
                    // Peak labels as scatter points
                    type: 'scatter',
                    data: peakLabelPoints.map(p => ({ x: p.x, y: p.y })),
                    pointRadius: 0,
                    datalabels: {
                        display: true,
                        formatter: (_value: any, context: any) => {
                            return peakLabelPoints[context.dataIndex]?.label || '';
                        },
                        align: 'top',
                        rotation: -60,
                        font: { size: 7, family: 'Arial' },
                        color: '#333333'
                    },
                    order: 1
                }
            ]
        },
        options: {
            responsive: false,
            animation: false,
            plugins: {
                legend: { display: false },
                title: { display: false },
                datalabels: {
                    display: false // Default off, enabled per dataset
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    min: 0,
                    max: 16,
                    title: {
                        display: true,
                        text: 'Time [min]',
                        font: { size: 9, weight: 'bold' }
                    },
                    ticks: {
                        stepSize: 2,
                        font: { size: 8 }
                    },
                    grid: { color: gridColor }
                },
                y: {
                    min: -20,
                    title: {
                        display: true,
                        text: 'Absorbance [mAU]',
                        font: { size: 9, weight: 'bold' }
                    },
                    ticks: {
                        font: { size: 8 },
                        callback: function(value: number) {
                            return Math.round(value);
                        }
                    },
                    grid: { color: gridColor }
                }
            }
        }
    };

    try {
        const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
        return buffer;
    } catch (error) {
        console.error('[Chromatogram] Error generating chart:', error);
        // Fallback to basic chart without datalabels
        return generateBasicChromatogram(cannabinoids, options);
    }
}

/**
 * Most basic chromatogram generation - guaranteed to work
 * Now with peak labels showing cannabinoid name and retention time
 */
export async function generateBasicChromatogram(
    cannabinoids: Cannabinoid[],
    options: ChromatogramOptions = {}
): Promise<Buffer> {
    const {
        width = 800,
        height = 300,
        backgroundColor = '#ffffff',
        peakColor = '#000000',
        gridColor = '#e5e5e5'
    } = options;

    // Handle transparent background (ChartJSNodeCanvas needs undefined for transparency)
    const bgColor = backgroundColor === 'transparent' ? undefined : backgroundColor;

    const peaksData = cannabinoids
        .filter(c => c.retention_time !== undefined && c.area !== undefined && c.area > 0)
        .sort((a, b) => (a.retention_time || 0) - (b.retention_time || 0));

    if (peaksData.length === 0) {
        return generateEmptyChart(width, height, backgroundColor);
    }

    // Generate data points
    const resolution = 0.02;
    const dataPoints: { x: number; y: number }[] = [];
    const maxArea = Math.max(...peaksData.map(p => p.area || 1));

    for (let t = 0; t <= 16; t += resolution) {
        let signal = 0;
        for (const peak of peaksData) {
            const rt = peak.retention_time || 0;
            const area = peak.area || 0;
            const normalizedHeight = (area / maxArea) * 1200;
            const sigma = 0.06;
            signal += normalizedHeight * Math.exp(-Math.pow(t - rt, 2) / (2 * sigma * sigma));
        }
        dataPoints.push({ x: Math.round(t * 100) / 100, y: signal });
    }

    // Generate peak annotations with labels
    const annotations: any = {};
    peaksData.forEach((peak, idx) => {
        const rt = peak.retention_time || 0;
        const area = peak.area || 0;
        const normalizedHeight = (area / maxArea) * 1200;

        // Vertical line from baseline to near peak top
        annotations[`line${idx}`] = {
            type: 'line',
            xMin: rt,
            xMax: rt,
            yMin: 0,
            yMax: normalizedHeight * 0.85,
            borderColor: 'rgba(0, 0, 255, 0.4)',
            borderWidth: 1,
            borderDash: [2, 2]
        };

        // Label with cannabinoid name and RT - rotated like in original chromatogram
        // Font size scales with canvas size for high-DPI rendering
        annotations[`label${idx}`] = {
            type: 'label',
            xValue: rt,
            yValue: normalizedHeight + 80,
            content: `${peak.analyte} - ${rt.toFixed(4)}`,
            font: {
                size: Math.max(7, Math.round(width / 100)),
                family: 'Arial'
            },
            color: '#333333',
            rotation: -75,
            textAlign: 'left'
        };
    });

    // Try to load annotation plugin
    let chartJSNodeCanvas: ChartJSNodeCanvas;
    let useAnnotations = false;

    try {
        const annotationPlugin = require('chartjs-plugin-annotation');
        chartJSNodeCanvas = new ChartJSNodeCanvas({
            width,
            height,
            backgroundColour: bgColor,
            plugins: {
                modern: ['chartjs-plugin-annotation']
            }
        });
        useAnnotations = true;
    } catch (e) {
        // Annotation plugin not available, use basic chart
        chartJSNodeCanvas = new ChartJSNodeCanvas({
            width,
            height,
            backgroundColour: bgColor
        });
    }

    const configuration: any = {
        type: 'scatter',
        data: {
            datasets: [{
                data: dataPoints,
                borderColor: peakColor,
                backgroundColor: 'rgba(0,0,0,0.03)',
                borderWidth: 1.2,
                showLine: true,
                fill: true,
                pointRadius: 0,
                tension: 0.2
            }]
        },
        options: {
            responsive: false,
            animation: false,
            plugins: {
                legend: { display: false },
                ...(useAnnotations && { annotation: { annotations } })
            },
            scales: {
                x: {
                    type: 'linear',
                    min: 0,
                    max: 16,
                    title: {
                        display: true,
                        text: 'Time [min]',
                        font: { size: Math.max(9, Math.round(width / 80)), weight: 'bold' }
                    },
                    ticks: { stepSize: 2, font: { size: Math.max(8, Math.round(width / 100)) } },
                    grid: { color: gridColor }
                },
                y: {
                    min: -20,
                    title: {
                        display: true,
                        text: 'Absorbance [mAU]',
                        font: { size: Math.max(9, Math.round(width / 80)), weight: 'bold' }
                    },
                    ticks: { font: { size: Math.max(8, Math.round(width / 100)) } },
                    grid: { color: gridColor }
                }
            }
        }
    };

    return chartJSNodeCanvas.renderToBuffer(configuration);
}
