/**
 * Profile Stats MicroService.
 */
'use strict';

const WSCluster = require('./includes/cluster.js');
const MicroserviceRouterRegister = require('@microservice-framework/microservice-router-register').register;

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
    init: websocketInit,
    receivedMessage: websocketReceivedMessage,
    preSendMessage: websocketPreSendMessage
  }
});

/**
 * Init Handler.
 */
function websocketInit(cluster, worker, address) {
  if (worker.id == 1 && address.addressType == 4) {
    console.log('Start register');
//    console.log(worker);
    console.log(address);
    var mserviceRegister = new MicroserviceRouterRegister({
      server: {
        url: process.env.ROUTER_URL,
        secureKey: process.env.ROUTER_SECRET,
        period: process.env.ROUTER_PERIOD,
      },
      route: {
        path: [process.env.SELF_PATH],
        url: process.env.SELF_URL,
        secureKey: process.env.SECURE_KEY,
        scope: 'ws',
      },
      cluster: cluster
    });
  }
}

function websocketPreSendMessage(jsonData, auth, callback) {
  debug.debug('Received pre Send Message %O %O', auth, jsonData);
  callback(null, jsonData);
}
/**
 * WS Message handler.
 * Process message from Client.
 */
function websocketReceivedMessage(jsonData, callback) {
  debug.debug('Received Client Message %O', jsonData);
  callback(null, { answer: 'All GooD', data: jsonData.date});
}
