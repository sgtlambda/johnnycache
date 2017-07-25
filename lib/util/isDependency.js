'use strict';

const {some, startsWith, trimEnd} = require('lodash');

/**
 * Check whether (some of) the output of the intermediate operation is needed
 * as (some of) the input for the final operation
 * @param inputFiles
 * @param outputFiles
 */
const isDependency = (inputFiles, outputFiles) => {

    // Iterate over all the input files and return true if
    // at least one of them evaluates to true given the predicate
    return some(inputFiles, inputFile => {

        return some(outputFiles, outputFile => {

            return startsWith(inputFile, trimEnd(outputFile, '*'));
        });
    });
};

module.exports = isDependency;