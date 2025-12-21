
const rowFive = /^(.+?)\s+(ND|<LO[QD]|\d+(?:\.\d+)?)\s+(ND|<LO[QD]|\d+(?:\.\d+)?)\s+(ND|<LO[QD]|\d+(?:\.\d+)?)\s+(ND|<LO[QD]|\d+(?:\.\d+)?)$/i;

const testStrings = [
    '(6aR,9R,10aR)-HHC 0.0067 0.02 13.0 130',
    'Δ8-THC 0.0104 0.0312 ND ND',
    'Total 19.4 194',
    '(6aR,9R,10aR)-HHC 0.0067 0.02 13.0 130 ' // Trailing space
];

testStrings.forEach(str => {
    console.log(`Testing: "${str}"`);
    const match = str.trim().match(rowFive);
    if (match) {
        console.log('MATCHED!');
        console.log('Name:', match[1]);
        console.log('LOD:', match[2]);
        console.log('LOQ:', match[3]);
        console.log('Pct:', match[4]);
        console.log('Mg:', match[5]);
    } else {
        console.log('NO MATCH');
    }
    console.log('---');
});
