'use strict';

const getScoreForResult = require('./getScoreForResult');
const _                 = require('lodash');

/**
 * Get the results that should be removed to maintain the maximum allowed cache size
 * @param {Result[]} results
 * @param allowedMaxSize
 * @param currentTotalSize
 * @returns {Result[]}
 */
module.exports = (results, allowedMaxSize, currentTotalSize) => {

    if (currentTotalSize <= allowedMaxSize) return [];

    let mappedResults = _.map(results, result => {
        var score = module.exports.getScore(result, results);
        return {result, score};
    });

    let sortedResults = _.map(_.sortBy(mappedResults, 'score'), 'result');
    let remove        = [];
    while (currentTotalSize > allowedMaxSize && sortedResults.length) {
        let removeOne = sortedResults.shift();
        remove.push(removeOne);
        currentTotalSize -= removeOne.fileSize;
    }
    return remove;
};

module.exports.getScore = getScoreForResult;