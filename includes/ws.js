/**
 * Handle HTTP startup and shutdown.
 * Parse request and send answer.
 */
'use strict';

const WebSocket = require('ws');
const debugF = require('debug');
const dgram = require('dgram');
const signature = require('./signature.js');
const clientViaRouter = require('@microservice-framework/microservice-router-register').clientViaRouter;

/**
 * Constructor.
 *   Prepare data for deploy.
 */
function WebSocketServer(data) {
  // Use a closure to preserve `this`
  var self = this;
  self.data = data;

  var wsSettings = data.ws;
  self.WSServer = new WebSocket.Server(wsSettings);
  self.WSServer.on('connection', function(ws) {
    self.connection(ws);
  });
  self.WSServer.on('listening', function() {
    self.debug.log('WS Listen on :%s', self.data.ws.port);
  });
  self.UDPServer = dgram.createSocket('udp4');
  self.UDPServer.bind(data.ws.port);
  self.UDPServer.on('error', function(err) {
    self.debug.log('UDP Server error %O', err);
    server.close();
  });

  self.UDPServer.on('message', function(message, rinfo) {
    self.processUDPmessage(message, rinfo);
  });

  self.UDPServer.on('listening', function() {
    var address = self.UDPServer.address();
    self.debug.log('UDP Listen on %s:%s', address.address, address.port);
  });

  process.on('message', function(message) {
    self.processIPMMessage(message);
  });
}

/**
 * Process UDP message.
 */
WebSocketServer.prototype.processUDPmessage = function(message, rinfo) {
  var self = this;

  self.debug.debug('UDP: received %s from %s:%s', message, rinfo.address, rinfo.port);
  var answer = {}
  try {
    message = JSON.parse(message);
  } catch(e) {
    self.debug.debug('UDP: message parse error %O', e);
    answer.error = e.message;
    answer = JSON.stringify(answer);

    return self.UDPServer.send(Buffer.from(answer), rinfo.port, rinfo.address ,function(err) {
      if(err) {
        self.debug.debug('UDP: sent error %O', err);
      }
    });
  }
  var sign = message.signature;
  delete message.signature;
  if(!sign) {
    answer.error = 'No signature provided';
    answer = JSON.stringify(answer);
    return self.UDPServer.send(Buffer.from(answer), rinfo.port, rinfo.address ,function(err) {
      if(err) {
        self.debug.debug('UDP: sent error %O', err);
      }
    });
  }
  if(sign.length != 2) {
    self.debug.debug('UDP:Signature Malformed signature');
    answer.error = 'Malformed signature.';
    answer = JSON.stringify(answer);
    return self.UDPServer.send(Buffer.from(answer), rinfo.port, rinfo.address ,function(err) {
      if(err) {
        self.debug.debug('UDP: sent error %O', err);
      }
    });
  }

  if(sign[1] != signature(sign[0], JSON.stringify(message), process.env.SECURE_KEY)) {
    answer.error = 'Signature mismatch.';
    self.debug.debug('UDP:Signature mismatch');
    answer = JSON.stringify(answer);
    return self.UDPServer.send(Buffer.from(answer), rinfo.port, rinfo.address ,function(err) {
      if(err) {
        self.debug.debug('UDP: sent error %O', err);
      }
    });
  }

  // Send to parent to broadcast it.
  process.send(JSON.stringify(message));
  answer = { message: 'Received.' };
  answer = JSON.stringify(answer);

  return self.UDPServer.send(Buffer.from(answer), rinfo.port, rinfo.address ,function(err) {
    if(err) {
      self.debug.debug('UDP: sent error %O', err);
    }
  });

}

/**
 * Process IPM process.message request.
 */
