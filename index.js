/**
 * @module index
 * @description Thin bootstrap entry point. Delegates all application logic
 *   to the modular src/ structure. This file exists for backward compatibility
 *   with the existing npm start script and Dockerfile CMD.
 */

const { startServer } = require('./src/server');
const { buildApp } = require('./src/app');

// Start the server when run directly
if (require.main === module) {
  startServer().catch((err) => {
    // Startup failures must be handled explicitly; otherwise modern Node
    // promotes the rejected promise to an uncaught exception.
    console.error('Fatal error while starting Vault Bridge.', err);
    process.exitCode = 1;
  });
}

// Re-export buildApp for test compatibility
module.exports = { buildApp, startServer };
