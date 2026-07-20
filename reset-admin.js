// Recovery tool for a locked-out or forgotten admin account.
//
// This app has no email-based "forgot password" flow (no admin email is
// verified/tied to the account for that purpose) - by design, recovery
// requires access to the server/files, same as most small self-hosted apps.
// Run this directly on the machine (or container) hosting the app:
//
//   node server/reset-admin.js <newUsername> <newPassword>
//
// It resets the (single) admin account's username and password, and clears
// any lockout/failed-attempt state, so you can log back in immediately.
// Validation mirrors the /change-username and /change-password API rules.

const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
const db = require('./db');

function fail(msg) {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

const [, , newUsername, newPassword] = process.argv;

if (!newUsername || !newPassword) {
  console.log('Usage: node server/reset-admin.js <newUsername> <newPassword>');
  console.log('Example: node server/reset-admin.js admin MyNewStrongPass!23');
  process.exit(1);
}

const trimmedUsername = newUsername.trim();
if (trimmedUsername.length < 3 || trimmedUsername.length > 32) {
  fail('Username must be between 3 and 32 characters');
}
if (!/^[a-zA-Z0-9_.-]+$/.test(trimmedUsername)) {
  fail('Username can only contain letters, numbers, underscores, dots, and hyphens');
}
if (newPassword.length < 6) {
  fail('Password must be at least 6 characters');
}

const data = db.load();

let admin = data.admins[0];
if (!admin) {
  // No admin exists at all (e.g. a hand-edited db.json) - create one instead
  // of failing, so this script also works as a bootstrap tool.
  admin = { id: nanoid(8), createdAt: new Date().toISOString() };
  data.admins.push(admin);
}

admin.username = trimmedUsername;
admin.passwordHash = bcrypt.hashSync(newPassword, 10);
admin.failedLoginAttempts = 0;
admin.lockedUntil = null;

db.save(data);

console.log(`Admin credentials reset.`);
console.log(`  Username: ${trimmedUsername}`);
console.log(`  Password: (as given)`);
console.log(`Any account lockout has also been cleared. You can log in now.`);
