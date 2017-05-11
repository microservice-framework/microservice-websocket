/**
 * Profile Stats MicroService.
 */
'use strict';

const WSCluster = require('./includes/cluster.js');
const framework = '@microservice-framework';
const MicroserviceRouterRegister = require(framework + '/microservice-router-register').register;
const clientViaRouter = require(framework + '/microservice-router-register').clientViaRouter;
const Validator = require('jsonschema').Validator;

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
        methods: {
          post: 'data',
          put: 'data',
          delete: 'data',
          search: 'meta',
          get: 'meta',
        }
      },
      cluster: cluster
    });
  }
}

function websocketPreSendMessage(jsonData, auth, callback) {
  debug.debug('Received pre Send Message %O %O', auth, jsonData);

  jsonData.method.toLowerCase();
  //  jsonData.
  callback(null, jsonData);
}

/**
 * WS Message handler.
 * Process message from Client.
 */
function websocketReceivedMessage(jsonData, auth, callback) {
  debug.debug('Received Client Message %O', jsonData);

  var errors = websocketValidateJson(jsonData);
  if (true !== errors) {
    var error = new Error;
    error.message = errors.join();
    debug.debug('REQUEST:validateJson %O', error);
    return callback(error);
  }
  if (auth.internal) {
    return clientViaRouter(jsonData.EndPoint, function(err, apiServer) {
      if (err) {
        return callback(err);
      }
      processRequest(jsonData, apiServer, callback);
    });
  }
  clientViaRouter(jsonData.EndPoint, auth.accessToken, function(err, apiServer) {
    if (err) {
      return callback(err);
    }
    processRequest(jsonData, apiServer, callback);
  });
}

/**
 * Process request.
 */
function processRequest(jsonData, apiServer, callback) {
  switch (jsonData.method){
    case 'POST': {
      apiServer.post(jsonData.Request, callback);
      break;
    }
    case 'GET': {
      if (jsonData.RecordToken) {
        return apiServer.get(sonData.RecordID, jsonData.RecordToken, callback);
      }
      apiServer.get(sonData.RecordID, callback);
      break;
    }
    case 'PUT': {
      if (jsonData.RecordToken) {
        return apiServer.put(sonData.RecordID, jsonData.RecordToken, jsonData.Request, callback);
      }
      apiServer.put(sonData.RecordID, jsonData.Request, callback);
      break;
    }
    case 'DELETE': {
      if (jsonData.RecordToken) {
        return apiServer.delete(sonData.RecordID, jsonData.RecordToken, callback);
      }
      apiServer.delete(sonData.RecordID, callback);
      break;
    }
    case 'SEARCH': {
      apiServer.search(jsonData.Request, callback);
      break;
    }
    case 'POST': {
      apiServer.options(jsonData.Request, callback);
      break;
    }
    default: {
      return callback(new Error('Unsupported method'));
    }
  }
}

/**
 * Validate message.
 */
function websocketValidateJson(jsonData) {

  var v = new Validator();
  try {
    var schemaTask = JSON.parse(fs.readFileSync('schema/' + process.env.schema));
  } catch (e) {
    debug.debug('validateJson:Validator %O', e);
    var errors = [];
    errors.push(new Error('Internal error: schema syntax error.'));
    return errors;
  }
  var result = v.validate(jsonData, schemaTask);
  if (['GET', 'PUT', 'DELETE'].indexOf(jsonData.method) != -1) {
    if (!jsonData.RecordID) {
      result.errors.push({
        property: 'RecordID',
        message: 'RecordID required if method is GET, PUT or DELETE'
      });
    }
  }
  if (['POST', 'PUT', 'SEARCH', 'OPTIONS'].indexOf(jsonData.method) != -1) {
    if (!jsonData.Request) {
      result.errors.push({
        property: 'Request',
        message: 'Request required if method is POST, PUT, SEARCH or OPTIONS'
      });
    }
  }
  if (result.errors.length > 0) {
    var errors = [];
    for (var errorNum in result.errors) {
      errors.push(result.errors[ errorNum ].property + ' ' + result.errors[ errorNum ].message);
    }
    return errors;
  }
  return true;

};
