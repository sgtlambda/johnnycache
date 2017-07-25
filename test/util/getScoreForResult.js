'use strict';

require('./../support/bootstrap');

const getScoreForResult = require('./../../lib/util/getScoreForResult');
const Result            = require('./../../lib/Result');

describe('getScoreForResult', () => {

    let defaultResult = new Result({action: 'some op', fileSize: 100, runtime: 100});

    let resultHigherFileSize = new Result({action: 'some op', fileSize: 1000, runtime: 100});

    let resultNewer = new Result({action: 'some op', fileSize: 100, runtime: 100});
    resultNewer.created += 100;

    let resultHigherRuntime = new Result({action: 'some op', fileSize: 100, runtime: 1000});

    it('should get a score for the given result', () => {

        getScoreForResult(defaultResult).should.be.a('number');
    });

    it('should prefer smaller files', () => {

        getScoreForResult(defaultResult).should.be.above(getScoreForResult(resultHigherFileSize));
    });

    it('should prefer results with longer runtime', () => {

        getScoreForResult(resultHigherRuntime).should.be.above(getScoreForResult(defaultResult));
    });

    it('should prefer newer files', () => {

        getScoreForResult(resultNewer).should.be.above(getScoreForResult(defaultResult));
    });

    it('should weight runtime more heavily than filesize', () => {

        getScoreForResult(resultHigherRuntime).should.be.above(getScoreForResult(resultHigherFileSize));
    });

    it('should give the result a lower score if a context of other results is given', () => {

        const scoreWithout = getScoreForResult(defaultResult);
        const scoreWith    = getScoreForResult(defaultResult, [
            defaultResult, resultNewer
        ]);
        scoreWithout.should.be.above(scoreWith);
    });
});