/* Makes a new admin password hash. Usage: node make-admin-hash.js "a long password (12+ characters)"
   Paste the printed line into server.js, replacing the old ADMIN_HASH line. Never put the password itself in GitHub. */
const crypto = require("crypto"), pw = process.argv[2];
if (!pw || pw.length < 12) { console.log('Usage: node make-admin-hash.js "a long password (12+ characters)"'); process.exit(1); }
const salt = crypto.randomBytes(16);
console.log('const ADMIN_HASH = "scrypt$' + salt.toString("hex") + "$" + crypto.scryptSync(pw, salt, 32).toString("hex") + '";');
