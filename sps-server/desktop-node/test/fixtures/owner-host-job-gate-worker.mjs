import { parentPort } from "node:worker_threads";

parentPort?.postMessage({ kind: "worker-ran", execArgv: process.execArgv });
