/**
 * Handle HTTP startup and shutdown.
 * Parse request and send answer.
 */
'use strict';

const WebSocket = require('ws');
const debugF = require('debug');
const dgram = require('dgram');
const signature = require('./signature.js');

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
      if (self.data.callbacks['preSendMessage']) {
        self.debug.debug('Send message to client');
        self.data.callbacks['preSendMessage'](message, client.authData, function(err, answer) {
          client.send(JSON.stringify(answer));
        });
      }
    }
  });
}

/**
 * Process server WS connection.
 */
WebSocketServer.prototype.connection = function(ws) {
  var self = this;
  self.debug.request('Client connected');
  ws.authData = {
    test: 0
  }
  ws.on('message', function(message) {
    self.debug.request('Message received %O', message);
    try {
      message = JSON.parse(message);
    } catch(e) {
      return ws.send({
        err: e.message
      });
    }
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