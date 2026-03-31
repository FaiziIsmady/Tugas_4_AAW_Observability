type LogLevel = "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

const SERVICE_NAME = "order-service";

function writeLog(level: LogLevel, message: string, fields: LogFields = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    service: SERVICE_NAME,
    level,
    message,
    ...fields,
  };

  const serialized = JSON.stringify(entry);

  if (level === "error") {
    console.error(serialized);
    return;
  }

  console.log(serialized);
}

export function logInfo(message: string, fields: LogFields = {}) {
  writeLog("info", message, fields);
}

export function logWarn(message: string, fields: LogFields = {}) {
  writeLog("warn", message, fields);
}

export function logError(message: string, fields: LogFields = {}) {
  writeLog("error", message, fields);
}
