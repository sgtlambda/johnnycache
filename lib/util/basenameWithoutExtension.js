'use strict';

const path = require('path');

module.exports = fileName => path.basename(fileName).substring(0, path.basename(fileName).lastIndexOf('.'));