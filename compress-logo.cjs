const sharp = require('./node_modules/sharp');
const fs = require('fs');

sharp('./public/logo.png')
  .resize(256, 256)
  .png({ quality: 85, compressionLevel: 9 })
  .toFile('./public/logo-tmp.png')
  .then(info => {
    fs.renameSync('./public/logo-tmp.png', './public/logo.png');
    console.log('✅ Done! New size:', info.size, 'bytes');
  })
  .catch(err => console.error('❌ Error:', err));
