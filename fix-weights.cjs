const fs = require('fs');
let content = fs.readFileSync('dalal-wire-node/public/app.js', 'utf8');
content = content.replace(/weight:\s*[\d.]+,\s*sector:\s*'([^']+)',\s*pe:\s*[\d.]+,\s*industryPe:\s*[\d.]+,\s*debtToEquity:\s*[\d.]+/g, "weight: null, sector: '$1', pe: null, industryPe: null, debtToEquity: null");
fs.writeFileSync('dalal-wire-node/public/app.js', content);
console.log('Fixed weights');
