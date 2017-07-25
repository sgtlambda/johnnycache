'use strict';

const path = require('path');

module.exports = filename => path.basename(filename).substring(0, path.basename(filename).lastIndexOf('.'));