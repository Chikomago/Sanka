import { listen } from "@tauri-apps/api/event";

export interface LogEntry {
    timestamp: string;
    level: "INFO" | "ERROR";
    message: string;
    source?: string;
}

type LogLevel = "INFO" | "ERROR";

const MAX_LOGS = 1000;
let logs: LogEntry[] = [];
let listeners: Set<() => void> = new Set();
let initialized = false;

const SYSTEM_SOURCES = ["Store", "Environment", "Python", "Bun", "About", "Settings"];

function pushLog(id: string, message: string, stream: string) {
    console.log("[GlobalLog] Received log:", id, message, stream);
    const level: LogLevel = stream === "STDERR" ? "ERROR" : "INFO";

    // Map non-system sources (like plugin IDs) to "Dashboard"
    const source = SYSTEM_SOURCES.includes(id) ? id : "Dashboard";

    const newLog: LogEntry = {
        timestamp: new Date().toLocaleTimeString(),
        level,
        message,
        source,
    };
    logs = [...logs, newLog];
    if (logs.length > MAX_LOGS) {
        logs = logs.slice(-MAX_LOGS);
    }
    listeners.forEach((fn) => fn());
}

function handleWebLog(event: Event) {
    const payload = (event as CustomEvent<{ id: string; message: string; stream: string }>).detail;
    console.log("[GlobalLog] Web log event:", payload);
    if (!payload) return;
    pushLog(payload.id, payload.message, payload.stream);
}

export function initGlobalLog() {
    if (initialized) return;
    initialized = true;

    listen<{ id: string; message: string; stream: string }>(
        "tool-log",
        (event) => {
            const { id, message, stream } = event.payload;
            pushLog(id, message, stream);
        }
    );

    window.addEventListener("tool-log-web", handleWebLog as EventListener);
    console.log("[GlobalLog] Initialized");
}

export function getGlobalLogs(): LogEntry[] {
    return logs;
}

export function clearGlobalLogs(): void {
    logs = [];
    listeners.forEach((fn) => fn());
}

export function subscribeGlobalLogs(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

initGlobalLog();
