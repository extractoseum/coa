// Test script for Chromeleon PDF parsing - new 6-column format
const lines = [
    "CBD6.075179.3791437.27390.0689.42203209.7311",
    "CBG6.3925.37038.5522.702.406101.7138",
    "CBN7.8361.98118.0460.991.121487.4951",
    "Delta 98.6926.95267.5033.494.208462.9075",
    "Delta 89.0700.1161.0610.060.07671.8950",
    "CBC10.3845.37144.9672.702.806770.6757"
];

// Expected values (approximate):
// CBD: RT=6.075, Area=179.379, PPM=203209.7311
// CBG: RT=6.392, Area=5.370, PPM=101.7138
// Delta 9: RT=8.692, Area=6.952, PPM=8462.9075
// Delta 8: RT=9.070, Area=0.116, PPM=671.8950

function parseLine(trimmed: string): any {
    const dotCount = (trimmed.match(/\./g) || []).length;
    if (dotCount !== 6) return { fail: "wrong dot count", count: dotCount };

    // Find all dot positions
    const dots: number[] = [];
    for (let i = 0; i < trimmed.length; i++) {
        if (trimmed[i] === ".") dots.push(i);
    }

    console.log("Line:", trimmed);
    console.log("Dots at:", dots.join(", "));

    // Known decimal patterns (from end):
    // dots[5] = PPM dot, 4 decimals after
    // dots[4] = RelH dot, 2 decimals after, then PPM integer starts
    // dots[3] = RelA dot, 2 decimals after, then RelH integer starts
    // dots[2] = Height dot, variable decimals, then RelA integer starts
    // dots[1] = Area dot, 3 decimals after, then Height integer starts
    // dots[0] = RT dot, 3 decimals after, then Area integer starts

    // PPM: from (dots[4] + 3) to end (RelH has 2 decimals)
    const ppmIntStart = dots[4] + 3;
    const ppmStr = trimmed.slice(ppmIntStart);
    const ppm = parseFloat(ppmStr);

    // RelH: from (dots[3] + 3) to (ppmIntStart) (RelA has 2 decimals)
    const relHIntStart = dots[3] + 3;
    const relHStr = trimmed.slice(relHIntStart, ppmIntStart);

    // Area ends at dots[1] + 4 (3 decimals + 1)
    const areaEnd = dots[1] + 4;

    // RT: integer digits before dots[0], then ".XXX" (3 decimals)
    // Find where RT integer starts (after name ends)
    // SPECIAL CASE: Handle "Delta 9", "Delta 8" where the number is part of the name
    let rtIntStart = dots[0];
    while (rtIntStart > 0 && /\d/.test(trimmed[rtIntStart - 1])) {
        rtIntStart--;
    }

    // Check for "Delta X" pattern where X is a single digit followed by RT
    let name = trimmed.slice(0, rtIntStart).trim();
    if (name.toLowerCase() === 'delta' && rtIntStart < dots[0]) {
        // The digit right after "Delta " is part of the name (Delta 8, Delta 9)
        const rtDigits = trimmed.slice(rtIntStart, dots[0]);
        if (rtDigits.length >= 2) {
            // First digit is part of name, rest is RT integer
            name = `Delta ${rtDigits[0]}`;
            rtIntStart = rtIntStart + 1;
        }
    }

    const rtEnd = dots[0] + 4; // 3 decimals + dot
    const rtStr = trimmed.slice(rtIntStart, rtEnd);
    const rt = parseFloat(rtStr);

    // Area: from rtEnd to dots[1]+4 (3 decimals)
    const areaStr = trimmed.slice(rtEnd, areaEnd);
    const area = parseFloat(areaStr);

    // Height: from areaEnd to somewhere before dots[3]+3
    // Brute force: try different height decimal counts (2, 3, 4)
    let heightStr = '';
    let relAStr = '';
    let parsed = false;

    for (const heightDec of [2, 3, 4]) {
        const heightEnd = dots[2] + heightDec + 1;
        const relAStart = heightEnd;
        const testRelA = trimmed.slice(relAStart, relHIntStart);

        // Valid relA should parse as a reasonable number (0-100 range)
        const testRelANum = parseFloat(testRelA);
        if (!isNaN(testRelANum) && testRelANum >= 0 && testRelANum <= 100) {
            heightStr = trimmed.slice(areaEnd, heightEnd);
            relAStr = testRelA;
            parsed = true;
            console.log(`  Height decimals: ${heightDec}, Height: ${heightStr}, RelA: ${relAStr}`);
            break;
        }
    }

    return {
        name,
        rt,
        rtStr,
        area,
        areaStr,
        ppm,
        ppmStr,
        relH: relHStr,
        parsed,
        debug: { rtIntStart, rtEnd, areaEnd, dots }
    };
}

console.log("=== Testing New Chromeleon Parser ===\n");

for (const line of lines) {
    const result = parseLine(line);
    console.log("");
    if (result && !result.fail && result.parsed) {
        console.log(`✅ ${result.name.padEnd(10)} RT: ${result.rt.toFixed(3).padEnd(8)} Area: ${result.area.toFixed(3).padEnd(12)} PPM: ${result.ppm.toFixed(4)}`);
    } else {
        console.log("❌ FAIL:", JSON.stringify(result, null, 2));
    }
    console.log("---");
}
