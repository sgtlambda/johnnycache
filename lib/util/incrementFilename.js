'use strict';

const path         = require('path');
const pathExists   = require('path-exists');
const promiseRetry = require('promise-retry');

const basenameWithoutExtension = require('./basenameWithoutExtension');

/**
 * Increment the suffix of the given filename
 * until no other result with the same filename exists
 *
 * @param {String} filename
 * @param {Function} getAbsolutePath
 *
 * @returns {Promise}
 */
module.exports = async ({filename, getAbsolutePath}) => {

    let updatedFilename = null;
    let baseName        = basenameWithoutExtension(filename);
    let ext             = path.extname(filename);
    let increment       = 0;

    await promiseRetry(async retry => {
        updatedFilename = baseName + (increment ? ('-' + increment) : '') + ext;
        let filename    = getAbsolutePath(updatedFilename);
        const exists    = await pathExists(filename);
        if (exists) {
            increment++;
            retry(new Error('file exists'));
        }
    }, {retries: 100, minTimeout: 0});

    return updatedFilename;
};