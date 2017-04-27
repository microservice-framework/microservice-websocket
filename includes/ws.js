/**
 * Handle HTTP startup and shutdown.
 * Parse request and send answer.
 */
'use strict';

const WebSocket = require('ws');
const debugF = require('debug');
const dgram = require('dgram');

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
    self.debug.debug('UDP: received %s from %s:%s', message, rinfo.address, rinfo.port);
    var answer = {}
    try {
      message = JSON.parse(message);
    } catch(e) {
      self.debug.debug('UDP: message parse error %O', e);
      answer.error = e.message;
      answer = JSON.stringify(answer);

      return self.UDPServer.send(Buffer.from(answer), rinfo.port, rinfo.address ,function(err) {
        self.debug.debug('UDP: sent error %O', err);
      });
    }
    process.send(JSON.stringify(message));
    answer = { message: message };
    answer = JSON.stringify(answer);
    return self.UDPServer.send(Buffer.from(answer), rinfo.port, rinfo.address ,function(err) {
        self.debug.debug('UDP: sent error %O', err);
      });
  });

  self.UDPServer.on('listening', function() {
    var address = self.UDPServer.address();
    self.debug.log('UDP Listen on %s:%s', address.address, address.port);
  });

  process.on('message', function(message) {
    self.message(message);
  });
}

/**
 * Process IPM process.message request.
 */
WebSocketServer.prototype.message = function(message) {
  var self = this;
  self.debug.debug('IPM Message received: %s', message.toString());

  self.WSServer.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      self.debug.debug('Send message to client');
      client.send(message);
    }
  });
}

/**
 * Process server WS connection.
 */
WebSocketServer.prototype.connection = function(ws) {
  var self = this;
  self.debug.request('Client connected');
  ws.on('message', function(message) {
    self.debug.request('Message received %O', message);
    try {
      message = JSON.parse(message);
    } catch(e) {
      return ws.send({
        err: e.message
      });
    }
    if (self.data.callbacks['clientMessage']) {
      self.data.callbacks['clientMessage'](message, function(err, answer) {
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