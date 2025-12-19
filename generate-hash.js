const bcrypt = require('bcryptjs');

async function generateHash() {
  const password = 'Admin@123';
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);
  
  console.log('\n=== GENERATE PASSWORD HASH ===');
  console.log('Password:', password);
  console.log('Hash:', hash);
  console.log('\nSQL untuk update:');
  console.log(`UPDATE users SET password_hash = '${hash}' WHERE email = 'admin@payment.com';`);
}

generateHash();