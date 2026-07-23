// Deliberate multi-issue fixture: eval() (semgrep), a fake Slack token
// (gitleaks), an unused variable and an undeclared reference (eslint).
const secretToken = 'xoxb-123456789012-123456789012-abcdefghijklmnopqrstuvwx';
const unusedVariable = 42;

function handleRequest(req, res) {
  eval(req.query.cmd);
  return undeclaredHelper();
}

module.exports = { handleRequest, secretToken };
