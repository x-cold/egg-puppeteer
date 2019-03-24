'use strict';

exports.puppeteer = {
  browser: {
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
    ],
    dumpio: true,
    ignoreHTTPSErrors: true,
  },
  maxPage: 4,
  maxPageCount: 4,
  emulateDevice: 'iPhone 6 Plus',
};
