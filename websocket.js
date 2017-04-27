/**
 * Profile Stats MicroService.
 */
'use strict';

const WSCluster = require('./includes/cluster.js');

const debugF = require('debug');

var debug = {
  log: debugF('ws:log'),
  debug: debugF('ws:debug')
};

require('dotenv').config();

var mControlCluster = new WSCluster({
  pid: process.env.PIDFILE,
  count: process.env.WORKERS,
  ws: {
    port: process.env.PORT,
    hostname: process.env.HOSTNAME
  },
  callbacks: {
    clientMessage: websocketClientMessage
  }
});

function websocketClientMessage(jsonData, callback) {
  debug.debug('Client Message %O', jsonData);
  callback(null, { answer: 'All GooD', data: jsonData.date});
}