WebSocketServer.prototype.processIPMMessage = function(message) {
  var self = this;
  self.debug.debug('IPM Message received: %s', message.toString());
  try {
    message = JSON.parse(message);
  } catch(e) {
    return self.debug.debug('JSON parse failed: %s', message.toString());
  }

  self.WSServer.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {

      // Check for token expire.
      if(client.auth.expireAt != -1) {
        if(client.auth.expireAt < Date.now()) {
          self.debug.debug('ipmBroadcast:expired token %s', client.auth.accessToken);
          return client.close(3003, 'Token expired');
        }
        if(!client.auth.scopes[message.scope]) {
          self.debug.debug('ipmBroadcast:no scope % for token %s', message.scope, client.auth.accessToken);
          return;
        }
        if(!client.auth.scopes[message.scope].methods[message.method.toLowerCase()]) {
          self.debug.debug('ipmBroadcast: scope %s for token %s do not support %s', message.scope, client.auth.accessToken, message.method);
          return;
        }
        // IF authorized by access token, send POST, PUT, DELETE only.
        var limitMethods = ['put', 'post', 'delete'];
        if(limitMethods.indexOf(message.method.toLowerCase()) == -1) {
          return;
        }
        // Check for values
        for(var name in client.auth.scopes[message.scope].values) {
          var value = client.auth.scopes[message.scope].values[name];
          if(!message.message[name]) {
            self.debug.debug('ipmBroadcast:message don\'t have %s', name);
            return;
          }
          if(message.message[name] != value) {
            self.debug.debug('ipmBroadcast:message[%s] != %s', name, value);
            return;
          }
        }

      }
      if (self.data.callbacks['preSendMessage']) {
        self.debug.debug('Send message to client');
        self.data.callbacks['preSendMessage'](message, client.auth, function(err, answer) {
          client.send(JSON.stringify(answer));
        });
      }
    }
  });
}

/**
 * Process server WS connection.
 */
WebSocketServer.prototype.onValidated = function(ws) {
  var self = this;
  ws.on('message', function(message) {
    // Check for token expire.
    if(ws.auth.expireAt != -1 && ws.auth.expireAt < Date.now()) {
      self.debug.debug('authServer:expired token %s', ws.auth.accessToken);
      return client.close(3003, 'Token expired');
    }
    self.debug.request('Message received %O', message);
    try {
      message = JSON.parse(message);
    } catch(e) {
      return ws.send({
        err: e.message
      });
    }
    /*
      {
        url: auth
        method: POST
        data: {
          test: 1 
          test: 2
        }
      }
      
    */
    if (self.data.callbacks['receivedMessage']) {
      self.data.callbacks['receivedMessage'](message, function(err, answer) {
        ws.send(JSON.stringify(answer , null, 2));
      });
    }
  });
  ws.on('close', function close() {
    self.debug.request('Client disconnected');
  });
}

/**
 * Process server WS connection.
 */
WebSocketServer.prototype.connection = function(ws) {
  var self = this;

  self.debug.request('Client connected');
  ws.auth = {}
  ws.auth.accessToken = ws.upgradeReq.url.substr(1);
  if(ws.auth.accessToken == process.env.SECURE_KEY) {
    ws.auth.expireAt = -1;
    return self.onValidated(ws);
  }
  clientViaRouter('auth', function(err, authServer) {
    if(err) {
      self.debug.debug('Validate:AccessToken err %O', err);
      ws.close(3003, 'auth service is unavailable');
      return;
    }
    authServer.search({
      accessToken: ws.auth.accessToken
    }, function(err, taskAnswer) {
      if (err) {
        self.debug.debug('authServer:search err: %O', err);
        return ws.close(3004, 'Access denied. Token not found.');
      }
      var accessScopes = {};
      var accessFound = false;

      for(var i in taskAnswer) {
        var accessRecord = taskAnswer[i];
        if(accessRecord.expireAt < Date.now()) {
          self.debug.debug('authServer:expired token %s', accessRecord.accessToken);
          continue;
        }
        for (var j in accessRecord.scope) {
          accessFound = true;
          var serviceScope = accessRecord.scope[j].service;
          accessScopes[serviceScope] = {
            methods: accessRecord.scope[j].methods,
            values: accessRecord.scope[j].values,
          }
        }
        ws.auth.expireAt = accessRecord.expireAt;
        break;
      }
      if(!accessFound) {
        self.debug.debug('No scopes found for access token %s', ws.accessToken);
        return ws.close(3004, 'Access denied. Scopes not defined for token.');
      }
      ws.auth.scopes = accessScopes;
      self.onValidated(ws);
    });
  });


}

/**
 * Process server stop request.
 */
WebSocketServer.prototype.stop = function() {
  var self = this;
  self.WSServer.close(function() {
    self.debug.log('WS server closed');
    self.UDPServer.close(function() {
      self.debug.log('UDP server closed');
      self.debug.log('worker stopped');
      process.exit();
    });
  });
};

/**
 * Define debug methods.
 */
WebSocketServer.prototype.debug = {
  log: debugF('ws-worker:log'),
  request: debugF('ws-worker:request'),
  debug: debugF('ws-worker:debug')
};

module.exports = WebSocketServer;