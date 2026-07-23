export default function () {
  return new Promise(() => {
    // Never resolves — simulates a plugin that hangs (Semgrep spinning on a
    // huge repo, a malformed-output infinite loop, etc).
  });
}
