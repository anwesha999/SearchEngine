const constants = require('./constants');

exports.printLog = function (message, logLevel) {
    switch (logLevel) {
        case constants.LOG_LEVEL.ERROR:
            console.error(message);
            break;
        case constants.LOG_LEVEL.INFO:
            console.info(message);
            break;
        case constants.LOG_LEVEL.DEBUG:
            console.debug(message);
            break;
        default:
            console.log(message);
    }
};