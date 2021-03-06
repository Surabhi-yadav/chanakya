'use strict';

const Glue = require('glue');
const Manifest = require('./manifest');
const cron = require("node-cron");
const CONSTANTS = require('../lib/constants')

exports.deployment = async (start) => {

    const manifest = Manifest.get('/');
    const server = await Glue.compose(manifest, { relativeTo: __dirname });

    // Printing a request log
    server.events.on('response', function (request) {
        request.log(request.info.remoteAddress + ': ' + request.method.toUpperCase() + ' ' + request.url.path + ' --> ' + request.response.statusCode);
    });


    await server.initialize();

    if (!start) {
        return server;
    }

    await server.start();

    console.log(`Server started at ${server.info.uri}`);

    // schedule the metric calculation cron
    cron.schedule(CONSTANTS.metricCalcCron, () => {
        const { metricsService } = server.services();
        metricsService.recordPendingMetrics();
    });

    return server;
};

if (!module.parent) {

    exports.deployment(true);

    process.on('unhandledRejection', (err) => {

        throw err;
    });
}
