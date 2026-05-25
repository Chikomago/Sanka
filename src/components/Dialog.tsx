import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";
import "./Dialog.css";

export type DialogType = "success" | "error" | "warning" | "info";

interface AlertDialogProps {
    open: boolean;
    type?: DialogType;
    title?: string;
    message: string;
    onClose: () => void;
}

export function AlertDialog({ open, type = "info", title, message, onClose }: AlertDialogProps) {
    if (!open) return null;

    const icons = {
        success: <CheckCircle size={24} className="dialog-icon success" />,
        error: <AlertCircle size={24} className="dialog-icon error" />,
        warning: <AlertTriangle size={24} className="dialog-icon warning" />,
        info: <Info size={24} className="dialog-icon info" />,
    };

    const defaultTitles = {
        success: "成功",
        error: "错误",
        warning: "警告",
        info: "提示",
    };

    return (
        <div className="dialog-overlay" onClick={onClose}>
            <div className="dialog-content glass" onClick={(e) => e.stopPropagation()}>
                <button className="dialog-close" onClick={onClose}>
                    <X size={18} />
                </button>
                <div className="dialog-body">
                    {icons[type]}
                    <div className="dialog-text">
                        <h3 className="dialog-title">{title || defaultTitles[type]}</h3>
                        <p className="dialog-message">{message}</p>
                    </div>
                </div>
                <div className="dialog-actions">
                    <button className="dialog-btn primary" onClick={onClose}>
                        确定
                    </button>
                </div>
            </div>
        </div>
    );
}

interface ConfirmDialogProps {
    open: boolean;
    type?: DialogType;
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export function ConfirmDialog({
    open,
    type = "warning",
    title,
    message,
    confirmText = "确定",
    cancelText = "取消",
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    if (!open) return null;

    const icons = {
        success: <CheckCircle size={24} className="dialog-icon success" />,
        error: <AlertCircle size={24} className="dialog-icon error" />,
        warning: <AlertTriangle size={24} className="dialog-icon warning" />,
        info: <Info size={24} className="dialog-icon info" />,
    };

    const defaultTitles = {
        success: "确认",
        error: "错误",
        warning: "确认操作",
        info: "提示",
    };

    return (
        <div className="dialog-overlay" onClick={onCancel}>
            <div className="dialog-content glass" onClick={(e) => e.stopPropagation()}>
                <button className="dialog-close" onClick={onCancel}>
                    <X size={18} />
                </button>
                <div className="dialog-body">
                    {icons[type]}
                    <div className="dialog-text">
                        <h3 className="dialog-title">{title || defaultTitles[type]}</h3>
                        <p className="dialog-message">{message}</p>
                    </div>
                </div>
                <div className="dialog-actions">
                    <button className="dialog-btn secondary" onClick={onCancel}>
                        {cancelText}
                    </button>
                    <button className="dialog-btn primary" onClick={onConfirm}>
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
