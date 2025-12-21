
const trimmed = '(6aR,9R,10aR)-HHC 0.0067 0.02 13.0 130';
const known = '(6aR,9R,10aR)-HHC';

console.log(`Testing line: "${trimmed}"`);
console.log(`Known cannabinoid: "${known}"`);

if (trimmed.includes(known)) {
    // Exact regex from coaExtractor.ts (FIXED with lookahead)
    const numberPattern = /(?:^|\s)(ND|<LO[QD]|<LOD|\d+(?:\.\d+)?)(?=$|\s)/gi;

    const matches = trimmed.match(numberPattern);
    console.log('Raw matches:', matches);

    if (matches && matches.length >= 1) {
        const cleanValues = matches.map(m => m.trim());
        console.log('Clean values:', cleanValues);

        const numbers = cleanValues.filter(v => v);
        console.log('Filtered numbers:', numbers);

        if (numbers.length >= 2) {
            const lastVal = numbers[numbers.length - 1]; // mg/g
            const secondLastVal = numbers[numbers.length - 2]; // %

            console.log(`Last (mg/g): ${lastVal}`);
            console.log(`Second Last (%): ${secondLastVal}`);

            const isValidPct = (val: string) => {
                if (val === 'ND' || val.startsWith('<')) return true;
                const n = parseFloat(val);
                return !isNaN(n) && n >= 0 && n <= 100;
            };

            const isValidMg = (val: string) => {
                if (val === 'ND' || val.startsWith('<')) return true;
                const n = parseFloat(val);
                return !isNaN(n) && n >= 0 && n <= 1000;
            };

            console.log(`Valid Pct? ${isValidPct(secondLastVal)}`);
            console.log(`Valid Mg? ${isValidMg(lastVal)}`);

            if (isValidPct(secondLastVal) && isValidMg(lastVal)) {
                if (lastVal !== 'ND' && !lastVal.startsWith('<')) {
                    console.log('Detected mg/g!');
                }

                if (secondLastVal !== 'ND' && !secondLastVal.startsWith('<')) {
                    console.log('Detected %!');
                }
            } else {
                console.log('Values out of range!');
            }
        } else {
            console.log('Not enough numbers');
        }
    } else {
        console.log('No regex matches');
    }
} else {
    console.log('Known cannabinoid not found in line');
}
