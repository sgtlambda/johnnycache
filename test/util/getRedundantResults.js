'use strict';

require('./../support/bootstrap');

const sinon               = require('sinon');
const getRedundantResults = require('./../../lib/util/getRedundantResults');

const makeMockResult = fileSize => {
    return {
        fileSize
    };
};

describe('getRedundantResults', () => {

    let r1 = makeMockResult(501);
    let r2 = makeMockResult(502);
    let r3 = makeMockResult(503);
    let r4 = makeMockResult(504);

    let getScoreStub = sinon.stub();

    getScoreStub.withArgs(r1).returns(1);
    getScoreStub.withArgs(r2).returns(2);
    getScoreStub.withArgs(r3).returns(3);
    getScoreStub.withArgs(r4).returns(0);

    getRedundantResults.getScore = getScoreStub;

    it('should determine what results to remove in order to prevent exceeding the maximum cache size', () => {

        var redundantResults = getRedundantResults([
            r1, r2, r3, r4
        ], 1000, 2000);

        redundantResults.should.have.length(2)
            .and.include(r1)
            .and.include(r4);
    });

    it('should return an empty array if there is no need to remove any results', () => {

        getRedundantResults([
            r1, r2, r3, r4
        ], 2000, 1000).should.deep.equal([]);
    });
});