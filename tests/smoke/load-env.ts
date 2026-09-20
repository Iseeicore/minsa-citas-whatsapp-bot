// Loads .env for the smoke run only (vitest does not load it into process.env).
// Nothing is printed. If the file is missing the smoke suite skips itself.
try {
  process.loadEnvFile(".env");
} catch {
  // no .env: DATABASE_URL may already be set in the shell
}
