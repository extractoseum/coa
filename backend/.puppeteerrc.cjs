const path = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
    // Changes the cache location to be local to the project
    // This ensures the browser binary is found even if the home dir permissions are strict.
    cacheDirectory: path.join(__dirname, '.puppeteer_cache'),
};
