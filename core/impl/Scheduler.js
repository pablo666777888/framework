/**
 * Created by krasilneg on 19.07.17.
 */
const child = require('child_process');

/**
 * @param {{}} options
 * @param {Boolean} options.enabled
 * @param {SettingsRepository} options.settings
 * @param {Logger} [options.log]
 * @param {Number} [options.stopTimeout]
 * @constructor
 */
function Scheduler(options) {
  let running = {};

  function stopper(nm, ch) {
    return new Promise((resolve) => {
      let to = setTimeout(
        () => {
          if (options.log) { options.log.warn(`Не удалось завершить задание ${nm} в отведенное время`); }
          ch.removeAllListeners();
          resolve();
        },
        options.stopTimeout || 10000
      );
      ch.on('exit', () => {clearTimeout(to);resolve();});
      ch.on('error', () => {clearTimeout(to);resolve();});
      ch.kill(9);
    });
  }

  /**
   * @returns {Promise}
   */
  this.stopAll = function () {
    let result = [];
    for (let nm in running) {
      if (running.hasOwnProperty(nm)) {
        result.push(stopper(nm, running[nm]));
      }
    }
    return Promise.all(result).then(()=>{running = {};});
  };

  /**
   * @param {String} job
   * @returns {Promise}
   */
  this.run = function (job) {
    try {
      if (!running.hasOwnProperty(job)) {
        let jobs = options.settings.get('jobs');
        if (!jobs.hasOwnProperty(job)) {
          throw new Error(`Задание ${job} не найдено в конфигурации`);
        }
        running[job] = child.fork('bin/job-runner', [job], {silent: true});
      }
      return Promise.resolve();
    } catch (err) {
      return Promise.reject(err);
    }
  };

  /**
   * @param {String} job
   * @returns {boolean}
   */
  this.isRunning = function (job) {
    let jobs = options.settings.get('jobs');
    if (!jobs.hasOwnProperty(job)) {
      throw new Error(`Задание ${job} не найдено в конфигурации`);
    }
    return running.hasOwnProperty(job);
  };

  /**
   * @param {String} job
   * @returns {Promise}
   */
  this.stop = function (job) {
    if (running.hasOwnProperty(job)) {
      return stopper(job, running[job]);
    }
    return Promise.resolve();
  };

  /**
   * @returns {Promise}
   */
  this.start = function () {
    try {
      let jobs = options.settings.get('jobs');
      for (let nm in jobs) {
        if (jobs.hasOwnProperty(nm) && !jobs[nm].disabled) {
          running[nm] = child.fork('bin/job-runner', [nm], {silent: true});
        }
      }
      return Promise.resolve();
    } catch (err) {
      return Promise.reject(err);
    }
  };

  /**
   * @returns {Promise}
   */
  this.restart = function () {
    return this.stopAll().then(()=>{
      return this.start();
    });
  };
}

module.exports = Scheduler;
