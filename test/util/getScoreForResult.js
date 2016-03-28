'use strict';

require('./../support/bootstrap');

const getScoreForResult = require('./../../lib/util/getScoreForResult');
const CachedResult      = require('./../../lib/CachedResult');

describe('getScoreForResult', () => {

    let defaultCachedResult = new CachedResult(null, 'some op', null, null, null, null, 100, 100);

    let cachedResultHigherFileSize = new CachedResult(null, 'some op', null, null, null, null, 1000, 100);

    let cachedResultNewer = new CachedResult(null, 'some op', null, null, null, null, 100, 100);
    cachedResultNewer.created += 100;

    let cachedResultHigherRuntime = new CachedResult(null, 'some op', null, null, null, null, 100, 1000);

    it('should get a score for the given result', () => {

        getScoreForResult(defaultCachedResult).should.be.a('number');
    });

    it('should prefer smaller files', () => {

        getScoreForResult(defaultCachedResult).should.be.above(getScoreForResult(cachedResultHigherFileSize));
    });

    it('should prefer results with longer runtime', () => {

        getScoreForResult(cachedResultHigherRuntime).should.be.above(getScoreForResult(defaultCachedResult));
    });

    it('should prefer newer files', () => {

        getScoreForResult(cachedResultNewer).should.be.above(getScoreForResult(defaultCachedResult));
    });

    it('should weight runtime more heavily than filesize', () => {

        getScoreForResult(cachedResultHigherRuntime).should.be.above(getScoreForResult(cachedResultHigherFileSize));
    });

    it('should give the result a lower score if a context of other results is given', () => {

        var scoreWithout = getScoreForResult(defaultCachedResult);
        var scoreWith    = getScoreForResult(defaultCachedResult, [
            defaultCachedResult, cachedResultNewer
        ]);
        scoreWithout.should.be.above(scoreWith);
    });
});