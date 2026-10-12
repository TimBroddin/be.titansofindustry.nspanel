'use strict';

import Homey from 'homey';

module.exports = class MyApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit(): Promise<void> {
    this.log('NSPanel App has been initialized');
  }
};
