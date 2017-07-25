'use strict';

/**
 * Check whether the given record, with the "expires" property, has expired
 * @param expires
 */
module.exports = ({expires}) => expires !== -1 && expires <= Date.now();