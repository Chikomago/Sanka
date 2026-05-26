import { NavLink } from "react-router-dom";
import { LayoutGrid, Compass, Package, Settings, ScrollText, Github } from "lucide-react";

interface SidebarProps {
    hasUpdate?: boolean;
}

export function Sidebar({ hasUpdate }: SidebarProps) {
    return (
        <div className="sidebar">
            <div className="brand-title">
                <span className="brand-text">SANKA</span>
            </div>

            <nav className="nav-menu">
                <NavLink
                    to="/"
                    className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
                >
                    <LayoutGrid size={20} />
                    <span>工作台</span>
                </NavLink>

                <NavLink
                    to="/store"
                    className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
                >
                    <Compass size={20} />
                    <span>插件市场</span>
                </NavLink>

                <NavLink
                    to="/environment"
                    className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
                >
                    <Package size={20} />
                    <span>运行环境</span>
                </NavLink>



                <NavLink
                    to="/logs"
                    className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
                >
                    <ScrollText size={20} />
                    <span>日志</span>
                </NavLink>
            </nav>

            <div className="nav-menu sidebar-footer">
                <NavLink
                    to="/about"
                    className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
                    style={{ position: "relative" }}
                >
                    <Github size={20} />
                    <span>关于</span>
                    {hasUpdate && (
                        <div style={{
                            position: "absolute",
                            right: "12px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            backgroundColor: "var(--danger, #ef4444)",
                            boxShadow: "0 0 0 2px var(--bg-card, #1e1e2e)"
                        }} />
                    )}
                </NavLink>

                <NavLink
                    to="/settings"
                    className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
                >
                    <Settings size={20} />
                    <span>设置</span>
                </NavLink>
            </div>
        </div>
    );
}
