require('./support/bootstrap');

const Cache   = require('./../lib/Cache');
const mock    = require('mock-fs');
const sinon   = require('sinon');
const pify    = require('pify');
const fs      = require('fs');
const _       = require('lodash');
const fsExtra = require('fs-extra');

const copy = function () {
    return pify(fsExtra.copy)('sample/assets/foo.txt', 'sample/build/foo.txt');
};

const modify = function () {
    return pify(fsExtra.copy)('sample/assets/foo.txt', 'sample/assets/foo2.txt');
};

const resetWorkspace = function () {
    return pify(fsExtra.remove)('sample/build');
};

describe('Cache', ()=> {
    describe('doCached', ()=> {
        var options = {
            action: 'op',
            input:  ['sample/assets/*'],
            output: ['sample/build/*']
        };
        beforeEach(()=> {
        });
        afterEach(()=> {
            resetWorkspace();
        });
        it('should not run the callable a second time if the input files stayed the same', () => {
            let options = _.assign({}, options, {run: sinon.spy()});
            let cache   = new Cache();
            return cache.doCached(options)
                .then(() => cache.doCached(options))
                .then(() => run.should.have.been.calledOnce);
        });
        it('should run the callable twice if the input files were modified', () => {
            let options = _.assign({}, options, {run: sinon.spy(copy)});
            let cache   = new Cache();
            return cache.doCached(options)
                .then(() => modify())
                .then(() => cache.doCached(options))
                .then(() => run.should.have.been.calledTwice);
        });
    });
});

test('callable is called twice if input files are modified', t => {
    cache.doCached(options);
    //modify();
    cache.doCached(options);
    t.ok(run.calledTwice);
});

test('cached operation is restored', t => {
    return cache.doCached(options)
        .then(() => resetWorkspace())
        .then(() => cache.doCached(options))
        .then(() => pify(fs.readFile)('sample/build/foo.txt'))
        .then((data) => {
            t.is(data, 'bar');
        });
});