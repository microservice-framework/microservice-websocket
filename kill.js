'use strict';
const fs = require('fs');
require('dotenv').config();

if (process.env.PIDFILE) {
  var pid = fs.readFileSync(process.env.PIDFILE);
  process.kill(pid, 'SIGHUP');
}
