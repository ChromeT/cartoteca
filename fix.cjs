const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Fix broken Parser Section div
code = code.replace(/\s*\{\/\* Parser Section \*\/\}[\s\S]*?<\/details>\s*<\/div>/g, '');

// Fix double )}
code = code.replace(/      \)\}\s*      \)\}/g, '      )}');

fs.writeFileSync('src/App.tsx', code);
console.log('Fixed!');
