const express = require('express');
const app = express();

app.get('/exec', (req, res) => {
  const cmd = req.query.cmd;
  eval(cmd);
  res.send('done');
});

module.exports = app;
