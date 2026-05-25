import { useState, useEffect, useRef, useMemo } from "react";
import { Trash2, Copy } from "lucide-react";
import {
    getGlobalLogs,
    clearGlobalLogs,
    subscribeGlobalLogs,
    LogEntry,
} from "../utils/globalLog";
import "./Logs.css";

type LogLevel = "ALL" | "INFO" | "ERROR";

export function LogsPage() {
    const [logs, setLogs] = useState<LogEntry[]>(getGlobalLogs);
    const [filterLevel, setFilterLevel] = useState<LogLevel>("ALL");
    const [activeSource, setActiveSource] = useState<string>("全部");
    const bodyRef = useRef<HTMLDivElement>(null);

    const sources = useMemo(() => {
        const sourceSet = new Set<string>(["全部"]);
        logs.forEach((log) => {
            if (log.source) {
                sourceSet.add(log.source);
            }
        });
        const arr = Array.from(sourceSet);
        const hasAll = arr.includes("全部");
        const others = arr.filter((s) => s !== "全部").sort();
        return hasAll ? ["全部", ...others] : others;
    }, [logs]);

    useEffect(() => {
        const unsubscribe = subscribeGlobalLogs(() => {
            setLogs(getGlobalLogs());
        });
        return unsubscribe;
    }, []);

    useEffect(() => {
        if (bodyRef.current) {
            bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
        }
    }, [logs]);

    const filteredLogs = logs.filter((l) => {
        if (filterLevel !== "ALL" && l.level !== filterLevel) return false;
        if (activeSource !== "全部" && l.source !== activeSource) return false;
        return true;
    });

    async function copyLogs() {
        const text = filteredLogs
            .map((entry) => {
                const source = entry.source ? `${entry.source} ` : "";
                return `${entry.timestamp} [${entry.level}] ${source}${entry.message}`;
            })
            .join("\n");
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const el = document.createElement("textarea");
            el.value = text;
            el.style.position = "fixed";
            el.style.opacity = "0";
            document.body.appendChild(el);
            el.focus();
            el.select();
            document.execCommand("copy");
            document.body.removeChild(el);
        }
    }

    function handleClear() {
        clearGlobalLogs();
        setLogs([]);
    }

    const levelColors: Record<"INFO" | "ERROR", string> = {
        INFO: "var(--accent-color)",
        ERROR: "var(--error)",
    };

    return (
        <div className="page-container">
            <div className="page-header">
                <div className="dash-header-row">
                    <div>
                        <h2 className="page-title">日志</h2>
                        <p className="page-subtitle">查看运行日志</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="header-icon-btn" onClick={copyLogs} title="复制日志">
                            <Copy size={16} />
                        </button>
                        <button className="header-icon-btn" onClick={handleClear} title="清空日志">
                            <Trash2 size={16} />
                        </button>
                    </div>
                </div>

                <div className="category-tabs" style={{ marginTop: 16 }}>
                    {sources.length > 1 && sources.map((src) => (
                        <button
                            key={src}
                            className={`category-tab ${activeSource === src ? "active" : ""}`}
                            onClick={() => setActiveSource(src)}
                        >
                            {src}
                        </button>
                    ))}
                    {sources.length > 1 && <div className="tab-divider" />}
                    {(["ALL", "INFO", "ERROR"] as const).map((lvl) => (
                        <button
                            key={lvl}
                            className={`category-tab ${filterLevel === lvl ? "active" : ""}`}
                            onClick={() => setFilterLevel(lvl)}
                        >
                            {lvl === "ALL" ? "全部" : lvl}
                        </button>
                    ))}
                </div>
            </div>

            <div className="log-page-body" ref={bodyRef}>
                {filteredLogs.length === 0 ? (
                    <div className="log-empty-state">
                        <p>暂无日志</p>
                    </div>
                ) : (
                    filteredLogs.map((entry, i) => (
                        <div className="log-entry" key={i}>
                            <span className="log-time">{entry.timestamp}</span>
                            <span
                                className="log-level-tag"
                                style={{ color: levelColors[entry.level] }}
                            >
                                [{entry.level}]
                            </span>
                            {entry.source && (
                                <span className="log-source">{entry.source}</span>
                            )}
                            <span className="log-msg">{entry.message}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
