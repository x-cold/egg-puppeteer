'use strict';

const debug = require('debug')('eggPuppeteer:puppeteer');
const puppeteer = require('puppeteer');
const DeviceDescriptors = require('puppeteer/DeviceDescriptors');
const schedule = require('node-schedule');

/**
 * PuppeteerClass 实例化
 *
 * @param {Object} config - 配置
 *
 * @prop {Number} maxPage - 标签页数量
 * @prop {Number} maxPageCount - 单个标签页最大访问次数：超出则需要重启（否则会造成 Chrome 内存占用过高）
 * @prop {Object} logger - 日志处理工具
 * @prop {Object} browser - 浏览器实例
 * @prop {Array} pages - 标签页列表
 * @prop {Boolean} checking - 是否正在进行健康检查
 * @prop {Object} reportJob - 进程上报任务
 * @prop {Object} checkJob - 健康检查任务
 *
 * @method getBrowser
 * @method getPage
 */

class PuppeteerClass {
  constructor(config) {
    this.config = config;
    this.logger = config.logger;
    this.maxPage = config.maxPage;
    this.maxPageCount = config.maxPageCount;
    this.pages = [];
    this.browser = null;
    this.checking = false;
    this.reportJob = null;
    this.checkJob = null;
  }

  // TODO: 浏览器错误处理
  async onBrowserError() {
    return;
  }

  // 创建浏览器实例
  async initBrowser() {
    debug('开始创建浏览器实例');
    this.browser = await puppeteer.launch(this.config.browser);
    debug('成功创建浏览器实例');
    return this.browser;
  }

  // 获取浏览器实例
  async getBrowser() {
    if (!this.browser) {
      return await this.initBrowser();
    }
    try {
      const page = await this.browser.newPage();
      await page.close();
    } catch (error) {
      this.logger.error(`[PuppeteerClass] 浏览器获取失败: ${error.message}`);
      await this.initBrowser();
    }
    return this.browser;
  }

  // 标签页错误处理
  async onPageError(error) {
    this.isFailed = true;
    await this.close();
    this.logger.error(`[Puppeteer] 标签页异常退出: ${error}`);
  }

  // 创建一个标签页
  async initPage() {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    page.logger = this.logger;

    const onError = this.onPageError.bind(page);

    // 添加 end 方法
    page.end = function() {
      this.inUse = false;
    };
    const close = page.close;
    page.close = function() {
      this.end();
      close.apply(this, arguments);
    };
    page.count = 0;

    // 添加异常处理句柄
    page.on('error', onError);
    page.on('pageerror', onError);
    page.on('Inspector.targetCrashed', onError);

    // 加载模拟器，即 F12 的模拟设备
    const device = DeviceDescriptors[this.config.emulateDevice];
    if (typeof device !== 'undefined') {
      await page.emulate(device);
    }

    return page;
  }

  // 创建标签页池
  async initPages() {
    const pages = [];
    for (let i = 0; i < this.maxPage; i++) {
      pages.push(this.initPage());
    }
    this.pages = await Promise.all(pages);
    debug('标签页创建成功');
  }

  async checkPage(i) {
    const { pages, maxPageCount } = this;
    let page = pages[i];
    try {
      if (!page) {
        throw new Error('Page is not defined.');
      }
      if (page.isFailed) {
        throw new Error('Page Failed.');
      }
      if (page.count >= maxPageCount) {
        page.isFailed = true;
        await page.close();
        throw new Error(`Page has been used too many times. count => ${page.count}, maxPageCount => ${maxPageCount}`);
      }
      // 测试标签页是否正常
      await page.evaluate(function() {
        return document.title;
      });
    } catch (error) {
      this.logger.warn(`[PuppeteerClass] 健康检查异常: ${error}`);
      page = await this.initPage();
      this.pages.splice(i, 1, page);
    }
    return page;
  }

  async checkPages() {
    if (this.checking) {
      debug('已有正在执行的健康检查任务，无需重复!');
      return;
    }
    const time = process.hrtime();
    const promises = [];

    for (let i = 0; i < this.maxPage; i++) {
      promises.push(this.checkPage(i));
    }
    await promises;

    const diff = process.hrtime(time);
    this.logger.info(`[PuppeteerClass] 健康检查完成, 耗时: ${((diff[0] * 1e6 + diff[1]) / 1000).toFixed(3)} ms.`);
    this.checking = false;
  }

  // 随机获取某个空闲的 page
  // ex1: [5, 6, 7, 8, 9, 0, 1, 2, 3, 4]
  // ex2: [6, 7, 8, 9, 0, 1, 2, 3, 4, 5]
  async getPage() {
    const { pages } = this;
    let page;

    // startIndex
    let i = Math.floor(Math.random() * pages.length);
    // let i = 0;
    let findLength = 0;
    while (findLength < pages.length) {
      // 标签页空闲 & 标签页正常运行
      if (!pages[i].inUse && !pages[i].isFailed) {
        page = pages[i];
        break;
      }
      if (i < pages.length - 1) {
        i++;
      } else if (i === pages.length - 1) {
        i = 0;
      }
      findLength++;
    }

    if (!page) {
      return null;
    }
    if (page.count >= this.maxPageCount) {
      await this.checkPages();
      return null;
    }

    page.inUse = true;
    page.count++;

    return page;
  }

  // 创建浏览器和标签页
  async init() {
    await this.initBrowser();
    await this.initPages();
    await this.startJobs();
  }

  // 关闭所有标签页
  async killAllPage() {
    for (let i = 0; i < this.pages.length; i++) {
      this.pages[i].close();
      this.pages.shift();
    }
  }

  /**
   * 实例销毁时调用
   *
   * @desc
   *  - 关闭所有标签页
   *  - 关闭浏览器
   *  - 停止所有 job
   */
  async destory() {
    await this.killAllPage();
    await this.browser.close();
    const jobs = [
      this.checkJob,
      this.reportJob,
    ];
    jobs.forEach(job => job.cancel());
  }

  /**
   * 定时任务: 上报进程信息 & 健康检查
   *
   * @desc
   *  - checkJob: 健康检查任务
   *  - reportJob: 上报任务
   */
  async startJobs() {
    this.checkJob = schedule.scheduleJob('0 * * * * *', async () => {
      await this.checkPages();
    });
    this.reportJob = schedule.scheduleJob('0 * * * * *', () => {
      this.report();
    });
  }

  /**
   * 上报进程数量
   *
   * @desc
   *  - pageCount: 总标签页数量
   *  - existCount: 存活的标签页数量
   *  - failedCount: 失效的标签页数量
   *  - freeCount: 空闲的标签页数量
   */
  report() {
    const process = {
      pageCount: this.pages.length,
      existCount: this.pages.filter(page => !page.isFailed).length,
      failedCount: this.pages.filter(page => page.isFailed).length,
      freeCount: this.pages.filter(page => !page.isFailed && !page.inUse).length,
    };
    this.logger.info(`[PuppeteerReport] pageCount: ${process.pageCount}, existCount: ${process.existCount}, failedCount: ${process.failedCount}, freeCount: ${process.freeCount}`);
  }
}

module.exports = {
  PuppeteerClass,
  puppeteer,
  devices: DeviceDescriptors,
};
