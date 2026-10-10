function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function textParam(params, key, fallback = "") {
  const value = asRecord(params)[key];
  return value === undefined || value === null ? fallback : String(value).trim();
}

function createCollaborationReadiness({
  fs,
  os,
  path,
  codexRoomSandbox,
  codexRoomApprovalPolicy,
  defaultAgyCommand,
  loopbackSPSApiUrl,
  environmentVariable = process.env
}) {
  if (!fs || !os || !path || typeof codexRoomSandbox !== "function" || typeof codexRoomApprovalPolicy !== "function" || typeof defaultAgyCommand !== "function" || typeof loopbackSPSApiUrl !== "function") {
    throw new TypeError("createCollaborationReadiness requires explicit runtime dependencies.");
  }

  function getRuntimeConfigFromContext(ctx) {
    return Promise.resolve(ctx.config.get()).then((rawConfig) => {
      const config = asRecord(rawConfig);
      return {
        enabled: config.enableCodexRooms !== false,
        enableCodexRooms: config.enableCodexRooms !== false,
        enableAgyRooms: config.enableAgyRooms !== false,
        command: textParam(config, "codexCommand", "codex"),
        model: textParam(config, "codexModel", "") || null,
        codexHome: textParam(config, "codexHome", "") || null,
        codexSandbox: codexRoomSandbox(textParam(config, "codexRoomSandbox", "danger-full-access")),
        codexApprovalPolicy: codexRoomApprovalPolicy(textParam(config, "codexRoomApprovalPolicy", "never")),
        enableAgyQuotaFallback: config.enableAgyQuotaFallback === true,
        agyFallbackCommand: textParam(config, "agyFallbackCommand", defaultAgyCommand()),
        agyFallbackModel: textParam(config, "agyFallbackModel", "gemini-3.1-pro-high"),
        agyFallbackPrintTimeout: textParam(config, "agyFallbackPrintTimeout", "2h"),
        agyFallbackTimeoutMs: Math.max(0, Number(config.agyFallbackTimeoutSec) || 0) * 1000,
        enableTaskAssignment: config.enableTaskAssignment !== false,
        spsApiUrl: loopbackSPSApiUrl(
          environmentVariable.SPS_ROOM_API_URL
          || textParam(config, "spsApiUrl", textParam(config, "paperclipApiUrl", "http://127.0.0.1:3100"))
        )
      };
    });
  }

  function isLoopbackHost(host) {
    return new Set(["127.0.0.1", "localhost", "::1"]).has(String(host || "").trim().toLowerCase());
  }

  function instanceConfigPath() {
    const configured = String(environmentVariable.PAPERCLIP_CONFIG_PATH || "").trim();
    return configured || path.join(os.homedir(), ".sps", "instances", "default", "config.json");
  }

  function environmentHasAuthenticationSecret(environmentPath) {
    try {
      const lines = fs.readFileSync(environmentPath, "utf8").split(/\r?\n/);
      return lines.some((line) => {
        const match = /^\s*(BETTER_AUTH_SECRET|PAPERCLIP_AGENT_JWT_SECRET)\s*=\s*(.*)$/.exec(line);
        if (!match) return false;
        return match[2].trim().replace(/^['\"]|['\"]$/g, "").length > 0;
      });
    } catch {
      return false;
    }
  }

  function collaborationReadinessFromConfig(config, { hasAuthenticationSecret = false } = {}) {
    const server = asRecord(asRecord(config).server);
    const auth = asRecord(asRecord(config).auth);
    const deploymentMode = textParam(server, "deploymentMode", "local_trusted");
    const exposure = textParam(server, "exposure", "private");
    const listenHost = textParam(server, "host", "127.0.0.1");
    const inferredBind = isLoopbackHost(listenHost) ? "loopback" : new Set(["0.0.0.0", "::"]).has(listenHost) ? "lan" : "custom";
    const bind = textParam(server, "bind", inferredBind);
    const port = Number(server.port) || 3100;
    const allowedHostnames = Array.isArray(server.allowedHostnames)
      ? server.allowedHostnames.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
    const checks = [];
    const warnings = [];
    const localOnlySafeDefault = deploymentMode === "local_trusted" && bind === "loopback";

    if (localOnlySafeDefault) {
      checks.push({ label: "접속 방식", status: "pass", message: "로컬 전용 모드가 이 컴퓨터에 안전하게 묶여 있습니다." });
    } else if (deploymentMode === "authenticated") {
      checks.push({
        label: "인증 비밀값",
        status: hasAuthenticationSecret ? "pass" : "fail",
        message: hasAuthenticationSecret
          ? "인증 비밀값이 설정되어 있습니다."
          : "인증 접속에는 SPS .env 파일의 BETTER_AUTH_SECRET 또는 PAPERCLIP_AGENT_JWT_SECRET가 필요합니다."
      });
    } else {
      checks.push({ label: "접속 방식", status: "fail", message: "로컬 밖에서 접속하려면 인증 모드를 사용해야 합니다." });
    }

    if (deploymentMode === "authenticated" && exposure === "private") {
      if (bind === "tailnet") {
        checks.push({ label: "비공개 네트워크", status: "pass", message: "Tailnet 비공개 협업이 설정되어 있습니다." });
      } else if (bind === "lan") {
        checks.push({ label: "비공개 네트워크", status: "warn", message: "인증된 LAN 접속이 설정되어 있습니다. 신뢰할 수 있는 LAN 밖의 협업자는 Tailnet을 권장합니다." });
      } else {
        checks.push({ label: "비공개 네트워크", status: "fail", message: "비공개 협업에는 Tailnet 또는 신뢰할 수 있는 LAN 연결이 필요합니다." });
      }
      checks.push({
        label: "신뢰할 수 있는 호스트 이름",
        status: allowedHostnames.length > 0 ? "pass" : "fail",
        message: allowedHostnames.length > 0
          ? `신뢰할 수 있는 비공개 호스트 이름 ${allowedHostnames.length}개가 설정되어 있습니다.`
          : "협업자를 초대하기 전에 Tailnet DNS 이름 또는 신뢰할 수 있는 비공개 호스트 이름을 추가하세요."
      });
    }

    if (deploymentMode === "authenticated" && exposure === "public") {
      const publicBaseUrl = textParam(auth, "publicBaseUrl");
      const hasHttpsBaseUrl = textParam(auth, "baseUrlMode") === "explicit" && publicBaseUrl.startsWith("https://");
      checks.push({
        label: "공개 URL",
        status: hasHttpsBaseUrl ? "pass" : "fail",
        message: hasHttpsBaseUrl
          ? "공개 HTTPS URL이 설정되어 있습니다."
          : "공개 접속에는 명시적인 HTTPS auth.publicBaseUrl이 필요합니다."
      });
    }

    const hasFailures = checks.some((check) => check.status === "fail");
    const collaborationReady = deploymentMode === "authenticated" && bind !== "loopback" && !hasFailures;
    const state = localOnlySafeDefault ? "local_only" : collaborationReady ? "collaboration_ready" : "configuration_incomplete";
    const recommendation = state === "local_only"
      ? "개인 작업 준비가 완료됐습니다. 친구를 초대할 때는 이 컴퓨터를 직접 노출하지 말고 인증된 비공개 Tailnet 접속을 설정하세요."
      : state === "collaboration_ready"
        ? "협업자를 Operator로 초대한 뒤, 두 사람이 함께 브라우저 접속 확인을 마치세요."
        : "실패한 항목을 고친 뒤 Workplane을 다시 시작하고, 협업자를 초대하기 전에 이 확인을 다시 실행하세요.";

    return {
      state,
      localOnlySafeDefault,
      collaborationReady,
      server: { deploymentMode, exposure, bind, listenHost, port, allowedHostnameCount: allowedHostnames.length },
      checks,
      warnings,
      recommendation
    };
  }

  function readCollaborationReadiness() {
    try {
      const configPath = instanceConfigPath();
      if (!fs.existsSync(configPath)) {
        return {
          state: "configuration_unavailable",
          localOnlySafeDefault: false,
          collaborationReady: false,
          server: null,
          checks: [{ label: "SPS configuration", status: "fail", message: "The local SPS configuration file was not found." }],
          warnings: [],
          recommendation: "Start the Workplane once to create its local configuration, then check this page again."
        };
      }
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      const environmentPath = path.join(path.dirname(configPath), ".env");
      return collaborationReadinessFromConfig(config, { hasAuthenticationSecret: environmentHasAuthenticationSecret(environmentPath) });
    } catch {
      return {
        state: "configuration_unavailable",
        localOnlySafeDefault: false,
        collaborationReady: false,
        server: null,
        checks: [{ label: "SPS configuration", status: "fail", message: "The local SPS configuration could not be read." }],
        warnings: [],
        recommendation: "Fix the local SPS configuration, restart the Workplane, then check this page again."
      };
    }
  }

  return Object.freeze({
    getRuntimeConfig: getRuntimeConfigFromContext,
    collaborationReadinessFromConfig,
    readCollaborationReadiness,
    isLoopbackHost,
    paperclipInstanceConfigPath: instanceConfigPath,
    environmentHasAuthenticationSecret
  });
}

export { createCollaborationReadiness };
