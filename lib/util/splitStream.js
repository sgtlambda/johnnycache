'use strict';

const {forEach}   = require('lodash');
const PassThrough = require('stream').PassThrough;

/**
 * Create a PassThrough stream that is piped to all the destination streams
 * @param destinations
 * @returns {Stream}
 */
module.exports = destinations => {

    const pass = new PassThrough();

    forEach(destinations, destination => {
        pass.pipe(destination);
    });

    return pass;
};