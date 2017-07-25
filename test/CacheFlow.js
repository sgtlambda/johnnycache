'use strict';

require('./support/bootstrap');

const sinon      = require('sinon');
const del        = require('del');
const pify       = require('pify');
const fsExtra    = require('fs-extra');
const pathExists = require('path-exists');
const fsCopy     = pify(fsExtra.copy);

const Cache     = require('./../lib/Cache');
const CacheFlow = require('./../lib/CacheFlow');
const Step      = require('./../lib/Step');
const Intent    = require('./../lib/Intent');
const Operation = require('./../lib/Operation');

const deleteBuild = function () {
    return del(['test/sample/build']);
};

const resetWorkspace = function () {
    return del(['test/sample/build', '.johnny']);
};

describe('CacheFlow', () => {

    let cache, cacheFlow;

    const noopSteps = (fn1, fn2) => {
        return [
            {intent: new Intent(fn1)},
            {intent: new Intent(fn2)},
        ];
    };

    const sourceFile       = 'test/sample/assets/foo.txt';
    const intermediateFile = 'test/sample/build/temp.txt';
    const targetFile       = 'test/sample/build/bar.txt';

    const copyIntent = (from = sourceFile, to = targetFile) => new Intent(() => {
        return fsCopy(from, to);
    }, {
        input:  [from],
        output: [to],
    });

    const copyStepsWithIntermediate = () => {
        return [
            {intent: copyIntent(sourceFile, intermediateFile), isIntermediate: true},
            {intent: copyIntent(intermediateFile, targetFile)},
        ];
    };

    beforeEach(() => {

        cache     = new Cache();
        cacheFlow = new CacheFlow({cache});
    });

    afterEach(resetWorkspace);

    it('should be able to run a series of steps', async () => {

        const step1 = sinon.spy();
        const step2 = sinon.spy();

        cacheFlow.import(noopSteps(step1, step2));

        await cacheFlow.run();

        step1.should.have.been.calledOnce;
        step2.should.have.been.calledOnce;
    });

    it('should not run or restore an intermediate step the second time around', async () => {

        cacheFlow.import(copyStepsWithIntermediate());

        await cacheFlow.run();

        (await pathExists(intermediateFile)).should.be.true;
        (await pathExists(targetFile)).should.be.true;

        await deleteBuild();

        // Reset the steps because they are stateful
        cacheFlow.import(copyStepsWithIntermediate());
        await cacheFlow.run();

        (await pathExists(intermediateFile)).should.be.false;
        (await pathExists(targetFile)).should.be.true;
    });
});