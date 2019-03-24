'use strict';

exports.puppeteer = {
  browser: {
    executablePath: '/usr/local/chrome/bin/chrome',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      // https://github.com/GoogleChrome/puppeteer/issues/1175
      '--shm-size=2gb',
    ],
    dumpio: false,
  },
};
