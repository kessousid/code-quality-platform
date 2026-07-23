export default function () {
  return new Promise(() => {}); // never resolves — see runtime.spec.ts's identical fixture in @cqp/plugin-runtime
}
