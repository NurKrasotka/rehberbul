'use strict';
const config = require('./config');
const { open } = require('./db');
const { createServer } = require('./app');

const db = open();
createServer(db).listen(config.PORT, () => {
  console.log(`RehberBul çalışıyor: http://localhost:${config.PORT}`);
});
