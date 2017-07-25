'use strict';

require('./../support/bootstrap');

const isDependency = require('./../../lib/util/isDependency');

describe('isDependency', () => {

    it('should determine whether some of the input files are contained by some of the output files', () => {

        isDependency([], []).should.be.false;

        isDependency(['foo'], ['foo']).should.be.true;

        isDependency(['foo/bar'], ['foo']).should.be.true;

        isDependency(['foo/bar', 'baz'], ['foo']).should.be.true;

        isDependency(['bar/bar', 'baz'], ['foo']).should.be.false;

        isDependency(['bar/bar', 'baz'], ['baz/*']).should.be.false;
    });
});