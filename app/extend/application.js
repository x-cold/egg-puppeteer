'use strict';

const Puppeteer = Symbol('app#puppeteer');
const DeviceDescriptors = Symbol('app#DeviceDescriptors');

const {
  puppeteer,
  devices,
} = require('../../lib/puppeteer');

module.exports = {
  /**
   * puppeteer
   * @member {Object} Application#puppeteer
   */
  get puppeteer() {
    if (!this[Puppeteer]) {
      this[Puppeteer] = puppeteer;
    }
    return this[Puppeteer];
  },

  /**
   * devices
   * @member {Object} Application#devices
   */
  get devices() {
    if (!this[DeviceDescriptors]) {
      this[DeviceDescriptors] = devices;
    }
    return this[DeviceDescriptors];
  },
};
