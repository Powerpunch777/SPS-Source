import { runSpsWorker, defineSpsPlugin } from "@sonparkserver/plugin-sdk/worker";
import { createSpsRuntimeClient } from "@sonparkserver/plugin-sdk/runtime";
import { defineSpsPlatformContract } from "@sonparkserver/plugin-sdk/platform";

let runtime;
const plugin = defineSpsPlugin({
  initialize({ spsTransport }) {
    runtime = createSpsRuntimeClient(spsTransport);
  },
  platform: defineSpsPlatformContract({
    capabilities: ["sps.connectivity.read"],
    data: [{
      key: "fixture.connectivity",
      handler: () => runtime.connectivity.current(),
    }],
  }),
});

runSpsWorker(plugin);
