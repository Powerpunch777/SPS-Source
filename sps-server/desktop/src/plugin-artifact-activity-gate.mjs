function admissionDenied(message) {
  const error = new Error(message);
  error.code = "sps_plugin_artifact_admission_denied";
  return error;
}

export function createSpsDesktopPluginArtifactActivityGate() {
  // Process-local admission coordination only; this is not an authorization or OS/Core fence.
  let activeActivities = 0;
  let maintaining = false;
  const scopes = new Set();
  const uncertainties = new Set();

  function retainUncertainty() {
    const token = Symbol();
    uncertainties.add(token);
    // Only the Main caller confirming closure of the exact owned Core job may release this token.
    return () => { uncertainties.delete(token); };
  }

  function assertUncertaintyResolved() {
    if (uncertainties.size !== 0) {
      throw admissionDenied("SPS Desktop plugin artifact activity is uncertain.");
    }
  }

  function runTracked(action, start, finish) {
    let completeScope;
    const scope = new Promise(resolve => { completeScope = resolve; });
    scopes.add(scope);
    void scope.then(() => scopes.delete(scope));
    start();

    let result;
    try {
      result = action();
    } catch (error) {
      finish();
      completeScope();
      throw error;
    }

    return Promise.resolve(result).then(
      value => {
        finish();
        completeScope();
        return value;
      },
      error => {
        finish();
        completeScope();
        throw error;
      },
    );
  }

  function assertAdmissionAllowed() {
    assertUncertaintyResolved();
    if (maintaining) {
      throw admissionDenied("SPS Desktop plugin artifact maintenance is already active.");
    }
  }

  function withActivity(action) {
    assertAdmissionAllowed();
    if (typeof action !== "function") {
      throw new Error("SPS Desktop plugin artifact activity requires an action.");
    }
    return runTracked(action, () => { activeActivities += 1; }, () => { activeActivities -= 1; });
  }

  function withMaintenance(action) {
    assertUncertaintyResolved();
    if (typeof action !== "function") {
      throw new Error("SPS Desktop plugin artifact maintenance requires an action.");
    }
    if (maintaining || activeActivities !== 0) {
      throw admissionDenied("SPS Desktop plugin artifact activity is in progress.");
    }
    return runTracked(action, () => { maintaining = true; }, () => { maintaining = false; });
  }

  function waitForIdle() {
    // Joining operations neither joins uncertainty nor grants cleanup permission.
    return Promise.all([...scopes]);
  }

  return Object.freeze({
    withActivity,
    withMaintenance,
    assertAdmissionAllowed,
    waitForIdle,
    retainUncertainty,
  });
}
