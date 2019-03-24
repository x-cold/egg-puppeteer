'use strict';

const debug = require('debug')('eggPuppeteer:app');

const {
  PuppeteerClass,
} = require('./lib/puppeteer');

/**
 * 为每个 AppWorker 构建一个浏览器实例
 *
 * @param {*} app
 */

module.exports = app => {
  if (app.browser || !app.config.puppeteer) {
    return;
  }
  let puppeteerInstance;
  app.beforeStart(async () => {
    debug('创建实例开始');
    app.config.puppeteer.logger = app.logger;
    puppeteerInstance = new PuppeteerClass(app.config.puppeteer);
    await puppeteerInstance.init();
    debug('创建实例完毕');
    app.browser = puppeteerInstance;
  });
  app.beforeClose(async () => {
    await puppeteerInstance.destory();
  });
};
