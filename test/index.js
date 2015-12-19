'use strict';

require('./support/bootstrap');

const Cache   = require('./../lib/Cache');
const sinon   = require('sinon');
const pify    = require('pify');
const fs      = require('fs');
const _       = require('lodash');
const fsExtra = require('fs-extra');
const del     = require('del');

const copy = function () {
    return pify(fsExtra.copy)('sample/assets/foo.txt', 'sample/build/foo.txt');
};

const uncopy = function () {
    return del(['sample/build']);
};

const modify = function () {
    return pify(fsExtra.copy)('sample/assets/foo.txt', 'sample/assets/foo2.txt');
};

const resetWorkspace = function () {
    return del(['sample/build', '.johnny', 'sample/assets/foo2.txt']);
};

var defaultOptions = {
    action: 'op',
    input:  ['sample/assets/*'],
    output: ['sample/build/*']
};

describe('Cache', ()=> {
    describe('doCached', ()=> {
        let cache;
        beforeEach(()=> {
            cache = new Cache();
        });
        afterEach(()=> {
            return resetWorkspace();
        });
        it('should not run the callable a second time if the input files stayed the same', () => {
            let run     = sinon.spy();
            let options = _.assign({}, defaultOptions, {run});
            return cache.doCached(options)
                .then(() => uncopy())
                .then(() => cache.doCached(options))
                .then(() => run.should.have.been.calledOnce);
        });
        it('should run the callable twice if the input files were modified', () => {
            let run     = sinon.spy(copy);
            let options = _.assign({}, defaultOptions, {run});
            return cache.doCached(options)
                .then(() => modify())
                .then(() => cache.doCached(options))
                .then(() => run.should.have.been.calledTwice);
        });
        it('should restore the operation from cache the second time if the input files stayed the same', () => {
            let options = _.assign({}, defaultOptions, {run: copy});
            return cache.doCached(options)
                .then(() => uncopy())
                .then(() => cache.doCached(options))
                .then(() => pify(fs.readFile)('sample/build/foo.txt', {encoding: 'utf8'}))
                .then((data) => {
                    data.should.equal('bar');
                });
        });
    });
});